/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities, react-hooks/exhaustive-deps, prefer-const */
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Send,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Settings,
  Star,
  Pencil,
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
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { PersonalNotes } from '@/components/PersonalNotes';
import { WizardHeader } from '@/components/WizardHeader';

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
  // Legacy support
  const selections = job?.materialen?.selections;
  const hasSelections =
    selections &&
    typeof selections === 'object' &&
    Object.keys(selections).length > 0;

  // New structure support
  const materialenLijst = job?.materialen?.materialen_lijst;
  const hasMaterialenLijst =
    materialenLijst &&
    typeof materialenLijst === 'object' &&
    Object.keys(materialenLijst).length > 0;

  // Check preset usage (legacy label or new ID)
  const presetLabel = job?.werkwijze?.presetLabel;
  const hasWerkwijzePreset =
    !!presetLabel && presetLabel.trim().toLowerCase() !== 'nieuw';

  const workMethodId = job?.werkwijze?.workMethodId;
  const hasWorkMethodId = !!workMethodId && workMethodId !== 'default';

  return hasSelections || hasMaterialenLijst || hasWerkwijzePreset || hasWorkMethodId;
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
        className={cn('pl-7 text-right', inputClassName)}
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
  basis: 'totaal' | 'materialen' | 'materialen_arbeid';
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
  basis?: 'totaal' | 'materialen' | 'materialen_arbeid';
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
  return [
    { id: 'steiger', naam: 'Steiger', prijs: '', per: 'week', isVast: false },
    { id: 'hoogwerker', naam: 'Hoogwerker', prijs: '', per: 'dag', isVast: false },
    { id: 'container', naam: 'Afvalcontainer', prijs: '', per: 'klus', isVast: false },
    { id: 'huurkosten', naam: 'Overige huurkosten', prijs: '', per: 'klus', isVast: false },
  ];
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
    basis: 'totaal',
  });

  // User settings (standaarden)
  const [defaultsConfirmed, setDefaultsConfirmed] = useState(false);
  const [standaardTransport, setStandaardTransport] = useState<StandaardTransport | null>(null);
  const [standaardWinstMarge, setStandaardWinstMarge] = useState<StandaardWinstMarge | null>(null);

  // Preset Names Cache
  const [presetNames, setPresetNames] = useState<Record<string, string>>({});

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
            const maatwerk = container.maatwerk ?? null;
            const maatwerkMeta = maatwerk?.meta ?? null;

            const jobKey =
              (materialen?.jobKey as string | undefined) ||
              (maatwerkMeta?.slug as string | undefined) ||
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
              maatwerk,
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
        setWinstMarge({ mode: 'percentage', percentage: 10, fixedAmount: null, basis: 'totaal' });

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
          const basis = (w?.basis as any) || 'totaal';

          if (mode === 'percentage') {
            const p = typeof w?.percentage === 'number' ? w.percentage : 10;
            setWinstMarge({ mode: 'percentage', percentage: p, fixedAmount: null, basis });
          } else if (mode === 'fixed') {
            const f = typeof w?.fixedAmount === 'number' ? w.fixedAmount : null;
            setWinstMarge({ mode: 'fixed', percentage: null, fixedAmount: f, basis: 'totaal' });
          } else {
            setWinstMarge({ mode: 'none', percentage: null, fixedAmount: null, basis: 'totaal' });
          }
        };

        if (heeftWinstInQuote) applyWinst(extras.winstMarge);
        else if (instellingen.standaardWinstMarge) applyWinst(instellingen.standaardWinstMarge);

        // Bouwplaatskosten: quote extras, anders standaard pakket
        if (heeftBouwplaatsInQuote) {
          const mArr: any[] = Array.isArray(extras.materieel) ? extras.materieel : [];

          // Map saved items
          const mapped: BouwplaatsItem[] = mArr.map((m: any, idx: number) => ({
            id: String(m.id ?? `bk_saved_${idx}_${Date.now()}`),
            naam: String(m.naam ?? '').trim(),
            per: (m.per as BouwplaatsPer) || 'klus',
            isVast: !!m.isVast,
            prijs: numberToEuroInputString(typeof m.prijs === 'number' ? m.prijs : null),
          }));

          const basis = defaultBouwplaatskosten();
          const basisIds = new Set(basis.map(b => b.id)); // ✅ Smart set of default IDs
          const has = new Set(mapped.map((x) => x.id));

          const merged = [
            // 1. Start with defaults (fill with saved data if available)
            ...basis.map((b) =>
              has.has(b.id) ? (mapped.find((x) => x.id === b.id) as BouwplaatsItem) : b
            ),
            // 2. Add any custom items that aren't defaults
            ...mapped.filter((x) => !basisIds.has(x.id)),
          ];
          setBouwplaatskosten(merged);
        } else {
          const gekozen = packs.find((p) => p.id === stdPackId) ?? null;
          // If no packet selected, load defaults
          setBouwplaatskosten(pakketNaarItems(gekozen));
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

  // Fetch Preset Names
  useEffect(() => {
    if (!jobs.length || !firestore || !user) return;

    const fetchPresets = async () => {
      // Check if we have any workMethodIds that need resolving
      const needed = jobs.some(j => (j as any).werkwijze?.workMethodId && (j as any).werkwijze.workMethodId !== 'default');
      if (!needed) return;

      try {
        const q = query(collection(firestore, 'presets'), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        const map: Record<string, string> = {};
        snap.forEach(d => {
          map[d.id] = d.data().name || '(Naamloos)';
        });
        setPresetNames(map);
      } catch (e) {
        console.error('Error fetching presets:', e);
      }
    };
    fetchPresets();
  }, [jobs, firestore, user]);

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
    if (!stats.transportIsValid) return 'Transport is niet ingevuld. Kies "Geen" of vul een bedrag in.';
    if (!stats.winstMargeIsValid) return 'Winstmarge is niet ingevuld. Kies "Geen" of vul een bedrag/percentage in.';
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
      return { mode: 'percentage', percentage: p, basis: winstMarge.basis };
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
      toast({ title: 'Opgeslagen', description: 'Extra\'s zijn opgeslagen.' });
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
    winstMarge.basis,
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
      return { mode: 'percentage', percentage: p, basis: winstMarge.basis };
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
        description: 'Vul eerst een geldig transportbedrag in (of kies "Geen").',
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
        description: 'Vul eerst een geldige winstmarge in (of kies "Geen").',
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

    toast({ title: 'Opgeslagen', description: `Pakket "${naam}" is toegevoegd.` });
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

    toast({ title: 'Opgeslagen', description: `Pakket "${naam}" is bijgewerkt.` });
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

    toast({ title: 'Opgeslagen', description: `Pakket "${naam}" is toegevoegd.` });
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
      job?.maatwerk?.meta?.title?.trim?.() ||
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
      router.push('/dashboard');
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

  // ✅ Segmented Toggle Component (matching HSB Voorzetwand 'Vorm' selector - slim horizontal control)
  const SegmentedToggle = ({
    options,
    value,
    onChange,
    error
  }: {
    options: { id: string; label: string; subtitle?: string }[];
    value: string;
    onChange: (id: string) => void;
    error?: boolean;
  }) => (
    <div className="grid gap-1 p-1 bg-black/20 rounded-xl border border-white/5" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((opt) => {
        const isActive = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              "flex items-center justify-center py-1.5 px-3 transition-all rounded-lg text-center text-xs font-medium",
              isActive && !error && "bg-emerald-600/20 text-emerald-400 shadow-sm ring-1 ring-emerald-500/50",
              isActive && error && "bg-red-500/20 text-red-400 shadow-sm ring-1 ring-red-500/50",
              !isActive && "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

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
              <Button variant="outline" onClick={() => router.push('/dashboard')}>
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
            <AlertDialogCancel asChild>
              <Button variant="ghost" disabled={isDeletingJob}>Annuleren</Button>
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDeleteJob();
              }}
              asChild
            >
              <Button
                variant="destructiveSoft"
                disabled={isDeletingJob}
                className={cn(isDeletingJob && 'opacity-70')}
              >
                {isDeletingJob ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verwijderen…
                  </>
                ) : (
                  'Verwijderen'
                )}
              </Button>
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
            <AlertDialogCancel asChild>
              <Button
                variant="secondary"
                onClick={(e) => {
                  e.preventDefault();
                  bevestigDefaultsZonderOpslaan()
                    .catch(() => { })
                    .finally(() => {
                      setStandaardenPopupOpen(false);
                    });
                }}
              >
                Alleen offerte genereren
              </Button>
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
                    .catch(() => { });
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
                    .catch(() => { });
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
                  opslaanBouwplaatsAlsNieuw().catch(() => { });
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
                  overschrijfHuidigPakketNu().catch(() => { });
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
                  Nog geen pakketten. Maak er één via "Opslaan als nieuw".
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

      {/* HEADER with PersonalNotes */}
      <WizardHeader
        title="Overzicht & extra's"
        backLink="/dashboard"
        progress={100}
        quoteId={quoteId}
        rightContent={
          loading ? (
            <div className="h-11 w-11 animate-pulse rounded-xl bg-muted/30" />
          ) : (
            <PersonalNotes quoteId={quoteId} context="Overzicht" />
          )
        }
      />


      <div className="flex-1 px-4 py-6 md:py-10 pb-32">
        <div className="mx-auto max-w-5xl space-y-8">

          {/* Klussen */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground px-1">Huidige Klussen</h2>

            <div className="rounded-xl bg-white/5 border border-white/5 overflow-hidden">
              {jobs.length === 0 && (
                <p className="text-sm text-muted-foreground italic text-center py-8">
                  Er zijn nog geen klussen toegevoegd.
                </p>
              )}

              {jobs.map((job: any, index: number) => {
                const rawKey =
                  job?.klusinformatie?.title?.trim?.() ||
                  job?.maatwerk?.meta?.title?.trim?.() ||
                  job?.meta?.title?.trim?.() ||
                  job?.materialen?.jobKey?.trim?.() ||
                  job?.jobKey ||
                  '';

                const title = humanizeJobKey(rawKey);
                let preset = resolvePresetLabelForUI(job?.werkwijze?.presetLabel ?? null);
                const workMethodId = job?.werkwijze?.workMethodId;

                if (workMethodId && workMethodId !== 'default') {
                  if (presetNames[workMethodId]) {
                    preset = presetNames[workMethodId];
                  }
                }

                const isComplete = jobIsComplete(job);

                const maatwerkMeta = job?.maatwerk?.meta;
                const type =
                  job?.klusinformatie?.type ||
                  job?.materialen?.jobType ||
                  maatwerkMeta?.type ||
                  job?.meta?.type ||
                  'wanden';

                const slug =
                  job?.materialen?.jobSlug ||
                  maatwerkMeta?.slug ||
                  job?.meta?.slug ||
                  slugify(title);

                const bewerkenHref = `/offertes/${quoteId}/klus/${job.id}/${type}/${slug}`;

                // Extract dimensions summary
                const container = job;
                const maatwerkObj = container.maatwerk;
                const maatwerk = (maatwerkObj && typeof maatwerkObj === 'object' && !Array.isArray(maatwerkObj))
                  ? (maatwerkObj as any).items
                  : (Array.isArray(maatwerkObj) ? maatwerkObj : container[`${slug}_maatwerk`]);
                const klusinformatie = job?.klusinformatie;
                let dimensionsSummary = '';
                let areaSummary = '';

                if (Array.isArray(maatwerk) && maatwerk.length > 0) {
                  const firstItem = maatwerk[0];
                  const l = parseFloat(firstItem?.lengte) || parseFloat(firstItem?.width) || parseFloat(firstItem?.lengte1) || 0;
                  const h = parseFloat(firstItem?.hoogte) || parseFloat(firstItem?.breedte) || parseFloat(firstItem?.height) || parseFloat(firstItem?.hoogte1) || 0;

                  if (l > 0 && h > 0) {
                    dimensionsSummary = `${l} × ${h} mm`;
                    let totalAreaM2 = 0;
                    maatwerk.forEach((item: any) => {
                      const itemL = parseFloat(item?.lengte) || parseFloat(item?.width) || parseFloat(item?.lengte1) || 0;
                      const itemH = parseFloat(item?.hoogte) || parseFloat(item?.breedte) || parseFloat(item?.height) || parseFloat(item?.hoogte1) || 0;
                      if (itemL > 0 && itemH > 0) {
                        totalAreaM2 += (itemL * itemH) / 1_000_000;
                      }
                    });
                    if (totalAreaM2 > 0) {
                      areaSummary = `${totalAreaM2.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m²`;
                    }
                  }
                } else if (klusinformatie) {
                  const l = parseFloat(klusinformatie?.lengte) || parseFloat(klusinformatie?.width) || 0;
                  const h = parseFloat(klusinformatie?.hoogte) || parseFloat(klusinformatie?.breedte) || parseFloat(klusinformatie?.height) || 0;

                  if (l > 0 && h > 0) {
                    dimensionsSummary = `${l} × ${h} mm`;
                    const areaM2 = (l * h) / 1_000_000;
                    areaSummary = `${areaM2.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m²`;
                  }
                }

                return (
                  <div
                    key={job.id}
                    className={cn(
                      "group flex items-center justify-between py-3 px-4 hover:bg-white/5 transition-colors cursor-pointer",
                      index > 0 && "border-t border-white/5"
                    )}
                    onClick={() => router.push(bewerkenHref)}
                  >
                    {/* Left: Title & Info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm text-foreground truncate">{title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          {dimensionsSummary && <span className="font-mono">{dimensionsSummary}</span>}
                          {areaSummary && (
                            <>
                              <span className="text-muted-foreground/40">•</span>
                              <span className="font-mono">{areaSummary}</span>
                            </>
                          )}
                          {preset && (
                            <>
                              <span className="text-muted-foreground/40">•</span>
                              <span>{preset}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Status Pill + Actions */}
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                          isComplete
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-red-500/15 text-red-400'
                        )}
                      >
                        {isComplete ? 'Ingesteld' : 'Onvolledig'}
                      </span>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-40 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(bewerkenHref);
                        }}
                        aria-label="Bewerken"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-40 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteDialogForJob(job);
                        }}
                        aria-label="Klus verwijderen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* Add Klus Link */}
              <button
                type="button"
                onClick={handleAddJob}
                className="w-full flex items-center gap-2 py-3 px-4 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/5 transition-colors text-sm font-medium border-t border-white/5"
              >
                <Plus className="h-4 w-4" />
                <span>Een klus toevoegen</span>
              </button>
            </div>
          </section>

          {/* Bouwplaatskosten */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">Bouwplaatskosten</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setBouwplaatsBeheerOpen(true)}
                aria-label="Bouwplaatskosten pakketten beheren"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>

            <div className="rounded-xl bg-white/5 border border-white/5 overflow-hidden">
              {/* Pakket Selector */}
              <div className="px-4 py-3 border-b border-white/5">
                <Select
                  value={geselecteerdPakketId || 'LEEG'}
                  onValueChange={(v) => {
                    if (!v || v === 'LEEG') {
                      setGeselecteerdPakketId('');
                      setBouwplaatskosten(defaultBouwplaatskosten());
                      return;
                    }
                    handleSelectPakket(v);
                  }}
                >
                  <SelectTrigger className="bg-black/20 border-white/5 rounded-lg">
                    <SelectValue placeholder="Leeg (handmatig)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LEEG">Leeg (handmatig)</SelectItem>
                    {pakketten.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.naam}
                        {p.id === standaardPakketId ? ' (standaard)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Items List */}
              <div className="divide-y divide-white/5">
                {bouwplaatskosten.map((item) => (
                  <div key={item.id} className="group flex items-center gap-2 py-3 px-4 hover:bg-white/5 transition-colors">
                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      {item.isVast ? (
                        <span className="text-sm text-foreground">{item.naam}</span>
                      ) : (
                        <Input
                          value={item.naam}
                          onChange={(e) => handleBouwplaatsChange(item.id, 'naam', e.target.value)}
                          placeholder="Bijv. Hoogwerker / Gereedschap huur"
                          className="bg-transparent border-0 px-0 h-7 text-sm focus-visible:ring-0 placeholder:text-muted-foreground/50"
                        />
                      )}
                    </div>

                    {/* Price */}
                    <div className="w-24 shrink-0">
                      <EuroInput
                        value={item.prijs}
                        onChange={(v) => handleBouwplaatsChange(item.id, 'prijs', v)}
                        inputClassName="bg-black/20 border-white/5 rounded-lg h-8 text-sm"
                        placeholder="0,00"
                      />
                    </div>

                    {/* Per */}
                    <div className="w-20 shrink-0">
                      <Select value={item.per} onValueChange={(v) => handleBouwplaatsChange(item.id, 'per', v)}>
                        <SelectTrigger className="bg-black/20 border-white/5 rounded-lg h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dag">dag</SelectItem>
                          <SelectItem value="week">week</SelectItem>
                          <SelectItem value="klus">klus</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Delete - aligned with unit dropdown */}
                    <div className="w-8 shrink-0 flex justify-center">
                      {!item.isVast ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-40 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-opacity"
                          onClick={() => handleRemoveBouwplaats(item.id)}
                          aria-label="Verwijderen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <div className="w-7 h-7" />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Button */}
              <button
                type="button"
                onClick={handleAddExtraBouwplaats}
                className="w-full flex items-center gap-2 py-3 px-4 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/5 transition-colors text-sm font-medium border-t border-white/5"
              >
                <Plus className="h-4 w-4" />
                <span>Toevoegen</span>
              </button>
            </div>
          </section>

          {/* Transport */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">Transport</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setTransportInstellingenOpen(true)}
                aria-label="Transport instellingen"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
              <SegmentedToggle
                options={[
                  { id: 'perKm', label: 'Per km', subtitle: 'Automatisch' },
                  { id: 'fixed', label: 'Vast bedrag' },
                  { id: 'none', label: 'Geen' }
                ]}
                value={transportMode}
                onChange={(id) => setTransportMode(id as TransportMode)}
                error={!transportIsValid}
              />

              {/* DYNAMIC INPUTS ROW */}
              {transportMode === 'perKm' && (
                <div className="animate-in fade-in slide-in-from-top-1">
                  <div className="flex items-center gap-3">
                    <EuroInput
                      value={prijsPerKm}
                      onChange={setPrijsPerKm}
                      inputClassName={cn(
                        "bg-black/20 border-white/5 rounded-lg",
                        !transportIsValid && "border-red-500 focus-visible:ring-red-500"
                      )}
                      placeholder="0,00"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">per km</span>
                  </div>
                </div>
              )}

              {transportMode === 'fixed' && (
                <div className="animate-in fade-in slide-in-from-top-1">
                  <div className="flex items-center gap-3">
                    <EuroInput
                      value={vasteTransportkosten}
                      onChange={setVasteTransportkosten}
                      inputClassName={cn(
                        "bg-black/20 border-white/5 rounded-lg",
                        !transportIsValid && "border-red-500 focus-visible:ring-red-500"
                      )}
                      placeholder="0,00"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">vast bedrag</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Winstmarge */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">Winstmarge</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setWinstInstellingenOpen(true)}
                aria-label="Winstmarge instellingen"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
              <SegmentedToggle
                options={[
                  { id: 'percentage', label: 'Percentage', subtitle: '% van totaal' },
                  { id: 'fixed', label: 'Vast bedrag' },
                  { id: 'none', label: 'Geen' }
                ]}
                value={winstMode}
                onChange={(id) => {
                  if (id === 'none') {
                    setWinstMarge({ mode: 'none', percentage: null, fixedAmount: null, basis: 'totaal' });
                  } else {
                    setWinstMarge((p) => ({ ...p, mode: id as WinstMargeMode }));
                  }
                }}
                error={!winstMargeIsValid}
              />

              {winstMode === 'percentage' && (
                <div className="animate-in fade-in slide-in-from-top-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="0"
                        className={cn(
                          "pr-8 bg-black/20 border-white/5 rounded-lg",
                          !winstMargeIsValid && "border-red-500 focus-visible:ring-red-500"
                        )}
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
                      <span className="absolute inset-y-0 right-3 flex items-center text-muted-foreground pointer-events-none">%</span>
                    </div>
                  </div>

                  {/* Basis Selector */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400 ml-1">Berekenen over:</Label>
                    <Select
                      value={winstMarge.basis || 'totaal'}
                      onValueChange={(v: any) => setWinstMarge(prev => ({ ...prev, basis: v }))}
                    >
                      <SelectTrigger className="w-full bg-black/20 border-white/5 rounded-lg h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="totaal">Totaal (alles inbegrepen)</SelectItem>
                        <SelectItem value="materialen">Alleen materialen</SelectItem>
                        <SelectItem value="materialen_arbeid">Materialen + Arbeid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {winstMode === 'fixed' && (
                <div className="animate-in fade-in slide-in-from-top-1">
                  <div className="flex items-center gap-3">
                    <EuroInput
                      value={numberToEuroInputString(winstMarge.fixedAmount)}
                      onChange={(v) => {
                        const n = euroNLToNumberOrNull(v);
                        setWinstMarge((p) => ({ ...p, fixedAmount: n === null ? null : n }));
                      }}
                      inputClassName={cn(
                        "bg-black/20 border-white/5 rounded-lg",
                        !winstMargeIsValid && "border-red-500 focus-visible:ring-red-500"
                      )}
                      placeholder="0,00"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">vast bedrag</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Sticky bottom bar - matching HSB editor footer */}
          <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border z-50">
            <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center gap-3">
              <Button variant="outline" asChild>
                <Link href={`/offertes/${quoteId}/klus/nieuw`}>
                  Terug
                </Link>
              </Button>

              <div className="flex items-center gap-4">
                {/* Status indicator */}
                <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
                  {stats.isReady ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Klaar om te verzenden</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                      <span className="max-w-48 truncate">{primaryHint}</span>
                    </>
                  )}
                </div>

                <Button
                  onClick={handleFinishQuote}
                  disabled={isSubmitting || !stats.isReady}
                  variant="success"
                  className="gap-2"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {isSubmitting ? 'Indienen…' : 'Offerte indienen'}
                </Button>
              </div>
            </div>
          </div>

          <div className="h-20" />
        </div>
      </div>
    </main>
  );
}