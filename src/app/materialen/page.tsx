/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities, react-hooks/exhaustive-deps */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2, Calculator, Package, Rows3, List, ArrowUpDown } from 'lucide-react';

import { useUser } from '@/firebase';

import { cn, parsePriceToNumber } from '@/lib/utils';
import { reportOperationalError } from '@/lib/report-operational-error';
import { DashboardHeader } from '@/components/DashboardHeader';
import { AppNavigation } from '@/components/AppNavigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

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

type Material = {
  row_id: string;
  subsectie: string | null;
  materiaalnaam: string | null;
  prijs: number | string | null;
  eenheid: string | null;
  leverancier: string | null;
  gebruikerid: string;
  order_id?: number | null;
};

function calculatePiecePrice(price: number, unit: string, L: string, B: string, maatUnit: string): number | null {
  const lengte = parseFloat(L.replace(',', '.'));
  const breedte = parseFloat(B.replace(',', '.'));
  if (isNaN(lengte) || isNaN(breedte)) return null;

  let areaM2 = 0;
  if (maatUnit === 'mm') areaM2 = (lengte * breedte) / 1000000;
  else if (maatUnit === 'cm') areaM2 = (lengte * breedte) / 10000;
  else areaM2 = lengte * breedte;

  if (unit === 'p/m2') return price * areaM2;
  // If they chose m1, we calculate price per full length
  if (unit === 'p/m1') {
    const lengthM1 = maatUnit === 'mm' ? lengte / 1000 : maatUnit === 'cm' ? lengte / 100 : lengte;
    return price * lengthM1;
  }
  return null;
}

function formatEuro(amount: number | null): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function PageSkeleton() {
  return (
    <div className="app-shell flex min-h-screen flex-col">
      <DashboardHeader user={null} />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 md:gap-8 md:p-6">
        <div className="flex items-center p-8 text-center text-gray-500">
          <Loader2 className="mr-3 h-8 w-8 animate-spin text-primary" />
          Pagina laden...
        </div>
      </main>
    </div>
  );
}

const EENHEDEN: string[] = ['p/m1', 'p/m2', 'p/m3', 'stuk', 'doos', 'set'];
const MAAT_UNITS: string[] = ['mm', 'cm', 'm'];

function stripMaatSuffix(naam: string): string {
  return naam.replace(/\s+\d[\d\s.,x×-]*?(mm|cm|m)\s*$/i, '').trim();
}

function isMaatEenheid(eenheid: string): boolean {
  return eenheid === 'p/m1' || eenheid === 'p/m2' || eenheid === 'p/m3';
}

function buildMaatString(opts: {
  eenheid: string;
  maatUnit: string;
  lengte: string;
  breedte: string;
  derdeWaarde?: string;
}): string {
  const l = (opts.lengte || '').trim();
  const b = (opts.breedte || '').trim();
  const u = (opts.maatUnit || '').trim();
  if (!l || !b || !u) return '';

  const d = (opts.derdeWaarde || '').trim();
  if (!d) return '';

  return `${l} × ${b} × ${d}${u}`;
}

function buildMergedNaam(opts: {
  baseNaam: string;
  eenheid: string;
  maatUnit: string;
  lengte: string;
  breedte: string;
  derdeWaarde: string;
}): string {
  const base = stripMaatSuffix(opts.baseNaam.trim());
  const maat = buildMaatString({
    eenheid: opts.eenheid,
    maatUnit: opts.maatUnit,
    lengte: opts.lengte,
    breedte: opts.breedte,
    derdeWaarde: opts.derdeWaarde,
  });

  if (!maat) return base;
  return `${base} ${maat}`;
}

function mergeSafetyAnswerIntoNaam(naam: string, antwoord: string): string {
  const cleanNaam = naam.trim();
  const cleanAntwoord = antwoord.trim();
  if (!cleanAntwoord) return cleanNaam;

  if (cleanNaam.toLowerCase().includes(cleanAntwoord.toLowerCase())) {
    return cleanNaam;
  }

  return `${cleanNaam} ${cleanAntwoord}`.replace(/\s+/g, ' ').trim();
}

function inferUnitFromQuestion(question: string): string {
  const q = (question || '').toLowerCase();
  if (!q) return '';

  const beforeOf = q.split(/\sof\s/)[0] || q;
  const unitMatch =
    beforeOf.match(/\b(ml|cl|dl|liter|l|kg|g|mg|mm|cm|m3|m2|m)\b/i) ||
    q.match(/\b(ml|cl|dl|liter|l|kg|g|mg|mm|cm|m3|m2|m)\b/i);

  return unitMatch?.[1]?.trim() || '';
}

function applySafetyUnit(answer: string, expectedUnit: string, question: string): string {
  const cleanAnswer = answer.trim();
  if (!cleanAnswer) return cleanAnswer;
  if (/[a-zA-Z]/.test(cleanAnswer)) return cleanAnswer;

  const unit = (expectedUnit || inferUnitFromQuestion(question)).trim();
  if (!unit) return cleanAnswer;

  if (/^\d+([.,]\d+)?$/.test(cleanAnswer)) {
    if (/^(ml|cl|dl|liter|l|kg|g|mg|mm|cm|m3|m2|m)$/i.test(unit)) {
      return `${cleanAnswer}${unit}`;
    }
    return `${cleanAnswer} ${unit}`;
  }

  return `${cleanAnswer} ${unit}`.replace(/\s+/g, ' ').trim();
}

