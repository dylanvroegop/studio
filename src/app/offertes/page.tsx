'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  addDoc,
  collection,
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
  Calendar,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFirestore, useUser } from '@/firebase';
import { createEmptyQuote } from '@/lib/firestore-actions';
import { calculateQuoteTotals, normalizeDataJson, QuoteSettings as QuoteCalculationSettings } from '@/lib/quote-calculations';
import { getEffectiveQuoteStatus, invoiceImpliesAccepted } from '@/lib/quote-status';
import { supabase } from '@/lib/supabase';
import type { InvoiceStatus, Quote } from '@/lib/types';
import { cn } from '@/lib/utils';

type FilterMode = 'alle' | 'concept' | 'verzonden';

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

function getStatusMeta(
  status: Quote['status'] | undefined,
  isCalculated?: boolean
): { label: string; className: string; sideBorderClass: string } {
  const map: Record<string, { label: string; className: string; sideBorderClass: string }> = {
    concept: {
      label: 'Concept',
      className: 'bg-zinc-800 text-zinc-200 border-zinc-700',
      sideBorderClass: 'border-l-zinc-500/70',
    },
    in_behandeling: isCalculated
      ? {
        label: 'Berekend',
        className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
        sideBorderClass: 'border-l-emerald-500',
      }
      : {
        label: 'Berekenen',
        className: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
        sideBorderClass: 'border-l-amber-500',
      },
    verzonden: {
      label: 'Verzonden',
      className: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
      sideBorderClass: 'border-l-cyan-500',
    },
    geaccepteerd: {
      label: 'Geaccepteerd',
      className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
      sideBorderClass: 'border-l-emerald-500',
    },
    afgewezen: {
      label: 'Afgewezen',
      className: 'bg-red-500/10 text-red-300 border-red-500/30',
      sideBorderClass: 'border-l-red-500',
    },
    verlopen: {
      label: 'Verlopen',
      className: 'bg-zinc-800 text-zinc-400 border-zinc-700',
      sideBorderClass: 'border-l-zinc-700',
    },
  };

  return map[status || 'concept'] || map.concept;
}

function hasCalculatedAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
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

