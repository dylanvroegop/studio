'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
  where,
} from 'firebase/firestore';
import {
  Archive,
  FileText,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useFirestore, useUser } from '@/firebase';
import { createEmptyQuote } from '@/lib/firestore-actions';
import { calculateQuoteTotals, normalizeDataJson, QuoteSettings as QuoteCalculationSettings } from '@/lib/quote-calculations';
import { getEffectiveQuoteStatus, invoiceImpliesAccepted } from '@/lib/quote-status';
import type { InvoiceStatus, Quote } from '@/lib/types';
import { cn } from '@/lib/utils';

type FilterMode = 'alle' | 'concept' | 'verzonden' | 'geaccepteerd' | 'berekend' | 'archief';
const OFFERTES_FILTER_STORAGE_KEY = 'offertes:last-filter';
type DefaultFilterMode = 'concept' | 'geaccepteerd';
const OFFERTES_DEFAULT_FILTER_STORAGE_KEY = 'offertes:default-filter';

type QuoteRow = Quote & {
  id: string;
  createdAtDate: Date | null;
  updatedAtDate: Date | null;
  archived?: boolean;
  archivedAt?: Timestamp;
  archivedBy?: string;
  amount?: number;
  totaalbedrag?: number;
  offerteNummer?: number;
  title?: string;
};

type InvoiceSyncRow = {
  id: string;
  quoteId?: string;
  status?: InvoiceStatus;
  archived?: boolean;
};

type Client = {
  id: string;
  userId?: string;
  voornaam?: string;
  achternaam?: string;
  bedrijfsnaam?: string;
  emailadres?: string;
  telefoonnummer?: string;
  straat?: string;
  huisnummer?: string;
  postcode?: string;
  plaats?: string;
  projectStraat?: string;
  projectHuisnummer?: string;
  projectPostcode?: string;
  projectPlaats?: string;
};

function isFilterMode(value: unknown): value is FilterMode {
  return (
    value === 'alle' ||
    value === 'concept' ||
    value === 'verzonden' ||
    value === 'geaccepteerd' ||
    value === 'berekend' ||
    value === 'archief'
  );
}

function isDefaultFilterMode(value: unknown): value is DefaultFilterMode {
  return value === 'concept' || value === 'geaccepteerd';
}

function naarDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = (value as { seconds?: number }).seconds;
    if (typeof seconds === 'number') return new Date(seconds * 1000);
  }
  return null;
}

function formatCurrency(amount?: number): string {
  const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);
}

function getKlantNaam(q: QuoteRow): string {
  const info = (q as any)?.klantinformatie;
  if (!info) return 'Onbekende klant';
  const bedrijfsnaam = (info?.bedrijfsnaam || '').trim();
  if (bedrijfsnaam) return bedrijfsnaam;
  const persoon = `${info?.voornaam || ''} ${info?.achternaam || ''}`.trim();
  return persoon || 'Onbekende klant';
}

function getTitel(q: QuoteRow): string {
  return (
    ((q as any)?.titel as string) ||
    ((q as any)?.title as string) ||
    ((q as any)?.werkomschrijving as string) ||
    '—'
  );
}

function getHoofdtitel(q: QuoteRow): string | null {
  const directeTitel = String((q as any)?.korteTitel || '').trim();
  if (directeTitel) return directeTitel;

  const rawDataJson = (q as any)?.data_json;
  if (rawDataJson && typeof rawDataJson === 'object') {
    const nested = String((rawDataJson as any)?.korteTitel || '').trim();
    if (nested) return nested;
  }

  if (typeof rawDataJson === 'string') {
    try {
      const parsed = JSON.parse(rawDataJson);
      const nested = String(parsed?.korteTitel || '').trim();
      if (nested) return nested;
    } catch {
      // ignore malformed json
    }
  }

  return null;
}

type OfferteStatusStyles = {
  label: string;
  badgeClass: string;
  sideBorderClass: string;
  rowTintClass: string;
};

function getOfferteStatusStyles(
  status: Quote['status'] | undefined,
  isCalculated: boolean,
  isArchived: boolean
): OfferteStatusStyles {
  if (isArchived) {
    return {
      label: 'Archief',
      badgeClass: 'bg-zinc-500/8 text-zinc-300/85 border-zinc-500/25',
      sideBorderClass: 'border-l-zinc-600/55',
      rowTintClass: 'bg-zinc-500/[0.04]',
    };
  }

  if (status === 'geaccepteerd') {
    return {
      label: 'Geaccepteerd',
      badgeClass: 'bg-emerald-500/10 text-emerald-300/90 border-emerald-500/25',
      sideBorderClass: 'border-l-emerald-400/70',
      rowTintClass: 'bg-emerald-500/[0.08]',
    };
  }

  if (status === 'afgewezen') {
    return {
      label: 'Afgewezen',
      badgeClass: 'bg-red-500/10 text-red-300/90 border-red-500/25',
      sideBorderClass: 'border-l-red-400/70',
      rowTintClass: 'bg-red-500/[0.07]',
    };
  }

  if (status === 'verzonden') {
    return {
      label: 'Verstuurd',
      badgeClass: 'bg-blue-500/10 text-blue-300/90 border-blue-500/25',
      sideBorderClass: 'border-l-blue-400/70',
      rowTintClass: 'bg-blue-500/[0.07]',
    };
  }

  if (status === 'in_behandeling') {
    return isCalculated
      ? {
        label: 'Berekend',
        badgeClass: 'bg-violet-500/10 text-violet-200/90 border-violet-500/25',
        sideBorderClass: 'border-l-violet-400/70',
        rowTintClass: 'bg-violet-500/[0.08]',
      }
      : {
        label: 'Berekenen',
        badgeClass: 'bg-amber-500/10 text-amber-200/90 border-amber-500/25',
        sideBorderClass: 'border-l-amber-400/70',
        rowTintClass: 'bg-amber-500/[0.08]',
      };
  }

  return {
    label: 'Concept',
    badgeClass: 'bg-zinc-500/8 text-zinc-300/90 border-zinc-500/25',
    sideBorderClass: 'border-l-zinc-500/55',
    rowTintClass: 'bg-zinc-500/[0.05]',
  };
}

function hasCalculatedAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function getStoredQuoteTotal(quote: QuoteRow): number {
  const raw = quote.totaalbedrag ?? quote.amount ?? 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function getQuoteReferenceDate(quote: QuoteRow): Date | null {
  return quote.updatedAtDate ?? quote.createdAtDate ?? null;
}

function mapSettingsForTotals(input: unknown): QuoteCalculationSettings {
  const normalized = normalizeDataJson(input as any);
  const rawInst = (normalized?.instellingen || {}) as any;
  const rawExtras = (normalized?.extras || {}) as any;

  return {
    btwTarief: rawInst?.btwTarief || 21,
    uurTariefExclBtw: rawInst?.uurTariefExclBtw || rawInst?.uurTarief || 50,
    schattingUren: rawInst?.schattingUren ?? false,
    extras: {
      transport: {
        prijsPerKm: rawExtras?.transport?.prijsPerKm ?? rawInst?.extras?.transport?.prijsPerKm ?? rawInst?.transportPrijsPerKm,
        vasteTransportkosten: rawExtras?.transport?.vasteTransportkosten ?? rawInst?.extras?.transport?.vasteTransportkosten,
        tunnelkosten: rawExtras?.transport?.tunnelkosten ?? rawInst?.extras?.transport?.tunnelkosten,
        mode: rawExtras?.transport?.mode ?? rawInst?.extras?.transport?.mode,
      },
      winstMarge: {
        percentage: rawExtras?.winstMarge?.percentage ?? rawInst?.extras?.winstMarge?.percentage ?? 10,
        fixedAmount: rawExtras?.winstMarge?.fixedAmount ?? 0,
        mode: rawExtras?.winstMarge?.mode ?? 'percentage',
        basis: rawExtras?.winstMarge?.basis ?? 'totaal',
      },
    },
  };
}

function haalTotaalUitCalculatie(dataJson: unknown): number | null {
  if (!dataJson) return null;

  try {
    const settings = mapSettingsForTotals(dataJson);
    const totals = calculateQuoteTotals(dataJson as any, settings);
    const total = Number(totals?.totaalInclBtw || 0);
    if (Number.isFinite(total) && total > 0) return total;
  } catch (err) {
    console.warn('Kon totaal niet berekenen uit calculatie-data:', err);
  }

  const normalized = normalizeDataJson(dataJson as any) as any;
  const fallbackCandidates = [
    normalized?.totaalInclBtw,
    normalized?.totaal_incl_btw,
    normalized?.totals?.totaalInclBtw,
    normalized?.totals?.totaal_incl_btw,
    (dataJson as any)?.totaalInclBtw,
    (dataJson as any)?.totaal_incl_btw,
    (dataJson as any)?.totals?.totaalInclBtw,
    (dataJson as any)?.totals?.totaal_incl_btw,
  ];

  for (const candidate of fallbackCandidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

function haalHoofdtitelUitCalculatie(dataJson: unknown): string | null {
  if (!dataJson) return null;

  const normalized = normalizeDataJson(dataJson as any) as any;
  const candidates = [
    normalized?.korteTitel,
    normalized?.korte_titel,
    (dataJson as any)?.korteTitel,
    (dataJson as any)?.korte_titel,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }

  return null;
}

function toQuoteKlantinformatie(client: Client): Record<string, unknown> {
  const projectStraat = (client.projectStraat || '').trim();
  const projectHuisnummer = (client.projectHuisnummer || '').trim();
  const projectPostcode = (client.projectPostcode || '').trim();
  const projectPlaats = (client.projectPlaats || '').trim();
  const hasProjectAddress = !!(projectStraat || projectHuisnummer || projectPostcode || projectPlaats);
  const emailadres = (client.emailadres || '').trim();

  return {
    klanttype: (client.bedrijfsnaam || '').trim() ? 'Zakelijk' : 'Particulier',
    voornaam: (client.voornaam || '').trim(),
    achternaam: (client.achternaam || '').trim(),
    bedrijfsnaam: (client.bedrijfsnaam || '').trim(),
    emailadres,
    'e-mailadres': emailadres,
    telefoonnummer: (client.telefoonnummer || '').trim(),
    straat: (client.straat || '').trim(),
    huisnummer: (client.huisnummer || '').trim(),
    postcode: (client.postcode || '').trim(),
    plaats: (client.plaats || '').trim(),
    factuuradres: {
      straat: (client.straat || '').trim(),
      huisnummer: (client.huisnummer || '').trim(),
      postcode: (client.postcode || '').trim(),
      plaats: (client.plaats || '').trim(),
    },
    afwijkendProjectadres: hasProjectAddress,
    projectStraat,
    projectHuisnummer,
    projectPostcode,
    projectPlaats,
    projectadres: {
      straat: projectStraat || null,
      huisnummer: projectHuisnummer || null,
      postcode: projectPostcode || null,
      plaats: projectPlaats || null,
    },
  };
}

export default function OffertesPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [hoofdtitelsByQuoteId, setHoofdtitelsByQuoteId] = useState<Record<string, string>>({});
  const [isInitialHoofdtitelSyncDone, setIsInitialHoofdtitelSyncDone] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceSyncRow[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('alle');
  const [defaultFilter, setDefaultFilter] = useState<DefaultFilterMode>('concept');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const [createOpen, setCreateOpen] = useState(false);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const creatingQuoteRef = useRef(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<QuoteRow | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [updatingAcceptanceQuoteId, setUpdatingAcceptanceQuoteId] = useState<string | null>(null);
  const isSyncingTotalsRef = useRef(false);
  const isSyncingHoofdtitelsRef = useRef(false);
  const fetchedHoofdtitelIdsRef = useRef<Set<string>>(new Set());
  const didCompleteInitialHoofdtitelSyncRef = useRef(false);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedDefaultFilter = window.localStorage.getItem(OFFERTES_DEFAULT_FILTER_STORAGE_KEY);
    if (isDefaultFilterMode(storedDefaultFilter)) {
      setDefaultFilter(storedDefaultFilter);
      setFilter(storedDefaultFilter);
      return;
    }

    const storedFilter = window.localStorage.getItem(OFFERTES_FILTER_STORAGE_KEY);
    if (isFilterMode(storedFilter)) {
      setFilter(storedFilter);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(OFFERTES_FILTER_STORAGE_KEY, filter);
  }, [filter]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(OFFERTES_DEFAULT_FILTER_STORAGE_KEY, defaultFilter);
  }, [defaultFilter]);

  useEffect(() => {
    if (!user || !firestore) return;

    setLoading(true);
    setError(null);

    const ref = collection(firestore, 'quotes');
    const q = query(ref, where('userId', '==', user.uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs
          .map((docSnap) => {
            const raw = docSnap.data() as any;
            return {
              ...(raw as QuoteRow),
              id: docSnap.id,
              createdAtDate: naarDate(raw?.createdAt),
              updatedAtDate: naarDate(raw?.updatedAt),
            } as QuoteRow;
          });

        data.sort((a, b) => {
          const aNum = typeof a.offerteNummer === 'number' ? a.offerteNummer : 0;
          const bNum = typeof b.offerteNummer === 'number' ? b.offerteNummer : 0;
          return bNum - aNum;
        });

        setQuotes(data);
        setLoading(false);
      },
      (err: any) => {
        console.error('Fout bij ophalen offertes:', err);
        setError(`${err.code ?? 'error'}: ${err.message ?? 'Onbekende fout'}`);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [firestore, user]);

  useEffect(() => {
    if (!createOpen || !user || !firestore) return;

    (async () => {
      try {
        const ref = collection(firestore, 'clients');
        const q = query(ref, where('userId', '==', user.uid));
        const snap = await getDocs(q);
        const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Client));
        arr.sort((a, b) => {
          const aName = `${a.voornaam || ''} ${a.achternaam || ''} ${a.bedrijfsnaam || ''}`.trim().toLowerCase();
          const bName = `${b.voornaam || ''} ${b.achternaam || ''} ${b.bedrijfsnaam || ''}`.trim().toLowerCase();
          return aName.localeCompare(bName);
        });
        setClients(arr);
      } catch (e) {
        console.error('Fout bij ophalen klanten:', e);
      }
    })();
  }, [createOpen, firestore, user]);

  useEffect(() => {
    if (!user || !firestore) return;

    const ref = collection(firestore, 'invoices');
    const q = query(ref, where('userId', '==', user.uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => {
          const raw = docSnap.data() as any;
          return {
            id: docSnap.id,
            quoteId: raw?.quoteId,
            status: raw?.status,
            archived: !!raw?.archived,
          } as InvoiceSyncRow;
        });
        setInvoices(data);
      },
      (err: any) => {
        console.warn('Fout bij ophalen factuurstatus voor offertes:', err);
      }
    );

    return () => unsub();
  }, [firestore, user]);

  const pendingQuoteIds = useMemo(
    () => {
      return quotes
        .filter((q) => {
          if (q.status !== 'in_behandeling' && q.status !== 'concept') return false;
          if (q.archived) return false;

          const storedTotal = getStoredQuoteTotal(q);
          const calculatedFromDoc = haalTotaalUitCalculatie((q as any)?.data_json);

          if (!hasCalculatedAmount(storedTotal) && hasCalculatedAmount(calculatedFromDoc)) {
            return true;
          }

          if (hasCalculatedAmount(storedTotal) && hasCalculatedAmount(calculatedFromDoc)) {
            return Math.abs(storedTotal - calculatedFromDoc) > 0.01;
          }

          return !hasCalculatedAmount(storedTotal);
        })
        .map((q) => q.id);
    },
    [quotes]
  );

  const acceptedQuoteIdsFromInvoices = useMemo(() => {
    const ids = new Set<string>();
    invoices.forEach((invoice) => {
      if (invoice.archived) return;
      if (!invoice.quoteId) return;
      if (!invoiceImpliesAccepted(invoice.status)) return;
      ids.add(invoice.quoteId);
    });
    return ids;
  }, [invoices]);

  useEffect(() => {
    if (!user || !firestore || pendingQuoteIds.length === 0) return;

    let cancelled = false;

    const syncPendingTotals = async () => {
      if (isSyncingTotalsRef.current || cancelled) return;

        const quoteIdsToCheck = pendingQuoteIds;
        if (!quoteIdsToCheck.length) return;

        // First pass: try to repair totals directly from quote.data_json (freshest local source).
        const unresolvedQuoteIds: string[] = [];
        for (const quoteId of quoteIdsToCheck) {
          const quote = quotes.find((entry) => entry.id === quoteId);
          if (!quote) {
            unresolvedQuoteIds.push(quoteId);
            continue;
          }

          const localCalculatedTotal = haalTotaalUitCalculatie((quote as any)?.data_json);
          if (!hasCalculatedAmount(localCalculatedTotal)) {
            unresolvedQuoteIds.push(quoteId);
            continue;
          }

          const storedTotal = getStoredQuoteTotal(quote);
          if (Math.abs(storedTotal - localCalculatedTotal) <= 0.01) {
            continue;
          }

          try {
            await updateDoc(doc(firestore, 'quotes', quoteId), {
              totaalbedrag: localCalculatedTotal,
              amount: localCalculatedTotal,
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            console.warn(`Kon lokaal quote totaal niet syncen voor ${quoteId}:`, err);
            unresolvedQuoteIds.push(quoteId);
          }
        }

        if (unresolvedQuoteIds.length === 0 || cancelled) return;

        isSyncingTotalsRef.current = true;

        try {
          const token = await user.getIdToken();
        const response = await fetch('/api/quotes/get-calculations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ quoteIds: unresolvedQuoteIds }),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok !== true) return;

        const data = Array.isArray(payload.rows)
          ? (payload.rows as Array<{ quoteid: string; data_json: unknown }>)
          : [];
        if (!data.length) return;

        const rowsByQuote = new Map<string, Array<{ data_json: unknown }>>();
        for (const row of data) {
          if (!row?.quoteid) continue;
          const existing = rowsByQuote.get(row.quoteid) || [];
          existing.push({ data_json: row.data_json });
          rowsByQuote.set(row.quoteid, existing);
        }

        for (const quoteId of unresolvedQuoteIds) {
          const rows = rowsByQuote.get(quoteId) || [];
          let totalFromCalculation: number | null = null;

          for (const row of rows) {
            totalFromCalculation = haalTotaalUitCalculatie(row.data_json);
            if (hasCalculatedAmount(totalFromCalculation)) break;
          }

          if (!hasCalculatedAmount(totalFromCalculation) || cancelled) continue;

          try {
            await updateDoc(doc(firestore, 'quotes', quoteId), {
              totaalbedrag: totalFromCalculation,
              amount: totalFromCalculation,
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            console.warn(`Kon quote totaal niet syncen voor ${quoteId}:`, err);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Kon pending quote totalen niet ophalen:', err);
        }
      } finally {
        isSyncingTotalsRef.current = false;
      }
    };

    void syncPendingTotals();
    const intervalId = setInterval(() => {
      void syncPendingTotals();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [firestore, pendingQuoteIds, quotes, user]);

  const quoteTotalsById = useMemo(() => {
    const map: Record<string, number> = {};
    quotes.forEach((quote) => {
      const calculatedFromDoc = haalTotaalUitCalculatie((quote as any)?.data_json);
      const stored = getStoredQuoteTotal(quote);
      map[quote.id] = hasCalculatedAmount(calculatedFromDoc) ? calculatedFromDoc : stored;
    });
    return map;
  }, [quotes]);

  useEffect(() => {
    if (!firestore || acceptedQuoteIdsFromInvoices.size === 0 || quotes.length === 0) return;

    const quoteIdsToPromote = quotes
      .filter((quote) => acceptedQuoteIdsFromInvoices.has(quote.id) && quote.status !== 'geaccepteerd')
      .map((quote) => quote.id);

    if (quoteIdsToPromote.length === 0) return;

    let cancelled = false;

    const promoteQuotes = async () => {
      for (let i = 0; i < quoteIdsToPromote.length; i += 450) {
        if (cancelled) return;
        const chunk = quoteIdsToPromote.slice(i, i + 450);
        const batch = writeBatch(firestore);
        chunk.forEach((quoteId) => {
          batch.update(doc(firestore, 'quotes', quoteId), {
            status: 'geaccepteerd',
            updatedAt: serverTimestamp(),
          } as any);
        });
        await batch.commit();
      }
    };

    void promoteQuotes().catch((err) => {
      console.warn('Kon quote status niet automatisch op geaccepteerd zetten:', err);
    });

    return () => {
      cancelled = true;
    };
  }, [acceptedQuoteIdsFromInvoices, firestore, quotes]);

  useEffect(() => {
    if (!user || quotes.length === 0) return;

    let cancelled = false;

    const quoteIdsToCheck = quotes
      .filter((q) => {
        if (getHoofdtitel(q)) return false;
        if (hoofdtitelsByQuoteId[q.id]) return false;
        if (fetchedHoofdtitelIdsRef.current.has(q.id)) return false;
        return true;
      })
      .map((q) => q.id);

    if (quoteIdsToCheck.length === 0) {
      if (!didCompleteInitialHoofdtitelSyncRef.current) {
        didCompleteInitialHoofdtitelSyncRef.current = true;
        setIsInitialHoofdtitelSyncDone(true);
      }
      return;
    }

    const syncHoofdtitels = async () => {
      if (isSyncingHoofdtitelsRef.current || cancelled) return;
      isSyncingHoofdtitelsRef.current = true;

      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/quotes/get-calculations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ quoteIds: quoteIdsToCheck }),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok !== true) return;

        const data = Array.isArray(payload.rows)
          ? (payload.rows as Array<{ quoteid: string; data_json: unknown }>)
          : [];

        if (cancelled) return;

        const nextTitles: Record<string, string> = {};
        for (const row of data) {
          if (!row?.quoteid) continue;
          const title = haalHoofdtitelUitCalculatie(row.data_json);
          if (title) nextTitles[row.quoteid] = title;
        }

        quoteIdsToCheck.forEach((id) => fetchedHoofdtitelIdsRef.current.add(id));

        if (Object.keys(nextTitles).length > 0) {
          setHoofdtitelsByQuoteId((prev) => ({ ...prev, ...nextTitles }));
        }

      } catch (err) {
        if (!cancelled) {
          console.warn('Kon hoofdtitels niet ophalen uit calculaties:', err);
        }
      } finally {
        isSyncingHoofdtitelsRef.current = false;
        if (!cancelled && !didCompleteInitialHoofdtitelSyncRef.current) {
          didCompleteInitialHoofdtitelSyncRef.current = true;
          setIsInitialHoofdtitelSyncDone(true);
        }
      }
    };

    void syncHoofdtitels();

    return () => {
      cancelled = true;
    };
  }, [quotes, user, hoofdtitelsByQuoteId]);

  useEffect(() => {
    if (loading) return;
    if (didCompleteInitialHoofdtitelSyncRef.current) return;
    if (!user || quotes.length === 0) {
      didCompleteInitialHoofdtitelSyncRef.current = true;
      setIsInitialHoofdtitelSyncDone(true);
    }
  }, [loading, quotes.length, user]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    quotes.forEach((quote) => {
      const date = getQuoteReferenceDate(quote);
      if (!date) return;
      years.add(date.getFullYear());
    });
    const sorted = Array.from(years).sort((a, b) => b - a);
    return sorted.length > 0 ? sorted : [new Date().getFullYear()];
  }, [quotes]);

  useEffect(() => {
    if (yearOptions.length === 0) return;
    if (!yearOptions.includes(selectedYear)) {
      setSelectedYear(yearOptions[0]);
    }
  }, [selectedYear, yearOptions]);

  const quotesForSelectedYear = useMemo(() => {
    return quotes.filter((quote) => {
      const date = getQuoteReferenceDate(quote);
      if (!date) return false;
      return date.getFullYear() === selectedYear;
    });
  }, [quotes, selectedYear]);

  const filterCountsByMode = useMemo(() => {
    const countFor = (mode: FilterMode): number => {
      if (mode === 'archief') {
        return quotesForSelectedYear.filter((q) => !!q.archived).length;
      }

      const nonArchived = quotesForSelectedYear.filter((q) => !q.archived);
      if (mode === 'alle') return nonArchived.length;
      if (mode === 'concept') {
        return nonArchived.filter((q) => getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id)) === 'concept').length;
      }
      if (mode === 'verzonden') {
        return nonArchived.filter((q) => getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id)) === 'verzonden').length;
      }
      if (mode === 'geaccepteerd') {
        return nonArchived.filter((q) => getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id)) === 'geaccepteerd').length;
      }
      if (mode === 'berekend') {
        return nonArchived.filter((q) => q.status === 'in_behandeling' && hasCalculatedAmount(quoteTotalsById[q.id] ?? 0)).length;
      }
      return 0;
    };

    return {
      alle: countFor('alle'),
      concept: countFor('concept'),
      verzonden: countFor('verzonden'),
      geaccepteerd: countFor('geaccepteerd'),
      berekend: countFor('berekend'),
      archief: countFor('archief'),
    } as Record<FilterMode, number>;
  }, [quotesForSelectedYear, acceptedQuoteIdsFromInvoices, quoteTotalsById]);

  const filteredQuotes = useMemo(() => {
    const s = search.trim().toLowerCase();
    let result = [...quotesForSelectedYear];

    if (filter === 'archief') {
      result = result.filter((q) => !!q.archived);
    } else {
      result = result.filter((q) => !q.archived);
      if (filter === 'concept') result = result.filter((q) => getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id)) === 'concept');
      if (filter === 'verzonden') result = result.filter((q) => getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id)) === 'verzonden');
      if (filter === 'geaccepteerd') result = result.filter((q) => getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id)) === 'geaccepteerd');
      if (filter === 'berekend') result = result.filter((q) => q.status === 'in_behandeling' && hasCalculatedAmount(quoteTotalsById[q.id] ?? 0));
    }

    if (!s) return result;
    return result.filter((q) => {
      const klant = getKlantNaam(q).toLowerCase();
      const nr = typeof q.offerteNummer === 'number' ? String(q.offerteNummer) : '';
      const titel = (getHoofdtitel(q) || hoofdtitelsByQuoteId[q.id] || getTitel(q)).toLowerCase();
      return klant.includes(s) || nr.includes(s) || titel.includes(s);
    });
  }, [filter, quotesForSelectedYear, search, acceptedQuoteIdsFromInvoices, hoofdtitelsByQuoteId, quoteTotalsById]);

  const filteredClients = useMemo(() => {
    const s = clientSearch.trim().toLowerCase();
    if (!s) return clients.slice(0, 40);
    return clients
      .filter((c) => {
        const name = `${c.voornaam || ''} ${c.achternaam || ''} ${c.bedrijfsnaam || ''}`.toLowerCase();
        const email = (c.emailadres || '').toLowerCase();
        const city = (c.plaats || '').toLowerCase();
        return name.includes(s) || email.includes(s) || city.includes(s);
      })
      .slice(0, 40);
  }, [clientSearch, clients]);

  async function ensureManualQuoteData(quoteId: string): Promise<void> {
    if (!user) return;

    const token = await user.getIdToken();
    const response = await fetch('/api/quotes/ensure-data-json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ quoteId }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) {
      throw new Error(payload?.message || 'Kon lege offerte-data niet initialiseren.');
    }
  }

  async function handleCreateEmptyQuote(options?: { withSelectedClient?: boolean; selectedClientId?: string }): Promise<void> {
    if (!user || !firestore || creatingQuoteRef.current) return;
    const withSelectedClient = !!options?.withSelectedClient;
    const explicitSelectedClientId = options?.selectedClientId || null;
    creatingQuoteRef.current = true;
    setCreatingQuote(true);
    try {
      const quoteId = await createEmptyQuote(firestore, user.uid);

      if (withSelectedClient) {
        const clientIdToUse = explicitSelectedClientId || selectedClientId;
        const selectedClient = clientIdToUse
          ? clients.find((client) => client.id === clientIdToUse)
          : null;
        if (selectedClient) {
          await updateDoc(doc(firestore, 'quotes', quoteId), {
            klantinformatie: toQuoteKlantinformatie(selectedClient),
            updatedAt: serverTimestamp(),
          } as any);
        }
      }

      await ensureManualQuoteData(quoteId);

      setCreateOpen(false);
      setSelectedClientId(null);
      setClientSearch('');
      router.push(`/offertes/${quoteId}`);
    } catch (e: any) {
      console.error(e);
      setError(`${e?.code ?? 'error'}: ${e?.message ?? 'Kon geen offerte aanmaken.'}`);
    } finally {
      creatingQuoteRef.current = false;
      setCreatingQuote(false);
    }
  }

  async function handleCreateQuoteWithNewClient(): Promise<void> {
    if (!user || !firestore || creatingQuoteRef.current) return;
    creatingQuoteRef.current = true;
    setCreatingQuote(true);
    try {
      const quoteId = await createEmptyQuote(firestore, user.uid);
      await ensureManualQuoteData(quoteId);

      setCreateOpen(false);
      setSelectedClientId(null);
      setClientSearch('');

      const successRedirect = encodeURIComponent(`/offertes/${quoteId}`);
      router.push(`/offertes/${quoteId}/klant?successRedirect=${successRedirect}`);
    } catch (e: any) {
      console.error(e);
      setError(`${e?.code ?? 'error'}: ${e?.message ?? 'Kon geen offerte aanmaken.'}`);
    } finally {
      creatingQuoteRef.current = false;
      setCreatingQuote(false);
    }
  }

  async function setQuoteDecisionStatus(
    quote: QuoteRow,
    nextStatus: 'geaccepteerd' | 'afgewezen' | 'concept' | 'verzonden'
  ): Promise<void> {
    if (!firestore) return;
    setUpdatingAcceptanceQuoteId(quote.id);
    setError(null);
    try {
      await updateDoc(doc(firestore, 'quotes', quote.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      } as any);
    } catch (e: any) {
      console.error('Kon offerte status niet wijzigen:', e);
      setError(`${e?.code ?? 'error'}: ${e?.message ?? 'Kon status niet wijzigen.'}`);
    } finally {
      setUpdatingAcceptanceQuoteId(null);
    }
  }

  const handleSelectExistingClient = (clientId: string): void => {
    if (creatingQuoteRef.current) return;
    setSelectedClientId(clientId);
    void handleCreateEmptyQuote({ withSelectedClient: true, selectedClientId: clientId });
  };

  function openArchiveDialog(quote: QuoteRow): void {
    setArchiveTarget(quote);
    setArchiveOpen(true);
  }

  async function restoreQuote(quote: QuoteRow): Promise<void> {
    if (!user || !firestore) return;
    try {
      const ref = doc(firestore, 'quotes', quote.id);
      await updateDoc(ref, {
        archived: false,
        archivedAt: deleteField(),
        archivedBy: deleteField(),
        updatedAt: serverTimestamp(),
      } as any);
    } catch (e: any) {
      console.error(e);
      setError(`${e?.code ?? 'error'}: ${e?.message ?? 'Kon offerte niet herstellen.'}`);
    }
  }

  async function confirmArchive(): Promise<void> {
    if (!user || !firestore || !archiveTarget || archiving) return;
    setArchiving(true);
    try {
      const planningSnapshot = await getDocs(
        query(
          collection(firestore, 'planning_entries'),
          where('userId', '==', user.uid),
          where('quoteId', '==', archiveTarget.id),
        ),
      );

      if (!planningSnapshot.empty) {
        for (let index = 0; index < planningSnapshot.docs.length; index += 400) {
          const batch = writeBatch(firestore);
          planningSnapshot.docs.slice(index, index + 400).forEach((planningDoc) => {
            batch.delete(planningDoc.ref);
          });
          await batch.commit();
        }
      }

      const ref = doc(firestore, 'quotes', archiveTarget.id);
      await updateDoc(ref, {
        archived: true,
        archivedAt: serverTimestamp(),
        archivedBy: user.uid,
        updatedAt: serverTimestamp(),
      } as any);
      setArchiveOpen(false);
      setArchiveTarget(null);
    } catch (e: any) {
      console.error(e);
      setError(`${e?.code ?? 'error'}: ${e?.message ?? 'Kon offerte niet archiveren.'}`);
    } finally {
      setArchiving(false);
    }
  }

  if (isUserLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary w-8 h-8" />
      </div>
    );
  }

  const LoadingListPanel = () => (
    <div className="flex flex-col items-center justify-center py-14 gap-5">
      <div className="relative">
        <Loader2 className="h-10 w-10 animate-spin text-amber-400/90" />
        <div className="absolute inset-0 blur-xl bg-amber-500/20 rounded-full animate-pulse" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className="text-amber-300 font-medium tracking-wide">OFFERTES LADEN</div>
        <div className="text-muted-foreground text-sm animate-pulse">
          Even geduld afrubelen...
        </div>
      </div>
    </div>
  );

  const filterOptions: Array<{ value: FilterMode; label: string; count: number }> = [
    { value: 'alle', label: 'Alle', count: filterCountsByMode.alle },
    { value: 'concept', label: 'Concept', count: filterCountsByMode.concept },
    { value: 'verzonden', label: 'Verzonden', count: filterCountsByMode.verzonden },
    { value: 'geaccepteerd', label: 'Geaccepteerd', count: filterCountsByMode.geaccepteerd },
    { value: 'berekend', label: 'Berekend', count: filterCountsByMode.berekend },
    { value: 'archief', label: 'Archief', count: filterCountsByMode.archief },
  ];

  const defaultFilterLabel = defaultFilter === 'geaccepteerd' ? 'Geaccepteerd' : 'Concept';

  function handleDefaultFilterSelect(nextDefaultFilter: DefaultFilterMode): void {
    setDefaultFilter(nextDefaultFilter);
    setFilter(nextDefaultFilter);
  }

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <div className="hidden sm:block">
        <DashboardHeader user={user} title="Offertes" />
      </div>

      <main className="flex flex-col items-center p-4 pb-24 md:px-6 md:pb-10 md:pt-6">
        <div className="w-full max-w-5xl space-y-5">
          <div className="sm:hidden space-y-3">
            <div className="flex items-center justify-between pl-12 pr-1 pt-1">
              <h1 className="text-xl font-semibold text-foreground">Offertes</h1>
              <div className="h-8 w-8 rounded-full border border-border/80 bg-card/70 text-xs font-medium text-muted-foreground flex items-center justify-center">
                {((user?.displayName || user?.email || 'U').trim().charAt(0) || 'U').toUpperCase()}
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoek op klant, offertennummer of titel..."
                className="h-11 rounded-xl pl-10"
              />
            </div>

            <div className="flex justify-end">
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" className="h-9 rounded-md border-border/70 px-3 text-xs sm:text-sm">
                      Standaard: {defaultFilterLabel}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Open offertes standaard op</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleDefaultFilterSelect('concept')}>
                      Concept {defaultFilter === 'concept' ? '(actief)' : ''}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDefaultFilterSelect('geaccepteerd')}>
                      Geaccepteerd {defaultFilter === 'geaccepteerd' ? '(actief)' : ''}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <select
                  value={String(selectedYear)}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="h-9 rounded-md border border-border/70 bg-background/70 px-3 text-sm text-foreground"
                >
                  {yearOptions.map((year) => (
                    <option key={`mobile-year-${year}`} value={year}>
                      Jaar {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="-mx-1 overflow-x-auto pb-1">
              <div className="flex w-max items-center gap-2 px-1">
                {filterOptions.map((option) => (
                  <Button
                    key={`mobile-${option.value}`}
                    type="button"
                    variant={filter === option.value ? 'default' : 'ghost'}
                    onClick={() => setFilter(option.value)}
                    className={cn(
                      'h-9 rounded-full px-4 transition-all duration-200 active:scale-[0.98]',
                      filter === option.value
                        ? 'bg-cyan-500/90 text-black hover:bg-cyan-400'
                        : 'border border-border/70 bg-transparent text-muted-foreground/85 hover:border-cyan-500/25 hover:bg-cyan-500/8 hover:text-cyan-200'
                    )}
                  >
                    <span>{option.label}</span>
                    <span className={cn(
                      'ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold',
                      filter === option.value ? 'bg-black/20 text-black' : 'bg-muted/50 text-foreground/80'
                    )}>
                      {option.count}
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <Card className="hidden sm:block">
            <CardContent className="space-y-4 pt-5">
              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Zoek op klant, offertenummer of titel..."
                    className="pl-9"
                  />
                </div>

                <select
                  value={String(selectedYear)}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="h-10 rounded-md border border-border/70 bg-background/70 px-3 text-sm text-foreground"
                >
                  {yearOptions.map((year) => (
                    <option key={`desktop-year-${year}`} value={year}>
                      Jaar {year}
                    </option>
                  ))}
                </select>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" className="h-10 shrink-0 border-border/70">
                      Standaard: {defaultFilterLabel}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Open offertes standaard op</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleDefaultFilterSelect('concept')}>
                      Concept {defaultFilter === 'concept' ? '(actief)' : ''}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDefaultFilterSelect('geaccepteerd')}>
                      Geaccepteerd {defaultFilter === 'geaccepteerd' ? '(actief)' : ''}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" className="h-10 shrink-0 gap-2 px-4 hidden sm:inline-flex">
                      <Plus className="h-4 w-4" />
                      Nieuwe offerte
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Nieuwe offerte</DialogTitle>
                      <DialogDescription>
                        Kies een bestaande klant of voeg een nieuwe klant toe. De offerte zelf start leeg.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                      <Input
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        placeholder="Zoek klanten op naam, e-mail of plaats..."
                      />

                      <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
                        {filteredClients.length === 0 ? (
                          <div className="text-sm text-muted-foreground p-3">Geen klanten gevonden.</div>
                        ) : (
                          filteredClients.map((c) => {
                            const name = `${c.voornaam || ''} ${c.achternaam || ''}`.trim() || c.bedrijfsnaam || 'Onbekende klant';
                            const isSelected = selectedClientId === c.id;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => handleSelectExistingClient(c.id)}
                                className={cn(
                                  'w-full rounded-lg border p-3 text-left transition-colors',
                                  isSelected
                                    ? 'border-cyan-500/50 bg-cyan-500/10'
                                    : 'border-border/50 bg-background/30 hover:bg-background/50'
                                )}
                              >
                                <div className="font-semibold text-sm">{name}</div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {[c.emailadres, c.telefoonnummer, c.plaats].filter(Boolean).join(' • ') || '—'}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="success"
                          className="h-10"
                          onClick={() => {
                            void handleCreateQuoteWithNewClient();
                          }}
                          disabled={creatingQuote}
                        >
                          {creatingQuote ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Nieuwe klant toevoegen
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="flex flex-wrap gap-2.5">
                {filterOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={filter === option.value ? 'default' : 'ghost'}
                    onClick={() => setFilter(option.value)}
                    className={cn(
                      'h-9 rounded-full px-4 transition-all duration-200 active:scale-[0.98]',
                      filter === option.value
                        ? 'bg-cyan-500/90 text-black hover:bg-cyan-400'
                        : 'border border-border/70 bg-transparent text-muted-foreground/85 hover:border-cyan-500/25 hover:bg-cyan-500/8 hover:text-cyan-200'
                    )}
                  >
                    <span>{option.label}</span>
                    <span className={cn(
                      'ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold',
                      filter === option.value ? 'bg-black/20 text-black' : 'bg-muted/50 text-foreground/80'
                    )}>
                      {option.count}
                    </span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {loading || !isInitialHoofdtitelSyncDone ? (
            <Card>
              <CardContent className="p-6">
                <LoadingListPanel />
              </CardContent>
            </Card>
          ) : filteredQuotes.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <div className="font-semibold">{filter === 'archief' ? 'Geen gearchiveerde offertes gevonden' : 'Geen offertes gevonden'}</div>
                <div className="text-sm text-muted-foreground">
                  {filter === 'archief' ? 'Archiveer een offerte om die hier te zien.' : 'Maak een nieuwe lege offerte om te starten.'}
                </div>
                {filter !== 'archief' && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2 border-cyan-500/40 bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-200"
                    onClick={() => setCreateOpen(true)}
                  >
                    Nieuwe offerte
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
            <div className="space-y-3 sm:hidden">
              {filteredQuotes.map((q) => {
                const totaal = quoteTotalsById[q.id] ?? getStoredQuoteTotal(q);
                const hasCalculated = typeof totaal === 'number' && Number.isFinite(totaal) && totaal > 0;
                const effectiveStatus = getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id));
                const datum = q.updatedAtDate ?? q.createdAtDate;
                const nrLabel = typeof q.offerteNummer === 'number' ? `Offerte #${q.offerteNummer}` : 'Offerte';
                const klant = getKlantNaam(q);
                const hoofdTitel = getHoofdtitel(q) || hoofdtitelsByQuoteId[q.id] || null;
                const fallbackTitel = getTitel(q);
                const isArchived = !!q.archived;
                const acceptedByInvoice = acceptedQuoteIdsFromInvoices.has(q.id);
                const isUpdatingAcceptance = updatingAcceptanceQuoteId === q.id;
                const statusStyles = getOfferteStatusStyles(effectiveStatus, hasCalculated, isArchived);
                const showUncalculatedPlaceholder = !hasCalculated && (effectiveStatus === 'in_behandeling' || effectiveStatus === 'concept');
                const amountLabel = showUncalculatedPlaceholder ? 'Nog niet berekend' : formatCurrency(totaal);

                return (
                  <div
                    key={`mobile-${q.id}`}
                    className={cn(
                      'group relative cursor-pointer rounded-xl border border-l-[3px] border-border/80 px-4 py-3.5 shadow-sm transition-all duration-150 active:scale-[0.995]',
                      statusStyles.sideBorderClass,
                      statusStyles.rowTintClass
                    )}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(`/offertes/${q.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/offertes/${q.id}`);
                      }
                    }}
                  >
                    <div className="relative z-10 space-y-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate text-base font-bold text-foreground">{klant}</div>
                        <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', statusStyles.badgeClass)}>
                          {statusStyles.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground/70">
                        <span className="truncate">{nrLabel}</span>
                        <span className="opacity-40">•</span>
                        <span>{datum ? format(datum, 'd MMM yyyy', { locale: nl }) : '—'}</span>
                      </div>
                      {hoofdTitel ? (
                        <div className="truncate text-xs text-muted-foreground/90">{hoofdTitel}</div>
                      ) : fallbackTitel !== '—' ? (
                        <div className="truncate text-xs text-muted-foreground/90">{fallbackTitel}</div>
                      ) : null}
                      <div className="flex items-end justify-between gap-2">
                        <div className={cn('text-xl font-bold tabular-nums', showUncalculatedPlaceholder ? 'text-emerald-300' : 'text-emerald-400')}>
                          {showUncalculatedPlaceholder ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                              {amountLabel}
                            </span>
                          ) : (
                            amountLabel
                          )}
                        </div>
                        <div className="relative z-20 flex items-center gap-1">
                          <Button
                            variant="default"
                            size="sm"
                            className="h-9 gap-2 border border-emerald-400/40 bg-emerald-500/25 px-3 text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.22)] transition-all duration-150 hover:bg-emerald-500/35 hover:text-white active:scale-[0.98]"
                            aria-label="Open offerte"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              router.push(`/offertes/${q.id}`);
                            }}
                          >
                            Bekijk
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 shrink-0 rounded-lg border border-border/70 bg-background/40 transition-all duration-150 hover:bg-muted/50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                }}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Meer acties</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuLabel>Offerte acties</DropdownMenuLabel>
                              <DropdownMenuItem
                                disabled={isArchived || acceptedByInvoice || isUpdatingAcceptance}
                                onSelect={() => {
                                  if (isArchived || acceptedByInvoice || isUpdatingAcceptance) return;
                                  void setQuoteDecisionStatus(q, 'geaccepteerd');
                                }}
                              >
                                Status: Geaccepteerd
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isArchived || acceptedByInvoice || isUpdatingAcceptance}
                                onSelect={() => {
                                  if (isArchived || acceptedByInvoice || isUpdatingAcceptance) return;
                                  void setQuoteDecisionStatus(q, 'afgewezen');
                                }}
                              >
                                Status: Afgewezen
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isArchived || acceptedByInvoice || isUpdatingAcceptance}
                                onSelect={() => {
                                  if (isArchived || acceptedByInvoice || isUpdatingAcceptance) return;
                                  void setQuoteDecisionStatus(q, 'verzonden');
                                }}
                              >
                                Status: Verstuurd
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isArchived || acceptedByInvoice || isUpdatingAcceptance}
                                onSelect={() => {
                                  if (isArchived || acceptedByInvoice || isUpdatingAcceptance) return;
                                  void setQuoteDecisionStatus(q, 'concept');
                                }}
                              >
                                Status: Concept
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {isArchived ? (
                                <DropdownMenuItem
                                  onSelect={() => {
                                    void restoreQuote(q);
                                  }}
                                >
                                  <RotateCcw className="mr-2 h-4 w-4" />
                                  Herstellen
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onSelect={() => {
                                    openArchiveDialog(q);
                                  }}
                                >
                                  <Archive className="mr-2 h-4 w-4" />
                                  Archiveren
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden space-y-2 sm:block">
              {filteredQuotes.map((q) => {
                const totaal = quoteTotalsById[q.id] ?? getStoredQuoteTotal(q);
                const hasCalculated = typeof totaal === 'number' && Number.isFinite(totaal) && totaal > 0;
                const effectiveStatus = getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id));
                const datum = q.updatedAtDate ?? q.createdAtDate;
                const nrLabel = typeof q.offerteNummer === 'number' ? `Offerte #${q.offerteNummer}` : 'Offerte';
                const klant = getKlantNaam(q);
                const hoofdTitel = getHoofdtitel(q) || hoofdtitelsByQuoteId[q.id] || null;
                const fallbackTitel = getTitel(q);
                const isArchived = !!q.archived;
                const acceptedByInvoice = acceptedQuoteIdsFromInvoices.has(q.id);
                const isUpdatingAcceptance = updatingAcceptanceQuoteId === q.id;
                const statusStyles = getOfferteStatusStyles(effectiveStatus, hasCalculated, isArchived);
                const showUncalculatedPlaceholder = !hasCalculated && (effectiveStatus === 'in_behandeling' || effectiveStatus === 'concept');
                const amountLabel = showUncalculatedPlaceholder ? 'Nog niet berekend' : formatCurrency(totaal);
                const amountClass = cn(
                  'text-2xl font-bold tabular-nums',
                  showUncalculatedPlaceholder ? 'text-emerald-300' : 'text-emerald-400'
                );
                const amountMobileClass = cn(
                  'mt-2 text-xl font-bold tabular-nums',
                  showUncalculatedPlaceholder ? 'text-emerald-300' : 'text-emerald-400'
                );

                return (
                  <div
                    key={`desktop-${q.id}`}
                    className={cn(
                      'group relative cursor-pointer rounded-xl border border-l-[3px] border-border/80 px-4 py-3 shadow-sm transition-all duration-150 hover:border-border hover:shadow-md active:scale-[0.997] sm:px-5',
                      statusStyles.sideBorderClass,
                      statusStyles.rowTintClass
                    )}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(`/offertes/${q.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/offertes/${q.id}`);
                      }
                    }}
                  >
                    <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1 pointer-events-none">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="truncate text-base font-bold text-foreground sm:text-lg">{klant}</div>
                          <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', statusStyles.badgeClass)}>
                            {statusStyles.label}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground/70 sm:text-sm">
                          <span className="truncate">{nrLabel}</span>
                          <span className="opacity-40">•</span>
                          <span>{datum ? format(datum, 'd MMM yyyy', { locale: nl }) : '—'}</span>
                        </div>
                        {hoofdTitel ? (
                          <div className="mt-1 truncate text-xs text-muted-foreground/90">{hoofdTitel}</div>
                        ) : fallbackTitel !== '—' ? (
                          <div className="mt-1 truncate text-xs text-muted-foreground/90">{fallbackTitel}</div>
                        ) : null}
                        <div className={cn('sm:hidden', amountMobileClass)}>
                          {showUncalculatedPlaceholder ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                              {amountLabel}
                            </span>
                          ) : (
                            amountLabel
                          )}
                        </div>
                      </div>

                      <div className="relative z-20 flex items-center gap-1 sm:gap-4">
                        <div className="hidden min-w-[140px] text-right sm:block">
                          <div className={amountClass}>
                            {showUncalculatedPlaceholder ? (
                              <span className="inline-flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                                {amountLabel}
                              </span>
                            ) : (
                              amountLabel
                            )}
                          </div>
                        </div>

                        <Button
                          variant="default"
                          size="sm"
                          className="h-9 gap-2 border border-emerald-400/40 bg-emerald-500/25 text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.22)] transition-all duration-150 hover:bg-emerald-500/35 hover:text-white active:scale-[0.98]"
                          aria-label="Open offerte"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            router.push(`/offertes/${q.id}`);
                          }}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Bekijk offerte
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 shrink-0 rounded-lg border border-border/70 bg-background/40 transition-all duration-150 hover:bg-muted/50"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                              }}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Meer acties</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuLabel>Offerte acties</DropdownMenuLabel>
                            <DropdownMenuItem
                              disabled={isArchived || acceptedByInvoice || isUpdatingAcceptance}
                              onSelect={() => {
                                if (isArchived || acceptedByInvoice || isUpdatingAcceptance) return;
                                void setQuoteDecisionStatus(q, 'geaccepteerd');
                              }}
                            >
                              Status: Geaccepteerd
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={isArchived || acceptedByInvoice || isUpdatingAcceptance}
                              onSelect={() => {
                                if (isArchived || acceptedByInvoice || isUpdatingAcceptance) return;
                                void setQuoteDecisionStatus(q, 'afgewezen');
                              }}
                            >
                              Status: Afgewezen
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={isArchived || acceptedByInvoice || isUpdatingAcceptance}
                              onSelect={() => {
                                if (isArchived || acceptedByInvoice || isUpdatingAcceptance) return;
                                void setQuoteDecisionStatus(q, 'verzonden');
                              }}
                            >
                              Status: Verstuurd
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={isArchived || acceptedByInvoice || isUpdatingAcceptance}
                              onSelect={() => {
                                if (isArchived || acceptedByInvoice || isUpdatingAcceptance) return;
                                void setQuoteDecisionStatus(q, 'concept');
                              }}
                            >
                              Status: Concept
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {isArchived ? (
                              <DropdownMenuItem
                                onSelect={() => {
                                  void restoreQuote(q);
                                }}
                              >
                                <RotateCcw className="mr-2 h-4 w-4" />
                                Herstellen
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onSelect={() => {
                                  openArchiveDialog(q);
                                }}
                              >
                                <Archive className="mr-2 h-4 w-4" />
                                Archiveren
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            </>
          )}
        </div>
      </main>

      <Button
        type="button"
        className="fixed bottom-5 right-4 z-40 h-12 gap-2 rounded-full px-4 shadow-lg shadow-cyan-900/30 sm:hidden"
        onClick={() => setCreateOpen(true)}
      >
        <Plus className="h-4 w-4" />
        Nieuwe offerte
      </Button>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Offerte archiveren?</AlertDialogTitle>
              <AlertDialogDescription>
                Deze offerte wordt verplaatst naar het archief. Je kunt dit later ongedaan maken via het archief.
                {archiveTarget ? (
                  <div className="mt-3 text-xs text-muted-foreground">
                    <span className="font-mono text-foreground">
                      {archiveTarget.offerteNummer ? `Offerte #${archiveTarget.offerteNummer}` : 'Offerte'}
                    </span>
                    <span className="opacity-30 mx-2">•</span>
                    <span>{getKlantNaam(archiveTarget)}</span>
                  </div>
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-2">
              <AlertDialogCancel disabled={archiving} className="rounded-xl">
                Annuleren
              </AlertDialogCancel>
              <Button
                type="button"
                onClick={confirmArchive}
                disabled={archiving}
                variant="destructiveSoft"
              >
                {archiving ? 'Archiveren...' : 'Archiveren'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
