'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  PlusCircle,
  Send,
  Loader2,
  Percent,
  Euro,
  CheckCircle2,
  AlertTriangle,
  ClipboardList,
  Truck,
  Plus,
  Trash2,
  Settings,
  Star,
  Save,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import type { Quote, Job } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  deleteField,
  serverTimestamp,
  FieldPath,
} from 'firebase/firestore';

/* ---------------------------------------------
 Helpers
--------------------------------------------- */

function humanizeJobKey(jobKey?: string | null): string {
  if (!jobKey) return 'Klus';
  switch (jobKey) {
    case 'hsb-voorzetwand':
      return 'HSB voorzetwand';
    default:
      return jobKey.replace(/-/g, ' ');
  }
}

function resolvePresetLabelForUI(presetLabel?: string | null) {
  const v = (presetLabel ?? '').trim();
  if (!v) return null;
  if (v.toLowerCase() === 'nieuw') return null;
  return v;
}

function jobIsComplete(job: any): boolean {
  const selections = job?.materialen?.selections;
  const hasSelections =
    selections &&
    typeof selections === 'object' &&
    Object.keys(selections).length > 0;

  const presetLabel = job?.werkwijze?.presetLabel;
  const hasWerkwijzePreset =
    !!presetLabel && presetLabel.trim().toLowerCase() !== 'nieuw';

  return hasSelections || hasWerkwijzePreset;
}

/* ---------------------------------------------
 EURO input helpers (NL style)
--------------------------------------------- */

function formatEuroNL(raw: string): string {
  let v = raw.replace(/[^\d,]/g, '');

  const firstComma = v.indexOf(',');
  if (firstComma !== -1) {
    const before = v.slice(0, firstComma + 1);
    const after = v.slice(firstComma + 1).replace(/,/g, '');
    v = before + after;
  }

  const [intRaw, decRaw] = v.split(',');

  let intPart = (intRaw ?? '').replace(/^0+(?=\d)/, '');
  if (intPart === '') intPart = '0';

  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  if (decRaw !== undefined) {
    const dec = decRaw.slice(0, 2);
    return `${intFormatted},${dec}`;
  }

  return intFormatted;
}