function extractSafetyPrompt(input: unknown): { ready?: boolean; question: string; expectedUnit: string } {
  if (input == null) return { question: '', expectedUnit: '' };

  let candidate: unknown = input;

  if (Array.isArray(candidate)) {
    candidate = candidate.find((item) => item && typeof item === 'object') ?? candidate[0];
  }

  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return { question: '', expectedUnit: '' };
    }
  }

  if (candidate && typeof candidate === 'object' && 'output' in (candidate as Record<string, unknown>)) {
    const output = (candidate as Record<string, unknown>).output;
    if (typeof output === 'string') {
      try {
        candidate = JSON.parse(output);
      } catch {
        candidate = output;
      }
    } else if (output && typeof output === 'object') {
      candidate = output;
    }
  }

  if (!candidate || typeof candidate !== 'object') return { question: '', expectedUnit: '' };

  const obj = candidate as Record<string, unknown>;
  const questionRaw = obj.question ?? obj.vraag;
  const question = typeof questionRaw === 'string' ? questionRaw.trim() : '';
  const expectedUnitRaw =
    obj.expected_unit ??
    obj.expectedUnit ??
    obj.answer_unit ??
    obj.answerUnit ??
    obj.eenheid ??
    obj.unit;
  const expectedUnit = typeof expectedUnitRaw === 'string' ? expectedUnitRaw.trim() : '';
  const ready = typeof obj.ready === 'boolean' ? obj.ready : undefined;

  return { ready, question, expectedUnit };
}

function InputMetSuffix(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix: string;
}) {
  const { value, onChange, placeholder, suffix } = props;

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type="number"
        step="0.01"
        inputMode="decimal"
        className="pr-12"
      />
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        {suffix}
      </div>
    </div>
  );
}

async function haalFirebaseIdToken(): Promise<string> {
  const { getAuth } = await import('firebase/auth');
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Niet ingelogd. Log opnieuw in.');
  return await currentUser.getIdToken();
}