const EMPTY_CLIENT: Client = {
  id: '',
  voornaam: '',
  achternaam: '',
  bedrijfsnaam: '',
  emailadres: '',
  telefoonnummer: '',
  straat: '',
  huisnummer: '',
  postcode: '',
  plaats: '',
  projectStraat: '',
  projectHuisnummer: '',
  projectPostcode: '',
  projectPlaats: '',
};

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
  const [invoices, setInvoices] = useState<InvoiceSyncRow[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('alle');

  const [createOpen, setCreateOpen] = useState(false);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const creatingQuoteRef = useRef(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClient, setNewClient] = useState<Client>(EMPTY_CLIENT);
  const [creatingClient, setCreatingClient] = useState(false);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<QuoteRow | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [deletingConcepts, setDeletingConcepts] = useState(false);
  const [deletingCalculatedQuotes, setDeletingCalculatedQuotes] = useState(false);
  const isSyncingTotalsRef = useRef(false);

  const isDev = process.env.NODE_ENV !== 'production';

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

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
          })
          .filter((quote) => !quote.archived);

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
    () =>
      quotes
        .filter((q) => q.status === 'in_behandeling' && !hasCalculatedAmount(q.totaalbedrag || q.amount || 0))
        .map((q) => q.id),
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

      isSyncingTotalsRef.current = true;

      try {
        const { data, error } = await supabase
          .from('quotes_collection')
          .select('quoteid, data_json, created_at')
          .in('quoteid', quoteIdsToCheck)
          .order('created_at', { ascending: false });

        if (error || !data?.length) return;

        const rowsByQuote = new Map<string, Array<{ data_json: unknown }>>();
        for (const row of data as Array<{ quoteid: string; data_json: unknown }>) {
          if (!row?.quoteid) continue;
          const existing = rowsByQuote.get(row.quoteid) || [];
          existing.push({ data_json: row.data_json });
          rowsByQuote.set(row.quoteid, existing);
        }

        for (const quoteId of quoteIdsToCheck) {
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
  }, [firestore, pendingQuoteIds, user]);

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

  const filteredQuotes = useMemo(() => {
    const s = search.trim().toLowerCase();
    let result = [...quotes];

    if (filter === 'concept') result = result.filter((q) => getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id)) === 'concept');
    if (filter === 'verzonden') result = result.filter((q) => getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id)) === 'verzonden');

    if (!s) return result;
    return result.filter((q) => {
      const klant = getKlantNaam(q).toLowerCase();
      const nr = typeof q.offerteNummer === 'number' ? String(q.offerteNummer) : '';
      const titel = getTitel(q).toLowerCase();
      return klant.includes(s) || nr.includes(s) || titel.includes(s);
    });
  }, [filter, quotes, search, acceptedQuoteIdsFromInvoices]);

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

  async function handleCreateEmptyQuote(options?: { withSelectedClient?: boolean }): Promise<void> {
    if (!user || !firestore || creatingQuoteRef.current) return;
    const withSelectedClient = !!options?.withSelectedClient;
    creatingQuoteRef.current = true;
    setCreatingQuote(true);
    try {
      const quoteId = await createEmptyQuote(firestore, user.uid);

      if (withSelectedClient && selectedClientId) {
        const selectedClient = clients.find((client) => client.id === selectedClientId);
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

  async function handleCreateClient(): Promise<void> {
    if (!user || !firestore || creatingClient) return;

    const voornaam = (newClient.voornaam || '').trim();
    const achternaam = (newClient.achternaam || '').trim();
    if (!voornaam && !achternaam) return;

    setCreatingClient(true);
    try {
      const docRef = await addDoc(collection(firestore, 'clients'), {
        userId: user.uid,
        voornaam: newClient.voornaam || '',
        achternaam: newClient.achternaam || '',
        bedrijfsnaam: newClient.bedrijfsnaam || '',
        emailadres: newClient.emailadres || '',
        telefoonnummer: newClient.telefoonnummer || '',
        straat: newClient.straat || '',
        huisnummer: newClient.huisnummer || '',
        postcode: newClient.postcode || '',
        plaats: newClient.plaats || '',
        afwijkendProjectadres: true,
        projectStraat: newClient.projectStraat || '',
        projectHuisnummer: newClient.projectHuisnummer || '',
        projectPostcode: newClient.projectPostcode || '',
        projectPlaats: newClient.projectPlaats || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        klanttype: newClient.bedrijfsnaam ? 'Zakelijk' : 'Particulier',
      });

      const created = { ...newClient, id: docRef.id, userId: user.uid };
      setClients((prev) => [created, ...prev]);
      setSelectedClientId(docRef.id);
      setNewClient(EMPTY_CLIENT);
      setNewClientOpen(false);
    } catch (e) {
      console.error('Fout bij klant aanmaken:', e);
    } finally {
      setCreatingClient(false);
    }
  }

  function openArchiveDialog(quote: QuoteRow): void {
    setArchiveTarget(quote);
    setArchiveOpen(true);
  }

  async function confirmArchive(): Promise<void> {
    if (!user || !firestore || !archiveTarget || archiving) return;
    setArchiving(true);
    try {
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

  async function handleDeleteAllConceptQuotes(): Promise<void> {
    if (!user || !firestore || deletingConcepts || deletingCalculatedQuotes || !isDev) return;

    const conceptQuotes = quotes.filter((q) => q.status === 'concept');
    if (!conceptQuotes.length) return;

    const akkoord = window.confirm(
      `Weet je zeker dat je ${conceptQuotes.length} concept offertes definitief wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`
    );
    if (!akkoord) return;

    setDeletingConcepts(true);
    try {
      for (let i = 0; i < conceptQuotes.length; i += 450) {
        const chunk = conceptQuotes.slice(i, i + 450);
        const batch = writeBatch(firestore);
        chunk.forEach((quote) => {
          batch.delete(doc(firestore, 'quotes', quote.id));
        });
        await batch.commit();
      }
    } catch (e: any) {
      console.error(e);
      setError(`${e?.code ?? 'error'}: ${e?.message ?? 'Kon concept offertes niet verwijderen.'}`);
    } finally {
      setDeletingConcepts(false);
    }
  }

  async function handleDeleteAllCalculatedQuotes(): Promise<void> {
    if (!user || !firestore || deletingCalculatedQuotes || deletingConcepts || !isDev) return;

    const calculatedQuotes = quotes.filter(
      (q) => q.status === 'in_behandeling' && hasCalculatedAmount(q.totaalbedrag || q.amount || 0)
    );
    if (!calculatedQuotes.length) return;

    const akkoord = window.confirm(
      `Weet je zeker dat je ${calculatedQuotes.length} berekende offertes definitief wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`
    );
    if (!akkoord) return;

    setDeletingCalculatedQuotes(true);
    try {
      for (let i = 0; i < calculatedQuotes.length; i += 450) {
        const chunk = calculatedQuotes.slice(i, i + 450);
        const batch = writeBatch(firestore);
        chunk.forEach((quote) => {
          batch.delete(doc(firestore, 'quotes', quote.id));
        });
        await batch.commit();
      }
    } catch (e: any) {
      console.error(e);
      setError(`${e?.code ?? 'error'}: ${e?.message ?? 'Kon berekende offertes niet verwijderen.'}`);
    } finally {
      setDeletingCalculatedQuotes(false);
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

  return (
    <TooltipProvider>
      <div className="app-shell min-h-screen bg-background pb-10">
        <AppNavigation />
        <DashboardHeader user={user} title="Offertes" />

        <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
          <div className="w-full max-w-3xl space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-cyan-400" />
                  Overzicht
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                    {error}
                  </div>
                )}

                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Zoek op klant, offertenummer of titel..."
                      className="pl-9"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                      <DialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 gap-2 border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 hover:text-cyan-100"
                        >
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
                                    onClick={() => setSelectedClientId(c.id)}
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

                          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setNewClientOpen(true)}
                              className="h-10"
                            >
                              Nieuwe klant toevoegen
                            </Button>

                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="h-10"
                                onClick={() => handleCreateEmptyQuote()}
                                disabled={creatingQuote}
                              >
                                {creatingQuote ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Start zonder klant
                              </Button>
                              <Button
                                type="button"
                                className="h-10 border-cyan-500/50 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30"
                                onClick={() => handleCreateEmptyQuote({ withSelectedClient: true })}
                                disabled={creatingQuote || !selectedClientId}
                              >
                                {creatingQuote ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Start met klant
                              </Button>
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>

                    <Button
                      type="button"
                      variant={filter === 'alle' ? 'outline' : 'ghost'}
                      onClick={() => setFilter('alle')}
                      className={cn('h-10', filter === 'alle' && 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200')}
                    >
                      Alle
                    </Button>
                    <Button
                      type="button"
                      variant={filter === 'concept' ? 'outline' : 'ghost'}
                      onClick={() => setFilter('concept')}
                      className={cn('h-10', filter === 'concept' && 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200')}
                    >
                      Concept
                    </Button>
                    <Button
                      type="button"
                      variant={filter === 'verzonden' ? 'outline' : 'ghost'}
                      onClick={() => setFilter('verzonden')}
                      className={cn('h-10', filter === 'verzonden' && 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200')}
                    >
                      Verzonden
                    </Button>
                    {isDev ? (
                      <div className="flex flex-col gap-2">
                        <Button
                          type="button"
                          variant="destructiveSoft"
                          className="h-10"
                          onClick={handleDeleteAllConceptQuotes}
                          disabled={deletingConcepts || deletingCalculatedQuotes || !quotes.some((q) => q.status === 'concept')}
                        >
                          {deletingConcepts ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                          Verwijder alle concepten
                        </Button>
                        <Button
                          type="button"
                          variant="destructiveSoft"
                          className="h-10"
                          onClick={handleDeleteAllCalculatedQuotes}
                          disabled={
                            deletingCalculatedQuotes
                            || deletingConcepts
                            || !quotes.some((q) => q.status === 'in_behandeling' && hasCalculatedAmount(q.totaalbedrag || q.amount || 0))
                          }
                        >
                          {deletingCalculatedQuotes ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-2" />
                          )}
                          Verwijder alle berekende
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>

            {loading ? (
              <Card>
                <CardContent className="p-6">
                  <LoadingListPanel />
                </CardContent>
              </Card>
            ) : filteredQuotes.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center space-y-3">
                  <div className="font-semibold">Geen offertes gevonden</div>
                  <div className="text-sm text-muted-foreground">
                    Maak een nieuwe lege offerte om te starten.
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2 border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                    onClick={() => setCreateOpen(true)}
                  >
                    Nieuwe offerte
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredQuotes.map((q) => {
                  const totaal = q.totaalbedrag || q.amount || 0;
                  const hasCalculated = typeof totaal === 'number' && Number.isFinite(totaal) && totaal > 0;
                  const effectiveStatus = getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id));
                  const statusMeta = getStatusMeta(effectiveStatus, hasCalculated);
                  const datum = q.updatedAtDate ?? q.createdAtDate;
                  const nrLabel = typeof q.offerteNummer === 'number' ? `Offerte #${q.offerteNummer}` : null;
                  const klant = getKlantNaam(q);
                  const isCalculating = effectiveStatus === 'in_behandeling' && !hasCalculated;

                  return (
                    <div
                      key={q.id}
                      className={cn(
                        'group relative flex items-center justify-between gap-4 rounded-xl border border-l-4 border-white/5 bg-card/40 px-5 py-4 hover:bg-card/60 hover:border-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 fill-mode-both',
                        statusMeta.sideBorderClass
                      )}
                    >
                      <Link
                        href={`/offertes/${q.id}`}
                        aria-label={nrLabel ? `${nrLabel} openen voor ${klant}` : `Offerte openen voor ${klant}`}
                        className="absolute inset-0 z-0"
                      />

                      <div className="flex-1 min-w-0 z-10 pointer-events-none space-y-1">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-bold text-zinc-100 truncate text-base group-hover:text-white transition-colors">
                            {klant}
                          </span>

                          {nrLabel && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-white/5 bg-white/5 text-zinc-400 shrink-0">
                              {nrLabel}
                            </span>
                          )}

                          <span
                            className={cn(
                              'text-[10px] font-semibold px-2 py-1 rounded-full border shrink-0 inline-flex items-center gap-1.5',
                              statusMeta.className
                            )}
                          >
                            {isCalculating && <Loader2 className="h-3 w-3 animate-spin" />}
                            {statusMeta.label}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-sm text-zinc-500">
                          <span className="truncate max-w-[200px] text-zinc-400 font-medium">
                            {getTitel(q)}
                          </span>
                          <span className="opacity-20">•</span>
                          <span className="flex items-center gap-1.5 group-hover:text-zinc-300 transition-colors">
                            <Calendar className="h-3.5 w-3.5 opacity-70" />
                            {datum ? format(datum, 'd MMM yyyy', { locale: nl }) : '—'}
                          </span>
                          <span className="opacity-20">•</span>
                          <span className={cn('font-semibold tracking-wide', totaal > 0 ? 'text-emerald-300' : 'text-zinc-600')}>
                            {formatCurrency(totaal)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 z-20 opacity-70 group-hover:opacity-100 transition-opacity">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2 h-9 border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 hover:text-cyan-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                router.push(`/offertes/${q.id}`);
                              }}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span>Offerte</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Open de offerte</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="gap-2 h-9 bg-zinc-800/80 hover:bg-zinc-700 border border-white/5 shadow-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                router.push(`/offertes/${q.id}/overzicht`);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span>Calculatie</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Open de calculatie</TooltipContent>
                        </Tooltip>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 hover:border hover:border-red-500/20 rounded-lg transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            openArchiveDialog(q);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Archiveren</span>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Offerte archiveren?</AlertDialogTitle>
              <AlertDialogDescription>
                Deze offerte wordt verplaatst naar het archief. Je kunt dit later ongedaan maken via het archief.
                {archiveTarget ? (
                  <div className="mt-3 text-xs text-muted-foreground">
                    <span className="font-mono text-zinc-300">
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

        <Dialog
          open={newClientOpen}
          onOpenChange={(open) => {
            setNewClientOpen(open);
            if (!open) setNewClient(EMPTY_CLIENT);
          }}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
            <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
              <DialogTitle>Nieuwe klant toevoegen</DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="grid gap-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Voornaam</Label>
                    <Input
                      value={newClient.voornaam || ''}
                      placeholder="Voornaam"
                      onChange={(e) => setNewClient((prev) => ({ ...prev, voornaam: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Achternaam</Label>
                    <Input
                      value={newClient.achternaam || ''}
                      placeholder="Achternaam"
                      onChange={(e) => setNewClient((prev) => ({ ...prev, achternaam: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Bedrijfsnaam (optioneel)</Label>
                  <Input
                    value={newClient.bedrijfsnaam || ''}
                    placeholder="Bedrijf B.V."
                    onChange={(e) => setNewClient((prev) => ({ ...prev, bedrijfsnaam: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <Input
                      value={newClient.emailadres || ''}
                      placeholder="naam@voorbeeld.nl"
                      onChange={(e) => setNewClient((prev) => ({ ...prev, emailadres: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefoon</Label>
                    <Input
                      value={newClient.telefoonnummer || ''}
                      placeholder="06 12345678"
                      onChange={(e) => setNewClient((prev) => ({ ...prev, telefoonnummer: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-4 rounded-lg border p-4 bg-muted/10">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">Factuuradres</span>
                    <div className="flex-1 border-t" />
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="col-span-3 space-y-2">
                      <Label>Straat</Label>
                      <Input
                        value={newClient.straat || ''}
                        placeholder="Straatnaam"
                        onChange={(e) => setNewClient((prev) => ({ ...prev, straat: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Nr.</Label>
                      <Input
                        value={newClient.huisnummer || ''}
                        placeholder="Nr."
                        onChange={(e) => setNewClient((prev) => ({ ...prev, huisnummer: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Postcode</Label>
                      <Input
                        value={newClient.postcode || ''}
                        placeholder="1234 AB"
                        onChange={(e) => setNewClient((prev) => ({ ...prev, postcode: e.target.value }))}
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Plaats</Label>
                      <Input
                        value={newClient.plaats || ''}
                        placeholder="Plaatsnaam"
                        onChange={(e) => setNewClient((prev) => ({ ...prev, plaats: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setNewClientOpen(false)}>
                  Annuleren
                </Button>
                <Button type="button" onClick={handleCreateClient} disabled={creatingClient}>
                  {creatingClient ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Klant opslaan
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