function euroNLToNumberOrNull(v: string) {
  const s = (v ?? '').trim();
  if (!s) return null;

  const normalized = s.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function numberToEuroInputString(n: number | null | undefined) {
  if (n === null || n === undefined) return '';
  if (!Number.isFinite(n)) return '';
  return formatEuroNL(String(n).replace('.', ','));
}

/* ---------------------------------------------
 UI component: € prefix that never disappears
--------------------------------------------- */

function EuroInput(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  id?: string;
}) {
  const {
    value,
    onChange,
    placeholder = '0,00',
    className,
    inputClassName,
    disabled,
    id,
  } = props;

  const [focused, setFocused] = useState(false);
  const hasValue = (value ?? '').trim() !== '' && (value ?? '').trim() !== '0';

  return (
    <div className={cn('relative', className)}>
      <span
        className={cn(
          'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm transition-colors',
          focused || hasValue ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        €
      </span>

      <Input
        id={id}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(formatEuroNL(e.target.value))}
        placeholder={placeholder}
        className={cn('pl-7', inputClassName)}
      />
    </div>
  );
}

/* ---------------------------------------------
 Types
--------------------------------------------- */

type BouwplaatsPer = 'dag' | 'week' | 'klus';

type BouwplaatsItem = {
  id: string;
  naam: string;
  prijs: string;
  per: BouwplaatsPer;
  isVast: boolean;
};

type TransportMode = 'perKm' | 'fixed' | 'none';
type WinstMargeMode = 'percentage' | 'fixed' | 'none';

type WinstMargeState = {
  mode: WinstMargeMode;
  percentage: number | null;
  fixedAmount: number | null;
};

type StandaardTransport = {
  mode: TransportMode;
  prijsPerKm?: number | null;
  vasteTransportkosten?: number | null;
};

type StandaardWinstMarge = {
  mode: WinstMargeMode;
  percentage?: number | null;
  fixedAmount?: number | null;
};

type BouwplaatsKostenPakket = {
  id: string;
  naam: string;
  items: Array<{
    id: string;
    naam: string;
    prijs: number;
    per: BouwplaatsPer;
    isVast: boolean;
  }>;
};

type GebruikerInstellingen = {
  defaultsConfirmed?: boolean;
  standaardTransport?: StandaardTransport | null;
  standaardWinstMarge?: StandaardWinstMarge | null;
  bouwplaatsKostenPakketten?: BouwplaatsKostenPakket[];
  bouwplaatsKostenStandaardId?: string | null;
};

/* ---------------------------------------------
 Bouwplaatskosten helpers
--------------------------------------------- */

function maakBouwplaatsId() {
  return `bk_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function defaultBouwplaatskosten(): BouwplaatsItem[] {
  return [];
}

function slugify(value: string) {
  return (value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
}

function maakPakketId() {
  return `pakket_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function itemsNaarPakket(items: BouwplaatsItem[]) {
  const mapped = items
    .map((m) => {
      const naam = (m.naam ?? '').trim();
      const prijs = euroNLToNumberOrNull(m.prijs);
      if (!naam) return null;
      if (prijs === null || prijs <= 0) return null;

      return {
        id: m.id,
        naam,
        prijs,
        per: m.per,
        isVast: m.isVast,
      };
    })
    .filter(Boolean) as BouwplaatsKostenPakket['items'];

  return mapped;
}

function pakketNaarItems(
  pakket: BouwplaatsKostenPakket | null | undefined
): BouwplaatsItem[] {
  if (!pakket) return defaultBouwplaatskosten();

  const basis = defaultBouwplaatskosten();
  const basisIds = new Set(basis.map((b) => b.id));

  const mapped: BouwplaatsItem[] = (pakket.items ?? []).map((i) => ({
    id: String(i.id),
    naam: String(i.naam ?? '').trim(),
    prijs: numberToEuroInputString(typeof i.prijs === 'number' ? i.prijs : null),
    per: (i.per as BouwplaatsPer) || 'klus',
    isVast: !!i.isVast,
  }));

  const has = new Set(mapped.map((x) => x.id));
  const merged = [
    ...basis.map((b) =>
      has.has(b.id)
        ? (mapped.find((x) => x.id === b.id) as BouwplaatsItem)
        : b
    ),
    ...mapped.filter((x) => !basisIds.has(x.id)),
  ];

  return merged;
}

/* ---------------------------------------------
 Page
--------------------------------------------- */

export default function OverzichtPage() {
  const params = useParams();
  const router = useRouter();
  const quoteId = params.id as string;

  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Job delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<{ id: string; title: string } | null>(null);
  const [isDeletingJob, setIsDeletingJob] = useState(false);

  // Transport
  const [transportMode, setTransportMode] = useState<TransportMode>('perKm');
  const [prijsPerKm, setPrijsPerKm] = useState('');
  const [vasteTransportkosten, setVasteTransportkosten] = useState('');

  // Bouwplaatskosten
  const [bouwplaatskosten, setBouwplaatskosten] = useState<BouwplaatsItem[]>([]);


  // Packs (user-level)
  const [pakketten, setPakketten] = useState<BouwplaatsKostenPakket[]>([]);
  const [geselecteerdPakketId, setGeselecteerdPakketId] = useState<string>('');
  const [standaardPakketId, setStandaardPakketId] = useState<string>('');

  // Winstmarge
  const [winstMarge, setWinstMarge] = useState<WinstMargeState>({
    mode: 'percentage',
    percentage: 10,
    fixedAmount: null,
  });

  // User settings (standaarden)
  const [defaultsConfirmed, setDefaultsConfirmed] = useState(false);
  const [standaardTransport, setStandaardTransport] = useState<StandaardTransport | null>(null);
  const [standaardWinstMarge, setStandaardWinstMarge] = useState<StandaardWinstMarge | null>(null);

  // Modals (gescheiden scope)
  const [transportInstellingenOpen, setTransportInstellingenOpen] = useState(false);
  const [winstInstellingenOpen, setWinstInstellingenOpen] = useState(false);
  const [bouwplaatsBeheerOpen, setBouwplaatsBeheerOpen] = useState(false);
  const [bouwplaatsOpslaanOpen, setBouwplaatsOpslaanOpen] = useState(false);

  // First-time popup
  const [standaardenPopupOpen, setStandaardenPopupOpen] = useState(false);
  const [popupSaveTransport, setPopupSaveTransport] = useState(true);
  const [popupSaveWinst, setPopupSaveWinst] = useState(true);

  // Bouwplaats: opslaan modal state
  const [pakketNaamInput, setPakketNaamInput] = useState('');
  const [overschrijfHuidigPakket, setOverschrijfHuidigPakket] = useState(true);

  // Bouwplaats beheer
  const [nieuwPakketNaam, setNieuwPakketNaam] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Auto-save control
  const isHydratingRef = useRef(true);
  const lastSavedJsonRef = useRef<string>('');
  const saveTimerRef = useRef<any>(null);

  /* ---------------------------------------------
   Firestore refs + veilige user instellingen read/write
  --------------------------------------------- */

  function userRef() {
    return doc(firestore as any, 'users', (user as any).uid);
  }

  async function leesGebruikerInstellingen(): Promise<GebruikerInstellingen> {
    if (!firestore || !user) return {};
    try {
      const ref = userRef();
      const snap = await getDoc(ref);
      if (!snap.exists()) return {};
      const data = snap.data() as any;
      const instellingen = (data?.instellingen ?? {}) as GebruikerInstellingen;
      return instellingen ?? {};
    } catch (e: any) {
      console.warn('Kon users/{uid} instellingen niet lezen (waarschijnlijk rules):', e?.message || e);
      return {};
    }
  }

  async function schrijfGebruikerInstellingen(partial: Partial<GebruikerInstellingen>) {
    if (!firestore || !user) return;
  
    const ref = userRef();
  
    // 1) UpdateDoc: dotted paths zijn hier WEL correct (nested update)
    const updates: any = {};
    for (const [k, v] of Object.entries(partial)) {
      updates[`instellingen.${k}`] = v;
    }
    updates.updatedAt = serverTimestamp();
  
    try {
      await updateDoc(ref, updates);
  
      // cleanup: verwijder oude "instellingen.xxx" velden die ooit per ongeluk als literal zijn opgeslagen
      await cleanupFouteDotVelden(ref);
  
      return;
    } catch (e1: any) {
      // 2) Fallback setDoc: GEEN dotted keys gebruiken -> nested object schrijven
      try {
        await setDoc(
          ref,
          {
            instellingen: { ...partial },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
  
        // cleanup (ook na setDoc)
        await cleanupFouteDotVelden(ref);
      } catch (e2: any) {
        console.warn(
          'Kon users/{uid} instellingen niet schrijven (waarschijnlijk rules):',
          e2?.message || e2
        );
      }
    }
  }
  
  // Verwijdert de foute velden met punt in de veldnaam: "instellingen.defaultsConfirmed", etc.
  async function cleanupFouteDotVelden(ref: any) {
    try {
      await updateDoc(
        ref,
        new FieldPath('instellingen.defaultsConfirmed'),
        deleteField(),
        new FieldPath('instellingen.standaardTransport'),
        deleteField(),
        new FieldPath('instellingen.standaardWinstMarge'),
        deleteField(),
        new FieldPath('instellingen.bouwplaatsKostenPakketten'),
        deleteField(),
        new FieldPath('instellingen.bouwplaatsKostenStandaardId'),
        deleteField()
      );
    } catch {
      // ignore
    }
  }
  
  /* ---------------------------------------------
   Fetch quote + hydrate + user defaults (veilig)
  --------------------------------------------- */

  useEffect(() => {
    if (isUserLoading || !user || !firestore) return;

    const fetchAlles = async () => {
      setLoading(true);
      setError(null);

      try {
        const qRef = doc(firestore, 'quotes', quoteId);
        const snap = await getDoc(qRef);

        if (!snap.exists()) {
          setError('Offerte niet gevonden.');
          return;
        }

        const data = snap.data() as Quote;

        const ownerUid = (data as any)?.klantinformatie?.userId;
        if (!ownerUid) {
          setError('Geen eigenaar gevonden bij deze offerte.');
          return;
        }

        if (ownerUid !== (user as any).uid) {
          setError('Geen toegang tot deze offerte.');
          return;
        }

        setQuote(data);

        // Jobs
        const extractedJobs: any[] = [];
        const klussen: any = (data as any).klussen;

        if (klussen && typeof klussen === 'object') {
          for (const klusId in klussen) {
            const container: any = klussen[klusId] || {};

            const klusinformatie = container.klusinformatie ?? {};
            const materialen = container.materialen ?? {};
            const werkwijze = container.werkwijze ?? null;
            const kleinMateriaal = container.kleinMateriaal ?? null;
            const meta = container.meta ?? null;

            const jobKey =
              (materialen?.jobKey as string | undefined) ||
              (meta?.slug as string | undefined) ||
              (meta?.jobKey as string | undefined) ||
              (klusinformatie?.slug as string | undefined) ||
              (klusinformatie?.jobKey as string | undefined) ||
              'klus';

            extractedJobs.push({
              id: klusId,
              quoteId,
              klusId,
              jobKey,
              meta,
              klusinformatie,
              materialen,
              werkwijze,
              kleinMateriaal,
              createdAt: container.createdAt ?? null,
              updatedAt: container.updatedAt ?? null,
            });
          }
        }

        setJobs(extractedJobs as any);

        // User instellingen (veilig)
        const instellingen = await leesGebruikerInstellingen();

        setDefaultsConfirmed(!!instellingen.defaultsConfirmed);
        setStandaardTransport((instellingen.standaardTransport as any) ?? null);
        setStandaardWinstMarge((instellingen.standaardWinstMarge as any) ?? null);

        const packs = Array.isArray(instellingen.bouwplaatsKostenPakketten)
          ? (instellingen.bouwplaatsKostenPakketten as BouwplaatsKostenPakket[])
          : [];
        setPakketten(packs);

        const stdPackId = (instellingen.bouwplaatsKostenStandaardId ?? '') as string;
        setStandaardPakketId(stdPackId || '');
        setGeselecteerdPakketId(stdPackId || '');

        // Quote extras
        const extras: any = (data as any)?.extras ?? null;

        // UI defaults
        setTransportMode('perKm');
        setPrijsPerKm('');
        setVasteTransportkosten('');
        setBouwplaatskosten([]);
        setWinstMarge({ mode: 'percentage', percentage: 10, fixedAmount: null });

        const heeftTransportInQuote = !!extras?.transport;
        const heeftWinstInQuote = !!extras?.winstMarge;
        const heeftBouwplaatsInQuote = Array.isArray(extras?.materieel) && extras.materieel.length > 0;

        // Transport: quote extras, anders user standaard
        const applyTransport = (t: any) => {
          const mode = (t?.mode as TransportMode) ?? 'perKm';
          if (mode === 'perKm') {
            setTransportMode('perKm');
            setPrijsPerKm(numberToEuroInputString(t?.prijsPerKm ?? null));
            setVasteTransportkosten('');
          } else if (mode === 'fixed') {
            setTransportMode('fixed');
            setVasteTransportkosten(numberToEuroInputString(t?.vasteTransportkosten ?? null));
            setPrijsPerKm('');
          } else {
            setTransportMode('none');
            setPrijsPerKm('');
            setVasteTransportkosten('');
          }
        };

        if (heeftTransportInQuote) applyTransport(extras.transport);
        else if (instellingen.standaardTransport) applyTransport(instellingen.standaardTransport);

        // Winstmarge: quote extras, anders user standaard
        const applyWinst = (w: any) => {
          const mode = (w?.mode as WinstMargeMode) ?? 'percentage';
          if (mode === 'percentage') {
            const p = typeof w?.percentage === 'number' ? w.percentage : 10;
            setWinstMarge({ mode: 'percentage', percentage: p, fixedAmount: null });
          } else if (mode === 'fixed') {
            const f = typeof w?.fixedAmount === 'number' ? w.fixedAmount : null;
            setWinstMarge({ mode: 'fixed', percentage: null, fixedAmount: f });
          } else {
            setWinstMarge({ mode: 'none', percentage: null, fixedAmount: null });
          }
        };

        if (heeftWinstInQuote) applyWinst(extras.winstMarge);
        else if (instellingen.standaardWinstMarge) applyWinst(instellingen.standaardWinstMarge);

        // Bouwplaatskosten: quote extras, anders standaard pakket
        if (heeftBouwplaatsInQuote) {
          const mArr: any[] = Array.isArray(extras.materieel) ? extras.materieel : [];
          const mapped: BouwplaatsItem[] = mArr.map((m: any, idx: number) => ({
            id: String(m.id ?? `bk_saved_${idx}_${Date.now()}`),
            naam: String(m.naam ?? '').trim(),
            per: (m.per as BouwplaatsPer) || 'klus',
            isVast: !!m.isVast,
            prijs: numberToEuroInputString(typeof m.prijs === 'number' ? m.prijs : null),
          }));

          const basis = defaultBouwplaatskosten();
          const has = new Set(mapped.map((x) => x.id));
          const merged = [
            ...basis.map((b) =>
              has.has(b.id) ? (mapped.find((x) => x.id === b.id) as BouwplaatsItem) : b
            ),
            ...mapped.filter((x) => !['steiger', 'container', 'aanhanger'].includes(x.id)),
          ];
          setBouwplaatskosten(merged);
        } else {
          const gekozen = packs.find((p) => p.id === stdPackId) ?? null;
          if (gekozen) setBouwplaatskosten(pakketNaarItems(gekozen));
        }

        isHydratingRef.current = false;
      } catch (err: any) {
        console.error('Overzicht fetchAlles error:', err);
        setError('Kon offerte niet laden.');
      } finally {
        setLoading(false);
      }
    };

    fetchAlles();
  }, [quoteId, firestore, user, isUserLoading]);

  /* ---------------------------------------------
   Validatie
  --------------------------------------------- */

  const prijsPerKmNum = useMemo(() => euroNLToNumberOrNull(prijsPerKm), [prijsPerKm]);
  const vasteTransportNum = useMemo(() => euroNLToNumberOrNull(vasteTransportkosten), [vasteTransportkosten]);

  const transportIsValid = useMemo(() => {
    if (transportMode === 'none') return true;
    if (transportMode === 'perKm') return prijsPerKmNum !== null && prijsPerKmNum > 0;
    if (transportMode === 'fixed') return vasteTransportNum !== null && vasteTransportNum > 0;
    return false;
  }, [transportMode, prijsPerKmNum, vasteTransportNum]);

  const winstMode = winstMarge.mode;

  const winstMargeIsValid = useMemo(() => {
    if (winstMode === 'none') return true;
    if (winstMode === 'percentage') return typeof winstMarge.percentage === 'number' && winstMarge.percentage > 0;
    if (winstMode === 'fixed') return typeof winstMarge.fixedAmount === 'number' && winstMarge.fixedAmount > 0;
    return false;
  }, [winstMarge, winstMode]);

  const stats = useMemo(() => {
    const totaal = jobs.length;
    const compleet = jobs.filter((j: any) => jobIsComplete(j)).length;
    const incompleet = Math.max(0, totaal - compleet);

    return {
      totaal,
      compleet,
      incompleet,
      transportIsValid,
      winstMargeIsValid,
      isReady: totaal > 0 && incompleet === 0 && transportIsValid && winstMargeIsValid,
    };
  }, [jobs, transportIsValid, winstMargeIsValid]);

  const primaryHint = useMemo(() => {
    if (stats.totaal === 0) return 'Voeg minimaal 1 klus toe.';
    if (stats.incompleet > 0) return 'Er zijn nog onvolledige klussen. Werk ze eerst af.';
    if (!stats.transportIsValid) return 'Transport is niet ingevuld. Kies “Geen” of vul een bedrag in.';
    if (!stats.winstMargeIsValid) return 'Winstmarge is niet ingevuld. Kies “Geen” of vul een bedrag/percentage in.';
    return 'Je kunt de offerte indienen voor berekening.';
  }, [stats]);

  const statusVariant = useMemo(() => {
    if (stats.totaal === 0) return 'warn';
    if (stats.incompleet > 0) return 'error';
    if (!stats.transportIsValid) return 'error';
    if (!stats.winstMargeIsValid) return 'error';
    return 'success';
  }, [stats]);

  /* ---------------------------------------------
   Sparse payload builders (quote extras)
  --------------------------------------------- */

  function buildTransportSparse() {
    if (transportMode === 'none') return null;

    if (transportMode === 'perKm') {
      if (prijsPerKmNum === null || prijsPerKmNum <= 0) return null;
      return { mode: 'perKm', prijsPerKm: prijsPerKmNum };
    }

    if (vasteTransportNum === null || vasteTransportNum <= 0) return null;
    return { mode: 'fixed', vasteTransportkosten: vasteTransportNum };
  }

  function buildWinstSparse() {
    if (winstMode === 'none') return null;

    if (winstMode === 'percentage') {
      const p = winstMarge.percentage;
      if (typeof p !== 'number' || p <= 0) return null;
      return { mode: 'percentage', percentage: p };
    }

    const f = winstMarge.fixedAmount;
    if (typeof f !== 'number' || f <= 0) return null;
    return { mode: 'fixed', fixedAmount: f };
  }

  function buildBouwplaatsSparse() {
    const items = bouwplaatskosten
      .map((m) => {
        const naam = (m.naam ?? '').trim();
        const prijs = euroNLToNumberOrNull(m.prijs);

        const naamOk = naam !== '';
        const prijsOk = prijs !== null && prijs > 0;

        if (!naamOk && !prijsOk) return null;
        if (!prijsOk) return null;

        return {
          id: m.id,
          naam: naamOk ? naam : 'Bouwplaatskosten',
          per: m.per,
          prijs,
          isVast: m.isVast,
        };
      })
      .filter(Boolean) as any[];

    return items.length > 0 ? items : null;
  }

  /* ---------------------------------------------
   Firestore save (debounced) - quote extras sparse + deleteField
  --------------------------------------------- */

  const saveExtrasToFirestore = async (forceToast: boolean) => {
    if (!firestore || !user || !quoteId) return;
    if (isHydratingRef.current) return;

    const transport = buildTransportSparse();
    const winstMargeSparse = buildWinstSparse();
    const bouwplaatsSparse = buildBouwplaatsSparse();

    const updates: any = {
      updatedAt: serverTimestamp(),
    };

    const hasAny = !!transport || !!winstMargeSparse || !!bouwplaatsSparse;

    if (!hasAny) {
      updates.extras = deleteField();
    } else {
      updates['extras.transport'] = transport ? transport : deleteField();
      updates['extras.winstMarge'] = winstMargeSparse ? winstMargeSparse : deleteField();
      updates['extras.materieel'] = bouwplaatsSparse ? bouwplaatsSparse : deleteField();
    }

    const stateForCompare = JSON.stringify({
      transport: transport ?? undefined,
      winstMarge: winstMargeSparse ?? undefined,
      bouwplaats: bouwplaatsSparse ?? undefined,
      hasAny,
    });

    if (!forceToast && stateForCompare === lastSavedJsonRef.current) return;

    const ref = doc(firestore, 'quotes', quoteId);
    await updateDoc(ref, updates);

    lastSavedJsonRef.current = stateForCompare;

    if (forceToast) {
      toast({ title: 'Opgeslagen', description: 'Extra’s zijn opgeslagen.' });
    }
  };

  useEffect(() => {
    if (!quote) return;
    if (!firestore || !user) return;
    if (isHydratingRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveExtrasToFirestore(false).catch((err) => console.error('Autosave extras error:', err));
    }, 800);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    quoteId,
    quote,
    transportMode,
    prijsPerKm,
    vasteTransportkosten,
    JSON.stringify(bouwplaatskosten),
    winstMarge.mode,
    winstMarge.percentage,
    winstMarge.fixedAmount,
  ]);

  /* ---------------------------------------------
   Handlers: bouwplaatskosten (regels)
  --------------------------------------------- */

  const handleBouwplaatsChange = (
    id: string,
    field: keyof Pick<BouwplaatsItem, 'naam' | 'prijs' | 'per'>,
    value: string
  ) => {
    setBouwplaatskosten((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const handleAddExtraBouwplaats = () => {
    setBouwplaatskosten((prev) => [
      ...prev,
      { id: maakBouwplaatsId(), naam: '', prijs: '', per: 'klus', isVast: false },
    ]);
  };

  const handleRemoveBouwplaats = (id: string) => {
    setBouwplaatskosten((prev) => prev.filter((m) => m.id !== id));
  };

  const handleSelectPakket = (pakketId: string) => {
    setGeselecteerdPakketId(pakketId);
    const gekozen = pakketten.find((p) => p.id === pakketId) ?? null;
    setBouwplaatskosten(pakketNaarItems(gekozen));
  };

  /* ---------------------------------------------
   Handlers: standaarden (user instellingen)
  --------------------------------------------- */

  function buildStandaardTransportVanUI(): StandaardTransport | null {
    if (transportMode === 'none') return { mode: 'none' };
    if (transportMode === 'perKm') {
      if (prijsPerKmNum === null || prijsPerKmNum <= 0) return null;
      return { mode: 'perKm', prijsPerKm: prijsPerKmNum };
    }
    if (vasteTransportNum === null || vasteTransportNum <= 0) return null;
    return { mode: 'fixed', vasteTransportkosten: vasteTransportNum };
  }

  function buildStandaardWinstVanUI(): StandaardWinstMarge | null {
    if (winstMode === 'none') return { mode: 'none' };
    if (winstMode === 'percentage') {
      const p = winstMarge.percentage;
      if (typeof p !== 'number' || p <= 0) return null;
      return { mode: 'percentage', percentage: p };
    }
    const f = winstMarge.fixedAmount;
    if (typeof f !== 'number' || f <= 0) return null;
    return { mode: 'fixed', fixedAmount: f };
  }

  async function saveTransportStandaardAlleen() {
    const st = buildStandaardTransportVanUI();
    if (!st) {
      toast({
        variant: 'destructive',
        title: 'Ongeldig',
        description: 'Vul eerst een geldig transportbedrag in (of kies “Geen”).',
      });
      return;
    }

    await schrijfGebruikerInstellingen({
      defaultsConfirmed: true,
      standaardTransport: st,
    });

    setDefaultsConfirmed(true);
    setStandaardTransport(st);
    toast({ title: 'Opgeslagen', description: 'Transport standaard is bijgewerkt.' });
  }

  async function saveWinstStandaardAlleen() {
    const sw = buildStandaardWinstVanUI();
    if (!sw) {
      toast({
        variant: 'destructive',
        title: 'Ongeldig',
        description: 'Vul eerst een geldige winstmarge in (of kies “Geen”).',
      });
      return;
    }

    await schrijfGebruikerInstellingen({
      defaultsConfirmed: true,
      standaardWinstMarge: sw,
    });

    setDefaultsConfirmed(true);
    setStandaardWinstMarge(sw);
    toast({ title: 'Opgeslagen', description: 'Winstmarge standaard is bijgewerkt.' });
  }

  async function bevestigDefaultsZonderOpslaan() {
    await schrijfGebruikerInstellingen({ defaultsConfirmed: true });
    setDefaultsConfirmed(true);
  }

  /* ---------------------------------------------
   Bouwplaats: pakket opslaan (nieuw / overschrijven)
  --------------------------------------------- */

  function openBouwplaatsOpslaan() {
    const huidig = pakketten.find((p) => p.id === geselecteerdPakketId) ?? null;

    setOverschrijfHuidigPakket(!!huidig);
    setPakketNaamInput(huidig?.naam ?? '');
    setBouwplaatsOpslaanOpen(true);
  }

  async function opslaanBouwplaatsAlsNieuw(naamFromUi?: string) {
    const naam = (naamFromUi ?? pakketNaamInput ?? '').trim();
    if (!naam) {
      toast({ variant: 'destructive', title: 'Naam ontbreekt', description: 'Geef het pakket een naam.' });
      return;
    }

    const items = itemsNaarPakket(bouwplaatskosten);
    if (items.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Geen items',
        description: 'Vul minimaal 1 bouwplaatskosten regel met prijs in.',
      });
      return;
    }

    const nieuw: BouwplaatsKostenPakket = {
      id: maakPakketId(),
      naam,
      items,
    };

    const next = [nieuw, ...(pakketten ?? [])];
    setPakketten(next);
    setGeselecteerdPakketId(nieuw.id);

    await schrijfGebruikerInstellingen({
      bouwplaatsKostenPakketten: next,
    });

    toast({ title: 'Opgeslagen', description: `Pakket “${naam}” is toegevoegd.` });
    setBouwplaatsOpslaanOpen(false);
  }

  async function overschrijfHuidigPakketNu() {
    const huidig = pakketten.find((p) => p.id === geselecteerdPakketId) ?? null;
    if (!huidig) {
      toast({ variant: 'destructive', title: 'Geen pakket geselecteerd', description: 'Kies eerst een pakket om te overschrijven.' });
      return;
    }

    const items = itemsNaarPakket(bouwplaatskosten);
    if (items.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Geen items',
        description: 'Vul minimaal 1 bouwplaatskosten regel met prijs in.',
      });
      return;
    }

    const naam = (pakketNaamInput ?? huidig.naam ?? '').trim();
    if (!naam) {
      toast({ variant: 'destructive', title: 'Naam ontbreekt', description: 'Geef het pakket een naam.' });
      return;
    }

    const updated: BouwplaatsKostenPakket = {
      ...huidig,
      naam,
      items,
    };

    const next = (pakketten ?? []).map((p) => (p.id === huidig.id ? updated : p));
    setPakketten(next);

    await schrijfGebruikerInstellingen({
      bouwplaatsKostenPakketten: next,
    });

    toast({ title: 'Opgeslagen', description: `Pakket “${naam}” is bijgewerkt.` });
    setBouwplaatsOpslaanOpen(false);
  }

  /* ---------------------------------------------
   Bouwplaats: pakket beheer (standaard / verwijderen / nieuw)
  --------------------------------------------- */

  async function savePakketAlsNieuwVanBeheer() {
    const naam = (nieuwPakketNaam ?? '').trim();
    if (!naam) {
      toast({ variant: 'destructive', title: 'Naam ontbreekt', description: 'Geef het pakket een naam.' });
      return;
    }

    const items = itemsNaarPakket(bouwplaatskosten);
    if (items.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Geen items',
        description: 'Vul minimaal 1 bouwplaatskosten regel met prijs in.',
      });
      return;
    }

    const nieuw: BouwplaatsKostenPakket = {
      id: maakPakketId(),
      naam,
      items,
    };

    const next = [nieuw, ...(pakketten ?? [])];
    setPakketten(next);
    setNieuwPakketNaam('');
    setGeselecteerdPakketId(nieuw.id);

    await schrijfGebruikerInstellingen({
      bouwplaatsKostenPakketten: next,
    });

    toast({ title: 'Opgeslagen', description: `Pakket “${naam}” is toegevoegd.` });
  }

  async function maakPakketStandaard(id: string) {
    setStandaardPakketId(id);
    await schrijfGebruikerInstellingen({ bouwplaatsKostenStandaardId: id });
    toast({ title: 'Standaard ingesteld', description: 'Dit pakket wordt standaard gebruikt.' });
  }

  async function verwijderPakket(id: string) {
    const next = (pakketten ?? []).filter((p) => p.id !== id);
    setPakketten(next);

    let nextStd = standaardPakketId;
    if (standaardPakketId === id) {
      nextStd = '';
      setStandaardPakketId('');
    }

    if (geselecteerdPakketId === id) {
      const nextSelected = nextStd || '';
      setGeselecteerdPakketId(nextSelected);
      const gekozen = next.find((p) => p.id === nextSelected) ?? null;
      setBouwplaatskosten(pakketNaarItems(gekozen));
    }

    await schrijfGebruikerInstellingen({
      bouwplaatsKostenPakketten: next,
      bouwplaatsKostenStandaardId: nextStd || null,
    });

    toast({ title: 'Verwijderd', description: 'Pakket is verwijderd.' });
  }

  /* ---------------------------------------------
   Jobs / delete
  --------------------------------------------- */

  const handleAddJob = () => {
    if (!quoteId) return;
    router.push(`/offertes/${quoteId}/klus/nieuw`);
  };

  const openDeleteDialogForJob = (job: any) => {
    const rawKey =
      job?.klusinformatie?.title?.trim?.() ||
      job?.meta?.title?.trim?.() ||
      job?.materialen?.jobKey?.trim?.() ||
      job?.jobKey ||
      '';
    const title = humanizeJobKey(rawKey);
    setJobToDelete({ id: job.id, title });
    setDeleteDialogOpen(true);
  };

  const confirmDeleteJob = async () => {
    if (!firestore || !user || !quoteId || !jobToDelete) return;
    if (isDeletingJob) return;

    setIsDeletingJob(true);

    try {
      const ref = doc(firestore, 'quotes', quoteId);

      await updateDoc(ref, {
        [`klussen.${jobToDelete.id}`]: deleteField(),
        updatedAt: serverTimestamp(),
      } as any);

      setJobs((prev) => prev.filter((j: any) => j.id !== jobToDelete.id));

      toast({ title: 'Klus verwijderd', description: 'De klus is definitief verwijderd uit de offerte.' });

      setDeleteDialogOpen(false);
      setJobToDelete(null);
    } catch (err: any) {
      console.error('Delete job error:', err);
      toast({
        variant: 'destructive',
        title: 'Verwijderen mislukt',
        description: err?.message || 'Kon de klus niet verwijderen.',
      });
    } finally {
      setIsDeletingJob(false);
    }
  };

  /* ---------------------------------------------
   Finish: generate (met 1x standaarden popup)
  --------------------------------------------- */

  const transportPopupLabel = useMemo(() => {
    if (transportMode === 'none') return 'Geen';
    if (transportMode === 'perKm') return `€ ${prijsPerKm || '—'} / km`;
    return `€ ${vasteTransportkosten || '—'} (vast)`;
  }, [transportMode, prijsPerKm, vasteTransportkosten]);

  const winstPopupLabel = useMemo(() => {
    if (winstMode === 'none') return 'Geen';
    if (winstMode === 'percentage') return `${winstMarge.percentage ?? '—'}%`;
    return `€ ${numberToEuroInputString(winstMarge.fixedAmount) || '—'} (vast)`;
  }, [winstMode, winstMarge]);

  async function echteGenerate() {
    if (!quote) {
      toast({ variant: 'destructive', title: 'Fout', description: 'Geen offerte gevonden om te versturen.' });
      return;
    }
    if (isSubmitting) return;

    if (!stats.isReady) {
      toast({ variant: 'destructive', title: 'Niet compleet', description: primaryHint });
      return;
    }

    setIsSubmitting(true);

    try {
      await saveExtrasToFirestore(false);

      const transport = buildTransportSparse();
      const winstMargeSparse = buildWinstSparse();
      const bouwplaatsSparse = buildBouwplaatsSparse();

      const extras: any = {};
      if (transport) extras.transport = transport;
      if (winstMargeSparse) extras.winstMarge = winstMargeSparse;
      if (bouwplaatsSparse) extras.materieel = bouwplaatsSparse;

      const idToken =
        typeof (user as any)?.getIdToken === 'function'
          ? await (user as any).getIdToken().catch(() => null)
          : null;

      const res = await fetch('/api/offerte/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          quoteId,
          extras,
        }),
      });

      const text = await res.text().catch(() => '');
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      if (!res.ok) {
        const msg =
          (data && typeof data === 'object' && (data.error || data.detail))
            ? `${data.error ?? 'Fout'}${data.detail ? ` - ${data.detail}` : ''}`
            : `Server fout: ${res.status}${text ? ` - ${String(text).slice(0, 200)}` : ''}`;
        throw new Error(msg);
      }

      toast({ title: 'Offerte verzonden', description: 'De offerte is doorgestuurd naar verwerking.' });
      router.push('/landing');
    } catch (err: any) {
      console.error('Generate error:', err);
      toast({
        variant: 'destructive',
        title: 'Genereren mislukt',
        description: err?.message || 'Kon offerte niet versturen.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleFinishQuote = async () => {
    if (!stats.isReady) {
      toast({ variant: 'destructive', title: 'Niet compleet', description: primaryHint });
      return;
    }

    if (!defaultsConfirmed) {
      setPopupSaveTransport(true);
      setPopupSaveWinst(true);
      setStandaardenPopupOpen(true);
      return;
    }

    await echteGenerate();
  };

  async function bevestigPopupEnGaVerder() {
    try {
      if (popupSaveTransport || popupSaveWinst) {
        const partial: Partial<GebruikerInstellingen> = { defaultsConfirmed: true };

        if (popupSaveTransport) {
          const st = buildStandaardTransportVanUI();
          if (st) partial.standaardTransport = st;
        }
        if (popupSaveWinst) {
          const sw = buildStandaardWinstVanUI();
          if (sw) partial.standaardWinstMarge = sw;
        }

        await schrijfGebruikerInstellingen(partial);
        setDefaultsConfirmed(true);
        if (partial.standaardTransport) setStandaardTransport(partial.standaardTransport as any);
        if (partial.standaardWinstMarge) setStandaardWinstMarge(partial.standaardWinstMarge as any);
      } else {
        await bevestigDefaultsZonderOpslaan();
      }
    } catch {
      setDefaultsConfirmed(true);
    } finally {
      setStandaardenPopupOpen(false);
      await echteGenerate();
    }
  }

  /* ---------------------------------------------
   Render states
  --------------------------------------------- */

  if (loading || isUserLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Overzicht laden…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive">Fout</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error}</p>
            <div className="pt-4">
              <Button variant="outline" onClick={() => router.push('/landing')}>
                Terug
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ---------------------------------------------
   UI
  --------------------------------------------- */

  return (
    <main className="flex min-h-screen flex-col">
      {/* Delete klus dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Klus verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Je staat op het punt om{' '}
              <span className="font-medium">{jobToDelete?.title ?? 'deze klus'}</span>{' '}
              definitief te verwijderen. Dit kan niet ongedaan gemaakt worden.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingJob}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDeleteJob();
              }}
              disabled={isDeletingJob}
              className={cn('bg-red-600 text-white hover:bg-red-700', isDeletingJob && 'opacity-70')}
            >
              {isDeletingJob ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verwijderen…
                </>
              ) : (
                'Ja, verwijderen'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 1x popup: standaarden opslaan */}
      <AlertDialog open={standaardenPopupOpen} onOpenChange={setStandaardenPopupOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Standaarden opslaan?</AlertDialogTitle>
            <AlertDialogDescription>
              Wil je deze instellingen als standaard gebruiken voor volgende offertes?
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 pt-1">
            <div className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-sm">Transport</div>
                  <div className="text-xs text-muted-foreground">{transportPopupLabel}</div>
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={popupSaveTransport}
                    onChange={(e) => setPopupSaveTransport(e.target.checked)}
                  />
                  Opslaan
                </label>
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-sm">Winstmarge</div>
                  <div className="text-xs text-muted-foreground">{winstPopupLabel}</div>
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={popupSaveWinst}
                    onChange={(e) => setPopupSaveWinst(e.target.checked)}
                  />
                  Opslaan
                </label>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Je kunt dit later per onderdeel aanpassen via het{' '}
              <span className="font-medium">tandwiel-icoon</span>.
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={(e) => {
                e.preventDefault();
                bevestigDefaultsZonderOpslaan()
                  .catch(() => {})
                  .finally(() => {
                    setStandaardenPopupOpen(false);
                  });
              }}
            >
              Alleen offerte genereren
            </AlertDialogCancel>

            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                bevestigPopupEnGaVerder();
              }}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Opslaan & offerte genereren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transport instellingen (alleen transport) */}
      <AlertDialog open={transportInstellingenOpen} onOpenChange={setTransportInstellingenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transport instellingen</AlertDialogTitle>
            <AlertDialogDescription>
              Sla dit transport op als standaard voor volgende offertes.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-sm">Huidige keuze</div>
                <div className="text-xs text-muted-foreground">{transportPopupLabel}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                Standaard: <span className="font-medium">{standaardTransport ? 'ingesteld' : '—'}</span>
              </div>
            </div>
          </div>

          <AlertDialogFooter>
  <AlertDialogCancel asChild>
    <Button variant="secondary">
      Sluiten
    </Button>
  </AlertDialogCancel>

  <AlertDialogAction asChild>
    <Button
      variant="success"
      onClick={(e) => {
        e.preventDefault();
        saveTransportStandaardAlleen()
          .then(() => setTransportInstellingenOpen(false))
          .catch(() => {});
      }}
    >
      Opslaan als standaard
    </Button>
  </AlertDialogAction>
</AlertDialogFooter>

        </AlertDialogContent>
      </AlertDialog>

      {/* Winstmarge instellingen (alleen winstmarge) */}
      <AlertDialog open={winstInstellingenOpen} onOpenChange={setWinstInstellingenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Winstmarge instellingen</AlertDialogTitle>
            <AlertDialogDescription>
              Sla deze winstmarge op als standaard voor volgende offertes.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-sm">Huidige keuze</div>
                <div className="text-xs text-muted-foreground">{winstPopupLabel}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                Standaard: <span className="font-medium">{standaardWinstMarge ? 'ingesteld' : '—'}</span>
              </div>
            </div>
          </div>

          <AlertDialogFooter>
  <AlertDialogCancel asChild>
    <Button variant="secondary">
      Sluiten
    </Button>
  </AlertDialogCancel>

  <AlertDialogAction asChild>
    <Button
      variant="success"
      onClick={(e) => {
        e.preventDefault();
        saveWinstStandaardAlleen()
          .then(() => setWinstInstellingenOpen(false))
          .catch(() => {});
      }}
    >
      Opslaan als standaard
    </Button>
  </AlertDialogAction>
</AlertDialogFooter>

        </AlertDialogContent>
      </AlertDialog>

      {/* Bouwplaats: Opslaan als pakket (nieuw/overschrijven) */}
      <AlertDialog open={bouwplaatsOpslaanOpen} onOpenChange={setBouwplaatsOpslaanOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bouwplaatskosten opslaan</AlertDialogTitle>
            <AlertDialogDescription>
              Sla de huidige bouwplaatskosten op als pakket.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Pakketnaam</Label>
              <Input
                value={pakketNaamInput}
                onChange={(e) => setPakketNaamInput(e.target.value)}
                placeholder="Bijv. Binnenstad renovatie"
              />
            </div>

            <div className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm">Overschrijven</div>
                  <div className="text-xs text-muted-foreground">
                    {geselecteerdPakketId
                      ? 'Werk het geselecteerde pakket bij.'
                      : 'Geen pakket geselecteerd.'}
                  </div>
                </div>

                <label className={cn('flex items-center gap-2 text-sm select-none', !geselecteerdPakketId && 'opacity-50')}>
                  <input
                    type="checkbox"
                    disabled={!geselecteerdPakketId}
                    checked={!!geselecteerdPakketId && overschrijfHuidigPakket}
                    onChange={(e) => setOverschrijfHuidigPakket(e.target.checked)}
                  />
                  Ja
                </label>
              </div>
            </div>
          </div>


          <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
  <AlertDialogCancel asChild>
    <Button variant="secondary">Sluiten</Button>
  </AlertDialogCancel>

  <AlertDialogAction asChild>
    <Button
      variant="success"
      onClick={(e) => {
        e.preventDefault();
        opslaanBouwplaatsAlsNieuw().catch(() => {});
      }}
    >
      Opslaan als nieuw
    </Button>
  </AlertDialogAction>

  <AlertDialogAction asChild>
    <Button
      variant="outline"
      disabled={!geselecteerdPakketId || !overschrijfHuidigPakket}
      onClick={(e) => {
        e.preventDefault();
        overschrijfHuidigPakketNu().catch(() => {});
      }}
    >
      Overschrijven
    </Button>
  </AlertDialogAction>
</AlertDialogFooter>
</AlertDialogContent>
</AlertDialog>


      {/* Bouwplaats: Beheer pakketten (alleen bouwplaatskosten) */}
      <AlertDialog open={bouwplaatsBeheerOpen} onOpenChange={setBouwplaatsBeheerOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Bouwplaatskosten pakketten</AlertDialogTitle>
            <AlertDialogDescription>
              Maak standaard, verwijder of voeg een nieuw pakket toe.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-6">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="font-medium text-sm">Nieuw pakket maken (van huidige bouwplaatskosten)</div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <div className="sm:col-span-8">
                  <Input
                    value={nieuwPakketNaam}
                    onChange={(e) => setNieuwPakketNaam(e.target.value)}
                    placeholder="Naam, bijv. Binnenstad renovatie"
                  />
                </div>
                <div className="sm:col-span-4 flex gap-2">
                  <Button
                    type="button"
                    className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={async () => {
                      if (isSavingSettings) return;
                      setIsSavingSettings(true);
                      try {
                        await savePakketAlsNieuwVanBeheer();
                      } finally {
                        setIsSavingSettings(false);
                      }
                    }}
                    disabled={isSavingSettings}
                  >
                    Opslaan als nieuw
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {pakketten.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  Nog geen pakketten. Maak er één via “Opslaan als nieuw”.
                </p>
              ) : (
                pakketten.map((p) => {
                  const isStd = p.id === standaardPakketId;

                  return (
                    <div
                      key={p.id}
                      className={cn(
                        'flex items-center justify-between gap-3 rounded-lg border p-3',
                        isStd && 'border-emerald-500/40 bg-emerald-500/10'
                      )}
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{p.naam}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.items?.length ?? 0} regels
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={cn(isStd ? 'text-emerald-400' : 'text-muted-foreground hover:text-foreground')}
                          onClick={() => maakPakketStandaard(p.id)}
                        >
                          <Star className="mr-2 h-4 w-4" />
                          Maak standaard
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300"
                          onClick={() => verwijderPakket(p.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Verwijderen
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <AlertDialogFooter>
  <AlertDialogCancel asChild>
    <Button variant="secondary">
      Sluiten
    </Button>
  </AlertDialogCancel>

  <AlertDialogAction asChild>
  <Button variant="success">Oké</Button>

  </AlertDialogAction>
</AlertDialogFooter>


        </AlertDialogContent>
      </AlertDialog>

      <div className="flex-1 px-4 py-6 md:py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="grid grid-cols-3 items-center">
            <div>
              <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Terug">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>

            <div className="text-center">
              <h1 className="font-semibold text-lg">Overzicht & extra’s</h1>
            </div>

            <div />
          </div>

          <div
            className={cn(
              'rounded-lg border px-4 py-3 text-sm',
              statusVariant === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
              statusVariant === 'warn' && 'border-amber-500/30 bg-amber-500/10 text-amber-200',
              statusVariant === 'error' && 'border-red-500/30 bg-red-500/10 text-red-200'
            )}
          >
            <div className="flex items-start gap-3">
              <ClipboardList className="mt-0.5 h-4 w-4 opacity-80" />
              <div>
                <div className="font-medium">Status</div>
                <div className="text-xs opacity-90">{primaryHint}</div>
              </div>
            </div>
          </div>

          {/* Klussen */}
          <Card className="border-muted/60">
            <CardHeader className="pb-3">
              <CardTitle>Huidige klussen</CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {jobs.length === 0 && (
                <p className="text-sm text-muted-foreground italic text-center py-6">
                  Er zijn nog geen klussen toegevoegd.
                </p>
              )}

              {jobs.map((job: any) => {
                const rawKey =
                  job?.klusinformatie?.title?.trim?.() ||
                  job?.meta?.title?.trim?.() ||
                  job?.materialen?.jobKey?.trim?.() ||
                  job?.jobKey ||
                  '';

                const title = humanizeJobKey(rawKey);
                const preset = resolvePresetLabelForUI(job?.werkwijze?.presetLabel ?? null);
                const isComplete = jobIsComplete(job);

                const type =
                  job?.klusinformatie?.type ||
                  job?.materialen?.jobType ||
                  job?.meta?.type ||
                  'wanden';

                const slug =
                  job?.materialen?.jobSlug ||
                  job?.meta?.slug ||
                  slugify(title);

                const bewerkenHref = `/offertes/${quoteId}/klus/${job.id}/${type}/${slug}`;

                return (
                  <div
                    key={job.id}
                    className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium truncate">{title}</p>
                      <p className="text-sm text-muted-foreground">
                        Werkwijze:{' '}
                        <span className={cn(!preset && 'opacity-60')}>
                          {preset ?? '—'}
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2.5 py-1 text-xs',
                          isComplete
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            : 'border-red-500/30 bg-red-500/10 text-red-300'
                        )}
                      >
                        {isComplete ? (
                          <>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                            Ingesteld
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                            Onvolledig
                          </>
                        )}
                      </span>

                      <Link href={bewerkenHref} prefetch={false}>
                        <Button variant="outline" size="sm">Bewerken</Button>
                      </Link>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => openDeleteDialogForJob(job)}
                        aria-label="Klus verwijderen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}

<Button
  variant="successGhost"
  onClick={handleAddJob}
  className="w-full transition-colors duration-150 ease-out"
>
  <PlusCircle className="mr-2 h-4 w-4" />
  Nog een klus toevoegen
</Button>

            </CardContent>
          </Card>

          {/* Transport */}
          <Card className="border-muted/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Transport</CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setTransportInstellingenOpen(true)}
                  aria-label="Transport instellingen"
                >
                  <Settings className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer transition-colors md:col-span-1',
                  transportMode === 'perKm' && transportIsValid && 'border-emerald-500/40 bg-emerald-500/10',
                  transportMode === 'perKm' && !transportIsValid && 'border-red-500/40 bg-red-500/10',
                  transportMode !== 'perKm' && 'hover:border-muted-foreground/30'
                )}
                onClick={() => setTransportMode('perKm')}
                role="button"
                tabIndex={0}
              >
                <h4 className="font-semibold flex items-center">
                  <Truck className="mr-2 h-4 w-4" /> Prijs per km
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">Afstand automatisch berekend.</p>

                {transportMode === 'perKm' && (
                  <div className="mt-3">
                    <Label className="text-xs">Tarief per km</Label>
                    <EuroInput value={prijsPerKm} onChange={setPrijsPerKm} className="mt-1" placeholder="0,00" />
                    {!transportIsValid && (
                      <p className="mt-2 text-xs text-red-300">Vul een tarief in of kies “Geen”.</p>
                    )}
                  </div>
                )}
              </div>

              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer transition-colors md:col-span-1',
                  transportMode === 'fixed' && transportIsValid && 'border-emerald-500/40 bg-emerald-500/10',
                  transportMode === 'fixed' && !transportIsValid && 'border-red-500/40 bg-red-500/10',
                  transportMode !== 'fixed' && 'hover:border-muted-foreground/30'
                )}
                onClick={() => setTransportMode('fixed')}
                role="button"
                tabIndex={0}
              >
                <h4 className="font-semibold flex items-center">
                  <Euro className="mr-2 h-4 w-4" /> Vast bedrag
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">Eén bedrag voor transport.</p>

                {transportMode === 'fixed' && (
                  <div className="mt-3">
                    <Label className="text-xs">Bedrag</Label>
                    <EuroInput value={vasteTransportkosten} onChange={setVasteTransportkosten} className="mt-1" placeholder="0,00" />
                    {!transportIsValid && (
                      <p className="mt-2 text-xs text-red-300">Vul een bedrag in of kies “Geen”.</p>
                    )}
                  </div>
                )}
              </div>

              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer transition-colors md:col-span-1',
                  transportMode === 'none' ? 'border-emerald-500/40 bg-emerald-500/10' : 'hover:border-muted-foreground/30'
                )}
                onClick={() => setTransportMode('none')}
                role="button"
                tabIndex={0}
              >
                <h4 className="font-semibold">Geen</h4>
                <p className="mt-1 text-xs text-muted-foreground">Geen transportkosten rekenen.</p>
              </div>
            </CardContent>
          </Card>

         {/* Bouwplaatskosten */}
<Card className="border-muted/60">
  <CardHeader className="pb-3 relative overflow-hidden">
    <div className="flex items-start justify-between gap-4 flex-wrap">
      {/* Links: titel + beschrijving */}
      <div className="flex flex-col gap-1 min-w-0">
        <CardTitle>Bouwplaatskosten</CardTitle>

        <p className="text-xs leading-snug text-muted-foreground">
          Voor kosten zoals steigerhuur, container of aanhanger.
          <br />
          Ook parkeer- en overige bouwplaatskosten.
        </p>
      </div>

      {/* Rechts: controls */}
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <Select
          value={geselecteerdPakketId || 'LEEG'}
          onValueChange={(v) => {
            if (!v || v === 'LEEG') {
              setGeselecteerdPakketId('');
              setBouwplaatskosten([]);
              return;
            }
            handleSelectPakket(v);
          }}
        >
          <SelectTrigger className="w-[220px] max-w-full">
            <SelectValue placeholder="Leeg (handmatig)" />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="LEEG">Leeg (handmatig)</SelectItem>

            {pakketten.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Nog geen pakketten
              </div>
            )}

            {pakketten.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.naam}
                {p.id === standaardPakketId ? ' (standaard)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground shrink-0"
          onClick={() => setBouwplaatsBeheerOpen(true)}
          aria-label="Bouwplaatskosten pakketten beheren"
        >
          <Settings className="h-5 w-5" />
        </Button>

        {/* Materialen-stijl "+ Toevoegen" (zelfde sizing) */}
        <button
          type="button"
          onClick={handleAddExtraBouwplaats}
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-2 min-h-[44px] bg-transparent text-emerald-500 hover:opacity-90 active:opacity-80"
          aria-label="Toevoegen"
        >
          <Plus className="h-4 w-4" />
          <span>Toevoegen</span>
        </button>
      </div>
    </div>
  </CardHeader>





            <CardContent className="space-y-4">
              {bouwplaatskosten.map((item) => (
                <div key={item.id} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  <div className="sm:col-span-4">
                    <Label className="text-xs sm:sr-only">Naam</Label>
                    {item.isVast ? (
                      <span className="text-sm">{item.naam}</span>
                    ) : (
                      <Input
                        value={item.naam}
                        onChange={(e) => handleBouwplaatsChange(item.id, 'naam', e.target.value)}
                        placeholder="Bijv. Hoogwerker / Gereedschap huur"
                      />
                    )}
                  </div>

                  <EuroInput
                    value={item.prijs}
                    onChange={(v) => handleBouwplaatsChange(item.id, 'prijs', v)}
                    className="sm:col-span-5"
                    placeholder="0,00"
                  />

                  <div className="sm:col-span-2">
                    <Select value={item.per} onValueChange={(v) => handleBouwplaatsChange(item.id, 'per', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dag">dag</SelectItem>
                        <SelectItem value="week">week</SelectItem>
                        <SelectItem value="klus">klus</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="sm:col-span-1 flex sm:justify-end">
                    {!item.isVast && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => handleRemoveBouwplaats(item.id)}
                        aria-label="Verwijderen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {/* Consistente “+ Toevoegen” (altijd: nieuwe regel) */}
              <Button
  type="button"
  variant="outline"
  onClick={openBouwplaatsOpslaan}
  className="w-full justify-center"
>
  <Save className="mr-2 h-4 w-4" />
  Huidige keuzes opslaan als pakket
</Button>


            </CardContent>
          </Card>

          {/* Winstmarge */}
          <Card className="border-muted/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Winstmarge</CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setWinstInstellingenOpen(true)}
                  aria-label="Winstmarge instellingen"
                >
                  <Settings className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer transition-colors',
                  winstMode === 'percentage' && winstMargeIsValid && 'border-emerald-500/40 bg-emerald-500/10',
                  winstMode === 'percentage' && !winstMargeIsValid && 'border-red-500/40 bg-red-500/10',
                  winstMode !== 'percentage' && 'hover:border-muted-foreground/30'
                )}
                onClick={() => setWinstMarge((p) => ({ ...p, mode: 'percentage' }))}
                role="button"
                tabIndex={0}
              >
                <h4 className="font-semibold flex items-center">
                  <Percent className="mr-2 h-4 w-4" /> Percentage
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">Reken een percentage over de totale offerteprijs.</p>

                {winstMode === 'percentage' && (
                  <div className="mt-3">
                    <Label className="text-xs">Percentage</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        type="number"
                        value={winstMarge.percentage ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw.trim() === '') {
                            setWinstMarge((p) => ({ ...p, percentage: null }));
                            return;
                          }
                          const n = Number(raw);
                          setWinstMarge((p) => ({ ...p, percentage: Number.isFinite(n) ? n : null }));
                        }}
                        inputMode="decimal"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>

                    {!winstMargeIsValid && (
                      <p className="mt-2 text-xs text-red-300">Vul een percentage groter dan 0 in of kies “Geen”.</p>
                    )}
                  </div>
                )}
              </div>

              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer transition-colors',
                  winstMode === 'fixed' && winstMargeIsValid && 'border-emerald-500/40 bg-emerald-500/10',
                  winstMode === 'fixed' && !winstMargeIsValid && 'border-red-500/40 bg-red-500/10',
                  winstMode !== 'fixed' && 'hover:border-muted-foreground/30'
                )}
                onClick={() => setWinstMarge((p) => ({ ...p, mode: 'fixed' }))}
                role="button"
                tabIndex={0}
              >
                <h4 className="font-semibold flex items-center">
                  <Euro className="mr-2 h-4 w-4" /> Vast bedrag
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">Voeg één vast bedrag toe als marge.</p>

                {winstMode === 'fixed' && (
                  <div className="mt-3">
                    <Label className="text-xs">Bedrag</Label>
                    <EuroInput
                      value={numberToEuroInputString(winstMarge.fixedAmount)}
                      onChange={(v) => {
                        const n = euroNLToNumberOrNull(v);
                        setWinstMarge((p) => ({ ...p, fixedAmount: n === null ? null : n }));
                      }}
                      className="mt-1"
                      placeholder="0,00"
                    />

                    {!winstMargeIsValid && (
                      <p className="mt-2 text-xs text-red-300">Vul een bedrag groter dan 0 in of kies “Geen”.</p>
                    )}
                  </div>
                )}
              </div>

              <div
                className={cn(
                  'p-4 rounded-lg border cursor-pointer transition-colors',
                  winstMode === 'none' ? 'border-emerald-500/40 bg-emerald-500/10' : 'hover:border-muted-foreground/30'
                )}
                onClick={() => setWinstMarge({ mode: 'none', percentage: null, fixedAmount: null })}
                role="button"
                tabIndex={0}
              >
                <h4 className="font-semibold">Geen</h4>
                <p className="mt-1 text-xs text-muted-foreground">Geen winstmarge toevoegen.</p>
              </div>
            </CardContent>
          </Card>

          {/* Sticky bottom bar (geen globale settings knop meer) */}
          <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 backdrop-blur-sm">
            <div className="mx-auto max-w-3xl px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
            <div className="font-medium">
  Na indienen wordt de offerte berekend
</div>


  <div className="text-xs text-muted-foreground">
  Verwachte tijd: 30–60 min • Verstuurd via e-mail of WhatsApp

  </div>
</div>


              <Button
                onClick={handleFinishQuote}
                disabled={isSubmitting || !stats.isReady}
                className={cn(
                  'w-full sm:w-auto',
                  'bg-emerald-600 text-white hover:bg-emerald-700',
                  (!stats.isReady || isSubmitting) && 'opacity-60'
                )}
              >
                {isSubmitting ? (
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
) : (
  <Send className="mr-2 h-4 w-4" />
)}
{isSubmitting ? 'Indienen…' : 'Offerte indienen'}


              </Button>
            </div>
          </div>

          <div className="h-6" />
        </div>
      </div>
    </main>
  );
}