export default function MaterialenPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [search, setSearch] = useState<string>('');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isCompact, setIsCompact] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Material | 'prijsNumber'; direction: 'asc' | 'desc' } | null>(null);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(50);

  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [savingCustom, setSavingCustom] = useState<boolean>(false);

  // ✅ Delete confirm dialog
  const [deleteOpen, setDeleteOpen] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [dontAutoIncludeNextTime, setDontAutoIncludeNextTime] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Voeg deze twee toe aan je bestaande states
  const [step, setStep] = useState<'choice' | 'form'>('choice');
  const [isCalculatie, setIsCalculatie] = useState<boolean>(true);
  const [customNaam, setCustomNaam] = useState<string>('');
  const [customEenheid, setCustomEenheid] = useState<string>(''); // leeg (focus!)
  const [customPrijs, setCustomPrijs] = useState<string>('');
  const [customSubsectie, setCustomSubsectie] = useState<string>('');
  const [customLeverancier, setCustomLeverancier] = useState<string>(''); // leeg

  const [safetyPopupOpen, setSafetyPopupOpen] = useState<boolean>(false);
  const [safetyQuestion, setSafetyQuestion] = useState<string>('');
  const [safetyExpectedUnit, setSafetyExpectedUnit] = useState<string>('');
  const [safetyAnswer, setSafetyAnswer] = useState<string>('');
  const [safetyAnswerError, setSafetyAnswerError] = useState<string | null>(null);

  const [maatUnit, setMaatUnit] = useState<string>('mm');
  const [maatLengte, setMaatLengte] = useState<string>('');
  const [maatBreedte, setMaatBreedte] = useState<string>('');
  const [maatDikte, setMaatDikte] = useState<string>('');
  const [maatHoogte, setMaatHoogte] = useState<string>('');

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  // ✅ FIX: geen losse rommel onder de hook, geen extra sluit-haakjes, en juiste route /api/materialen/get
  const fetchMaterials = useCallback(async () => {
    if (!user?.uid) return;

    setIsLoading(true);
    setPageError(null);

    try {
      const token = await haalFirebaseIdToken();

      const res = await fetch('/api/materialen/get', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        setMaterials(Array.isArray(json.data) ? json.data : []);
      } else {
        const msg =
          json?.message ||
          json?.error ||
          (typeof json === 'string' ? json : null) ||
          `Kon materialen niet laden (HTTP ${res.status}).`;
        setPageError(msg);
        void reportOperationalError({
          source: 'materialen_fetch',
          title: 'Materialen laden mislukt',
          message: msg,
          context: { httpStatus: res.status },
        });
      }
    } catch (err: any) {
      console.error(err);
      const message = err?.message || 'Netwerkfout bij het laden van materialen.';
      setPageError(message);
      void reportOperationalError({
        source: 'materialen_fetch',
        title: 'Materialen laden mislukt',
        message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (user?.uid) {
      fetchMaterials();
    } else if (!isUserLoading) {
      setIsLoading(false);
    }
  }, [user?.uid, isUserLoading, fetchMaterials]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, supplierFilter, categoryFilter]);

  const uniqueSuppliers = useMemo(() => {
    const arr = materials
      .map((m) => (m.leverancier ?? '').trim())
      .filter((v) => !!v);
    return [...new Set(arr)].sort((a, b) => a.localeCompare(b));
  }, [materials]);

  const uniqueCategories = useMemo(() => {
    const categoryOrder = [
      "Vuren hout",
      "Hardhout",
      "Aftimmerhout & Plinten",
      "Kozijnhout, Raamhout & Glaslatten",
      "Houten Gevelbekleding",
      "Boeidelen & Windveren",
      "Gevelplaten & Buitenpanelen",
      "Plaatmateriaal Exterieur",
      "Plaatmateriaal Interieur",
      "Constructieplaten",
      "Fundering & Bekisting",
      "Stenen, Lateien & Mortels",
      "Metalstud Profielen & Systeemplafonds",
      "Gipsplaten",
      "Stucwerk",
      "Gipsvezelplaten",
      "Vloerelementen (Estrich)",
      "Isolatie",
      "Stuc, vul of finisher & Pleisterwerk",
      "Egaline & Vloerafwerking",
      "Wanddecoratie",
      "Vensterbanken",
      "Dakwerk & HWA",
      "Dakramen & Koepels",
      "Binnendeuren",
      "Buitendeuren",
      "Deurbeslag",
      "Binnenkozijnen",
      "Vlieringtrappen",
      "Tuinhout, Schuttingen & Tuinpoorten",
      "Overig"
    ];

    const arr = materials
      .map((m) => (m.subsectie ?? '').trim())
      .filter((v) => !!v);

    const unique = [...new Set(arr)];

    return unique.sort((a, b) => {
      const indexA = categoryOrder.indexOf(a);
      const indexB = categoryOrder.indexOf(b);

      // If both are in the list, sort by index
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }

      // If only A is in the list, it comes first
      if (indexA !== -1) return -1;

      // If only B is in the list, it comes first
      if (indexB !== -1) return 1;

      // If neither are in the list, sort alphabetically
      return a.localeCompare(b);
    });
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    let result = materials;

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      result = result.filter((m) => (m.materiaalnaam ?? '').toLowerCase().includes(s));
    }

    if (supplierFilter !== 'all') {
      result = result.filter((m) => (m.leverancier ?? '') === supplierFilter);
    }

    if (categoryFilter !== 'all') {
      result = result.filter((m) => (m.subsectie ?? '') === categoryFilter);
    }

    if (sortConfig) {
      result = [...result].sort((a, b) => {
        if (sortConfig.key === 'prijsNumber') {
          const aPrice = parsePriceToNumber(a.prijs) || 0;
          const bPrice = parsePriceToNumber(b.prijs) || 0;
          return sortConfig.direction === 'asc' ? aPrice - bPrice : bPrice - aPrice;
        }

        const aValue = (a[sortConfig.key as keyof Material] ?? '').toString();
        const bValue = (b[sortConfig.key as keyof Material] ?? '').toString();

        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      });
    }

    return result;
  }, [materials, search, supplierFilter, categoryFilter, sortConfig]);

  const totalPages = itemsPerPage === 'all'
    ? 1
    : Math.max(1, Math.ceil(filteredMaterials.length / itemsPerPage));

  const paginatedMaterials = useMemo(() => {
    if (itemsPerPage === 'all') return filteredMaterials;
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const start = (safePage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredMaterials.slice(start, end);
  }, [filteredMaterials, currentPage, totalPages, itemsPerPage]);

  const resetCustomForm = useCallback(() => {
    setCustomNaam('');
    setCustomEenheid('');
    setCustomPrijs('');
    setCustomSubsectie('');
    setCustomLeverancier('');

    setMaatUnit('mm');
    setMaatLengte('');
    setMaatBreedte('');
    setMaatDikte('');
    setMaatHoogte('');

    setSafetyPopupOpen(false);
    setSafetyQuestion('');
    setSafetyExpectedUnit('');
    setSafetyAnswer('');
    setSafetyAnswerError(null);
  }, []);

  const openCustomDialog = useCallback(() => {
    setPageError(null);
    resetCustomForm();
    setStep('choice'); // Zorgt dat je altijd begint bij de 2 kaarten
    setDialogOpen(true);
  }, [resetCustomForm]);

  const closeCustomDialog = useCallback(() => {
    setDialogOpen(false);
    setSafetyPopupOpen(false);
    setSafetyQuestion('');
    setSafetyExpectedUnit('');
    setSafetyAnswer('');
    setSafetyAnswerError(null);
  }, []);

  useEffect(() => {
    if (customEenheid === 'p/m3') {
      setMaatDikte('');
    } else if (customEenheid === 'p/m1' || customEenheid === 'p/m2') {
      setMaatHoogte('');
    }
  }, [customEenheid]);

  const isNaamOk = useMemo(() => customNaam.trim().length > 0, [customNaam]);
  const prijsNum = useMemo(() => parsePriceToNumber(customPrijs), [customPrijs]);
  const isPrijsOk = useMemo(() => prijsNum != null && prijsNum >= 0, [prijsNum]);
  const isEenheidOk = useMemo(() => (customEenheid || '').trim().length > 0, [customEenheid]);

  const maatVereist = useMemo(() => isMaatEenheid(customEenheid), [customEenheid]);

  const isMaatOk = useMemo(() => {
    if (!maatVereist) return true;

    const l = maatLengte.trim();
    const b = maatBreedte.trim();
    const u = maatUnit.trim();

    if (!l || !b || !u) return false;

    if (customEenheid === 'p/m3') return maatHoogte.trim().length > 0;
    return maatDikte.trim().length > 0;
  }, [maatVereist, maatLengte, maatBreedte, maatUnit, customEenheid, maatDikte, maatHoogte]);

  const canSaveCustom = useMemo(() => {
    // Basis check: naam, prijs en eenheid moeten er altijd zijn
    const basisCheck = !savingCustom && isNaamOk && isPrijsOk && isEenheidOk;

    if (isCalculatie) {
      // In calculatie-modus MOETEN lengte en breedte ingevuld zijn (isMaatOk)
      return basisCheck && isMaatOk;
    }

    // In 'Los artikel' modus zijn maten niet nodig
    return basisCheck;
  }, [savingCustom, isNaamOk, isPrijsOk, isEenheidOk, isMaatOk, isCalculatie]);

  const previewNaam = useMemo(() => {
    const base = (customNaam || '').trim() || '...';

    if (!maatVereist) return stripMaatSuffix(base);

    const derde = customEenheid === 'p/m3' ? maatHoogte : maatDikte;

    const merged = buildMergedNaam({
      baseNaam: base,
      eenheid: customEenheid,
      maatUnit,
      lengte: maatLengte,
      breedte: maatBreedte,
      derdeWaarde: derde,
    });

    return merged || stripMaatSuffix(base);
  }, [customNaam, maatVereist, customEenheid, maatUnit, maatLengte, maatBreedte, maatDikte, maatHoogte]);

  const runSaveCustomMaterial = useCallback(async (safetyAnswerOverride?: string) => {
    try {
      const naamRaw = mergeSafetyAnswerIntoNaam(customNaam.trim(), safetyAnswerOverride || '');
      if (!naamRaw) {
        setPageError('Materiaalnaam is verplicht.');
        return;
      }

      // Nieuw: Maak de naam netjes (Hoofdletter Per Woord)
      const formattedName = naamRaw
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      const prijsNumLocal = parsePriceToNumber(customPrijs);
      if (prijsNumLocal == null || prijsNumLocal < 0) {
        setPageError('Vul een geldige prijs in.');
        return;
      }

      const eenheid = (customEenheid || '').trim();
      if (!eenheid) {
        setPageError('Kies een eenheid.');
        return;
      }

      const maatUnitLocal = (maatUnit || 'mm').trim();
      const lengte = maatLengte.trim();
      const breedte = maatBreedte.trim();
      const dikte = maatDikte.trim();
      const hoogte = maatHoogte.trim();

      if (isMaatEenheid(eenheid)) {
        if (!lengte || !breedte || !maatUnitLocal) {
          setPageError('Vul afmetingen in en kies mm/cm/m.');
          return;
        }
        if (eenheid === 'p/m3') {
          if (!hoogte) {
            setPageError('Vul hoogte in (voor p/m3).');
            return;
          }
        } else {
          if (!dikte) {
            setPageError('Vul dikte in (voor p/m1/p/m2).');
            return;
          }
        }
      }

      const categorie = customSubsectie.trim();
      const leverancier = customLeverancier.trim();

      setSavingCustom(true);
      setPageError(null);

      const payload: any = {
        // Gebruik hier de geformatteerde naam
        materiaalnaam: stripMaatSuffix(formattedName),
        eenheid,
        // Canonical: prijs is excl. btw om ambiguiteit te voorkomen.
        prijs: prijsNumLocal,
        prijs_excl_btw: prijsNumLocal,
        unit: maatUnitLocal,
      };
      const safetyAnswerFinal = (safetyAnswerOverride || '').trim();
      if (safetyAnswerFinal) {
        payload.safety_confirmed = true;
        payload.safety_answer = safetyAnswerFinal;
        if (safetyExpectedUnit.trim()) {
          payload.expected_unit = safetyExpectedUnit.trim();
        }
      }
      if (categorie) payload.categorie = categorie;
      if (leverancier) payload.leverancier = leverancier;

      if (isMaatEenheid(eenheid)) {
        payload.lengte = lengte;
        payload.breedte = breedte;
        if (eenheid === 'p/m3') payload.hoogte = hoogte;
        else payload.dikte = dikte;
      }

      const token = await haalFirebaseIdToken();

      const res = await fetch('/api/materialen/upsert', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        const msg = json?.message || json?.error || 'Onbekende fout bij opslaan.';
        setPageError(`Opslaan mislukt: ${msg}`);
        void reportOperationalError({
          source: 'materialen_upsert',
          title: 'Opslaan mislukt',
          message: msg,
          severity: 'critical',
          context: {
            httpStatus: res.status,
            materiaalnaam: payload?.materiaalnaam ?? null,
          },
        });
        setSavingCustom(false);
        return;
      }

      const parsedN8n = extractSafetyPrompt(json?.n8n);
      const parsedData = extractSafetyPrompt(json?.data);
      const questionText = parsedN8n.question || parsedData.question;
      const expectedUnit = parsedN8n.expectedUnit || parsedData.expectedUnit;
      const shouldAskSafetyQuestion = parsedN8n.ready === false || parsedData.ready === false;

      if (shouldAskSafetyQuestion && questionText) {
        setSafetyQuestion(questionText);
        setSafetyExpectedUnit(expectedUnit);
        setSafetyAnswer('');
        setSafetyAnswerError(null);
        setSafetyPopupOpen(true);
        setCustomNaam(stripMaatSuffix(formattedName));
        setSavingCustom(false);
        return;
      }

      await fetchMaterials();
      setSavingCustom(false);
      setDialogOpen(false);
    } catch (e: any) {
      console.error(e);
      const message = e?.message || 'Onbekende fout.';
      setPageError(message);
      void reportOperationalError({
        source: 'materialen_upsert',
        title: 'Opslaan mislukt',
        message,
        severity: 'critical',
      });
      setSavingCustom(false);
    }
  }, [
    customNaam,
    customPrijs,
    customEenheid,
    customSubsectie,
    customLeverancier,
    maatUnit,
    maatLengte,
    maatBreedte,
    maatDikte,
    maatHoogte,
    safetyExpectedUnit,
    fetchMaterials,
  ]);

  const saveCustomMaterial = useCallback(() => {
    void runSaveCustomMaterial();
  }, [runSaveCustomMaterial]);

  const handleSafetyAnswerConfirm = useCallback(() => {
    const answer = safetyAnswer.trim();
    if (!answer) {
      setSafetyAnswerError('Vul eerst een antwoord in.');
      return;
    }

    const answerWithUnit = applySafetyUnit(answer, safetyExpectedUnit, safetyQuestion);
    setSafetyAnswerError(null);
    setCustomNaam((prev) => mergeSafetyAnswerIntoNaam(prev, answerWithUnit));
    setSafetyPopupOpen(false);
    void runSaveCustomMaterial(answerWithUnit);
  }, [safetyAnswer, safetyExpectedUnit, safetyQuestion, runSaveCustomMaterial]);

  // ✅ Open delete confirm
  const openDeleteDialog = useCallback((m: Material) => {
    setPageError(null);
    setDontAutoIncludeNextTime(false);
    setDeleteTarget(m);
    setDeleteOpen(true);
  }, []);

  // ✅ Delete via API -> n8n -> supabase delete
  const bevestigDelete = useCallback(async () => {
    if (!deleteTarget?.row_id) return;

    try {
      setDeleting(true);
      setPageError(null);

      const token = await haalFirebaseIdToken();

      const res = await fetch('/api/materialen/delete', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ row_id: deleteTarget.row_id }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        const msg =
          json?.message ||
          json?.error ||
          (typeof json === 'string' ? json : null) ||
          'Onbekende fout bij verwijderen.';
        console.error('Delete API error:', msg, json);
        setPageError(`Verwijderen mislukt: ${msg}`);
        void reportOperationalError({
          source: 'materialen_delete',
          title: 'Verwijderen mislukt',
          message: msg,
          severity: 'critical',
          context: {
            httpStatus: res.status,
            rowId: deleteTarget.row_id,
          },
        });
        setDeleting(false);
        return;
      }

      setDeleteOpen(false);
      setDeleteTarget(null);
      setDontAutoIncludeNextTime(false);

      await fetchMaterials();
      setDeleting(false);
    } catch (e: any) {
      console.error(e);
      const message = e?.message || 'Onbekende fout.';
      setPageError(message);
      void reportOperationalError({
        source: 'materialen_delete',
        title: 'Verwijderen mislukt',
        message,
        severity: 'critical',
        context: {
          rowId: deleteTarget?.row_id ?? null,
        },
      });
      setDeleting(false);
    }
  }, [deleteTarget, fetchMaterials]);

  if (isUserLoading || (!user && !pageError)) {
    return <PageSkeleton />;
  }

  return (
    <div className="app-shell flex min-h-screen flex-col">
      <AppNavigation />
      <DashboardHeader user={user} title="Materialen & Prijzen" />

      <main className="flex-1 space-y-6 p-4 pb-16 md:p-6 md:pb-10">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <Input
              placeholder="Zoek op materiaalnaam..."
              className="w-full bg-card/50 md:w-[240px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="w-full bg-card/50">
                  <SelectValue placeholder="Leverancier" />
                </SelectTrigger>
                <SelectContent className="max-h-[80vh]">
                  <SelectItem value="all">Alle leveranciers</SelectItem>
                  {uniqueSuppliers.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full bg-card/50">
                  <SelectValue placeholder="Categorie" />
                </SelectTrigger>
                <SelectContent className="max-h-[80vh]">
                  <SelectItem value="all">Alle categorieën</SelectItem>
                  {uniqueCategories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                className="w-full bg-card/50 sm:w-10"
                onClick={() => setIsCompact(!isCompact)}
                title={isCompact ? "Normale weergave" : "Compacte weergave"}
              >
                {isCompact ? <Rows3 className="h-4 w-4" /> : <List className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button asChild variant="outline" className="h-10 w-full px-4 sm:w-auto">
              <Link href="/prijs-import-aanvragen">Prijs import aanvragen</Link>
            </Button>
            <Button
              onClick={openCustomDialog}
              variant="success"
              className="h-10 w-full px-4 font-bold shadow-sm sm:w-auto"
            >
              <Plus className="mr-2 h-4 w-4" />
              Nieuw materiaal
            </Button>
          </div>
        </div>

        {
          pageError ? (
            <div className="rounded-xl border bg-destructive/10 px-4 py-3 text-destructive">
              {pageError}
            </div>
          ) : null
        }

        <Card>


          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                <span>Materialen laden...</span>
              </div>
            ) : (
              <div className="w-full overflow-x-auto">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px] cursor-pointer hover:text-foreground" onClick={() => {
                      setSortConfig(current => ({
                        key: 'materiaalnaam',
                        direction: current?.key === 'materiaalnaam' && current.direction === 'asc' ? 'desc' : 'asc'
                      }));
                    }}>
                      <div className="flex items-center gap-1">
                        Materiaalnaam
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="w-[15%] min-w-[100px] text-right cursor-pointer hover:text-foreground" onClick={() => {
                      setSortConfig(current => ({
                        key: 'prijsNumber',
                        direction: current?.key === 'prijsNumber' && current.direction === 'asc' ? 'desc' : 'asc'
                      }));
                    }}>
                      <div className="flex items-center justify-end gap-1">
                        Prijs
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="hidden w-[10%] min-w-[80px] cursor-pointer hover:text-foreground md:table-cell" onClick={() => {
                      setSortConfig(current => ({
                        key: 'eenheid',
                        direction: current?.key === 'eenheid' && current.direction === 'asc' ? 'desc' : 'asc'
                      }));
                    }}>
                      <div className="flex items-center gap-1">
                        Eenheid
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="hidden w-[15%] min-w-[150px] cursor-pointer hover:text-foreground md:table-cell" onClick={() => {
                      setSortConfig(current => ({
                        key: 'subsectie',
                        direction: current?.key === 'subsectie' && current.direction === 'asc' ? 'desc' : 'asc'
                      }));
                    }}>
                      <div className="flex items-center gap-1">
                        Categorie
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="hidden w-[15%] min-w-[150px] cursor-pointer hover:text-foreground md:table-cell" onClick={() => {
                      setSortConfig(current => ({
                        key: 'leverancier',
                        direction: current?.key === 'leverancier' && current.direction === 'asc' ? 'desc' : 'asc'
                      }));
                    }}>
                      <div className="flex items-center gap-1">
                        Leverancier
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="w-[50px] text-right">Acties</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {paginatedMaterials.length > 0 ? (
                    paginatedMaterials.map((material) => {
                      const prijsNumber = parsePriceToNumber(material.prijs);
                      return (
                        <TableRow key={material.row_id}>
                          <TableCell className={cn(isCompact ? "py-1 font-medium" : "font-medium", "min-w-0")}>
                            <div className="min-w-0">
                              <div className="truncate">{material.materiaalnaam ?? '—'}</div>
                              <div className="mt-1 text-xs text-muted-foreground md:hidden">
                                {[material.eenheid, material.subsectie, material.leverancier].filter(Boolean).join(' • ') || '—'}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className={isCompact ? "py-1 text-right" : "text-right"}>{formatEuro(prijsNumber)}</TableCell>
                          <TableCell className={cn(isCompact ? "py-1" : "", "hidden md:table-cell")}>{material.eenheid ?? '—'}</TableCell>
                          <TableCell className={cn(isCompact ? "py-1" : "", "hidden md:table-cell")}>{material.subsectie ?? '—'}</TableCell>
                          <TableCell className={cn(isCompact ? "py-1" : "", "hidden md:table-cell")}>{material.leverancier ?? '—'}</TableCell>

                          <TableCell className={isCompact ? "py-1 text-right" : "text-right"}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openDeleteDialog(material)}
                              title="Verwijderen"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center">
                        Geen materialen gevonden.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                </Table>
              </div>
            )}
          </CardContent>

          {filteredMaterials.length > 0 && totalPages > 1 ? (
            <CardFooter className="flex items-center justify-center pt-6">
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Toon:</span>
                  <Select
                    value={itemsPerPage.toString()}
                    onValueChange={(v) => {
                      setItemsPerPage(v === 'all' ? 'all' : Number(v));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 w-[70px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="500">500</SelectItem>
                      <SelectItem value="all">Alle</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                  >
                    Vorige
                  </Button>

                  <span className="text-sm text-muted-foreground">
                    Pagina {Math.min(currentPage, totalPages)} van {totalPages}
                  </span>

                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    Volgende
                  </Button>
                </div>
              </div>
            </CardFooter>
          ) : null}
        </Card>

        {/* ✅ Add custom dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[640px] overflow-hidden p-0">
            {step === 'choice' ? (
              /* STAP 1: DE KEUZEKAARTEN (Nu beide met emerald hover) */
              <div className="p-8">
                <DialogHeader className="mb-8 text-center">
                  <DialogTitle className="text-2xl font-bold text-white">Wat voor materiaal voegt u toe?</DialogTitle>
                  <DialogDescription className="text-zinc-400">
                    Kies het type product om het juiste formulier te openen.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Kaart: Calculatie Product */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsCalculatie(true);
                      setStep('form');
                    }}
                    className="group flex flex-col items-center gap-4 rounded-2xl border-2 border-zinc-800 bg-zinc-900/50 p-6 text-center transition-all hover:border-emerald-500 hover:bg-emerald-500/5"
                  >
                    <div className="rounded-full bg-zinc-800 p-4 group-hover:bg-emerald-500/20 transition-colors">
                      <Calculator className="h-8 w-8 text-zinc-400 group-hover:text-emerald-500" />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-white">Calculatie Product</div>
                      <div className="text-xs text-zinc-500 mt-1">
                        Voor wanden, vloeren en rachels. <br /> Maten zijn <strong>verplicht</strong>.
                      </div>
                    </div>
                  </button>

                  {/* Kaart: Los Artikel (Nu ook emerald hover) */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsCalculatie(false);
                      setStep('form');
                      setCustomEenheid('stuk');
                    }}
                    className="group flex flex-col items-center gap-4 rounded-2xl border-2 border-zinc-800 bg-zinc-900/50 p-6 text-center transition-all hover:border-emerald-500 hover:bg-emerald-500/5"
                  >
                    <div className="rounded-full bg-zinc-800 p-4 group-hover:bg-emerald-500/20 transition-colors">
                      <Package className="h-8 w-8 text-zinc-400 group-hover:text-emerald-500" />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-white">Los Artikel</div>
                      <div className="text-xs text-zinc-500 mt-1">
                        Voor kranen, verf of lijm. <br /> Geen afmetingen nodig.
                      </div>
                    </div>
                  </button>
                </div>

                <div className="mt-8 flex justify-center">
                  <Button variant="ghost" onClick={closeCustomDialog} className="text-zinc-500 hover:text-white">
                    Annuleren
                  </Button>
                </div>
              </div>
            ) : (
              /* STAP 2: HET FORMULIER */
              <>
                <DialogHeader className="px-6 pt-6 flex flex-row items-center gap-4 space-y-0 text-left border-b border-zinc-800 pb-6">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    {isCalculatie ? (
                      <Calculator className="h-6 w-6 text-emerald-500" />
                    ) : (
                      <Package className="h-6 w-6 text-emerald-500" />
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <DialogTitle className="text-xl font-bold text-white leading-none">
                      Nieuw {isCalculatie ? 'Calculatie Product' : 'Los Artikel'}
                    </DialogTitle>
                    <DialogDescription className="text-zinc-400 text-sm">
                      Vul de gegevens van het materiaal in.
                    </DialogDescription>
                  </div>
                </DialogHeader>

                <div className="space-y-4 px-6 py-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Materiaalnaam *</div>
                    <Input
                      value={customNaam}
                      onChange={(e) => setCustomNaam(e.target.value)}
                      placeholder={isCalculatie ? "bijv. Gipsplaat AK" : "bijv. Keukenkraan chroom"}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Eenheid *</div>
                      <Select value={customEenheid} onValueChange={setCustomEenheid}>
                        <SelectTrigger>
                          <SelectValue placeholder="Kies eenheid" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Toon relevante eenheden op basis van keuze */}
                          {isCalculatie
                            ? EENHEDEN.filter(e => e.includes('p/m') || e === 'stuk').map((e) => (
                              <SelectItem key={e} value={e}>{e}</SelectItem>
                            ))
                            : EENHEDEN.filter(e => !e.includes('p/m')).map((e) => (
                              <SelectItem key={e} value={e}>{e}</SelectItem>
                            ))
                          }
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium">Prijs per eenheid (excl. btw) *</div>
                      <Input
                        value={customPrijs}
                        onChange={(e) => setCustomPrijs(e.target.value)}
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        inputMode="decimal"
                      />
                    </div>
                  </div>

                  {/* AFMETINGEN: Alleen tonen als Calculatie is gekozen */}
                  {isCalculatie && (
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 shadow-inner">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-white uppercase tracking-tight">Afmetingen *</div>
                        <div className="flex items-center gap-2">
                          <div className="text-[10px] font-bold uppercase text-muted-foreground">Unit</div>
                          <Select value={maatUnit} onValueChange={setMaatUnit}>
                            <SelectTrigger className="h-7 w-[70px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MAAT_UNITS.map((u) => (
                                <SelectItem key={u} value={u}>{u}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Lengte</div>
                          <InputMetSuffix value={maatLengte} onChange={setMaatLengte} suffix={maatUnit} placeholder="0" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Breedte</div>
                          <InputMetSuffix value={maatBreedte} onChange={setMaatBreedte} suffix={maatUnit} placeholder="0" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold uppercase text-muted-foreground ml-1">
                            {customEenheid === 'p/m3' ? 'Hoogte' : 'Dikte'}
                          </div>
                          <InputMetSuffix
                            value={customEenheid === 'p/m3' ? maatHoogte : maatDikte}
                            onChange={customEenheid === 'p/m3' ? setMaatHoogte : setMaatDikte}
                            suffix={maatUnit}
                            placeholder="0"
                          />
                        </div>
                      </div>

                      <div className="mt-3 text-[10px] italic text-muted-foreground">
                        Wordt opgeslagen als: <span className="font-semibold text-emerald-500">{previewNaam}</span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Categorie (optioneel)</div>
                      <Input
                        value={customSubsectie}
                        onChange={(e) => setCustomSubsectie(e.target.value)}
                        placeholder="Bijv. Balkhout"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Leverancier (optioneel)</div>
                      <Input
                        value={customLeverancier}
                        onChange={(e) => setCustomLeverancier(e.target.value)}
                        placeholder="Bijv. Bouwmaat"
                      />
                    </div>
                  </div>
                </div>

                {/* ✅ DE SAFETY CHECK BAR - VOLLEDIG ZICHTBAAR */}
                {isPrijsOk && (isCalculatie ? isMaatOk : true) && customEenheid && (
                  <div className="mx-6 mb-4 flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-destructive uppercase tracking-widest leading-none">Controle</span>
                        {/* Verwijder 'truncate' en 'max-w' om de volledige naam te zien */}
                        <span className="text-sm font-semibold text-white mt-1 italic whitespace-nowrap">
                          {previewNaam}
                        </span>
                      </div>
                    </div>

                    <div className="text-right ml-4">
                      <div className="text-lg font-black text-white leading-none">
                        {formatEuro(isCalculatie
                          ? (calculatePiecePrice(prijsNum!, customEenheid, maatLengte, maatBreedte, maatUnit) ?? prijsNum)
                          : prijsNum
                        )}
                      </div>
                      <div className="text-[10px] font-bold uppercase text-zinc-400 mt-1">
                        {isCalculatie ? 'Totaal per stuk' : `Per ${customEenheid}`}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. DE KNOPPEN */}
                <DialogFooter className="border-t border-muted/60 bg-muted/5 px-6 py-4 sm:justify-end gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep('choice')}
                    className="h-11"
                  >
                    Vorige
                  </Button>

                  <Button
                    type="button"
                    variant="success"
                    onClick={saveCustomMaterial}
                    disabled={!canSaveCustom || savingCustom}
                    className="h-11 gap-2 px-8 text-sm font-bold shadow-lg shadow-success/20"
                  >
                    {savingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Materiaal toevoegen
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={safetyPopupOpen}
          onOpenChange={(open) => {
            setSafetyPopupOpen(open);
            if (!open) {
              setSafetyExpectedUnit('');
              setSafetyAnswer('');
              setSafetyAnswerError(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Controle voordat je opslaat</AlertDialogTitle>
              <AlertDialogDescription>
                {safetyQuestion || 'Vul extra verpakkingsinformatie in (zoals 750ml of 25kg).'}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-2">
              <Input
                value={safetyAnswer}
                onChange={(e) => {
                  setSafetyAnswer(e.target.value);
                  if (safetyAnswerError) setSafetyAnswerError(null);
                }}
                placeholder="Bijv. 750ml, 5 liter, 25kg"
                autoFocus
              />
              {safetyAnswerError ? (
                <p className="text-sm text-destructive">{safetyAnswerError}</p>
              ) : (
                <div className="space-y-1">
                  {safetyExpectedUnit ? (
                    <p className="text-xs text-muted-foreground">
                      Verwachte eenheid: <span className="font-semibold">{safetyExpectedUnit}</span>
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Deze info wordt toegevoegd aan de materiaalnaam en daarna opnieuw opgeslagen.
                  </p>
                </div>
              )}
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="ghost">Terug</Button>
              </AlertDialogCancel>
              <Button
                type="button"
                variant="success"
                onClick={handleSafetyAnswerConfirm}
                className="h-11 gap-2 px-8 text-sm font-bold shadow-lg shadow-success/20"
              >
                Aanvullen en opslaan
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ✅ DELETE DIALOG (was missing) */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Materiaal verwijderen?</AlertDialogTitle>
              <AlertDialogDescription>
                Weet u zeker dat u <strong>{deleteTarget?.materiaalnaam}</strong> wilt verwijderen?
                <br />
                Dit kan niet ongedaan worden gemaakt.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <label htmlFor="dont-auto-include-next-time" className="flex items-center justify-between gap-3">
                <span className="text-sm text-foreground">
                  Niet meer automatisch mee berekenen voor volgende keer
                </span>
                <Switch
                  id="dont-auto-include-next-time"
                  checked={dontAutoIncludeNextTime}
                  onCheckedChange={(checked) => setDontAutoIncludeNextTime(Boolean(checked))}
                />
              </label>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="ghost">Annuleren</Button>
              </AlertDialogCancel>
              <AlertDialogAction onClick={bevestigDelete} asChild disabled={deleting}>
                <Button variant="destructiveSoft">
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                  Verwijderen
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main >

    </div >
  );
}
