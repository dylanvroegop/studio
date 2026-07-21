'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link2, Loader2, Receipt, Search } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

type PendingCostImport = {
  id: string;
  supplier_name?: string;
  description?: string;
  amount_excl_btw?: number;
  amount_incl_btw?: number;
  date?: string;
  offerte_reference?: string | null;
  receipt_url?: string | null;
  status?: string;
  created_at?: string;
};

type QuoteOption = {
  id: string;
  label: string;
  searchable: string;
};

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeSearchText(value: unknown): string {
  return safeString(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getClientName(rawQuote: Record<string, unknown>): string {
  const info = rawQuote.klantinformatie && typeof rawQuote.klantinformatie === 'object'
    ? rawQuote.klantinformatie as Record<string, unknown>
    : {};
  return safeString(
    rawQuote.clientName
    || rawQuote.klantNaam
    || rawQuote.klantnaam
    || rawQuote.klant
    || info.bedrijfsnaam
    || info.naam
    || [info.voornaam, info.achternaam].filter(Boolean).join(' ')
  ) || 'Onbekende klant';
}

function getQuoteTitle(rawQuote: Record<string, unknown>): string {
  return safeString(
    rawQuote.title
    || rawQuote.titel
    || rawQuote.projectNaam
    || rawQuote.werkomschrijving
  ) || 'Zonder titel';
}

function formatEuro(value: unknown): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(safeNumber(value));
}

export function PendingCostImportPrompt() {
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [pending, setPending] = useState<PendingCostImport[]>([]);
  const [quotes, setQuotes] = useState<QuoteOption[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
  const [quoteSearch, setQuoteSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);

  const current = pending[0] || null;

  const filteredQuotes = useMemo(() => {
    const term = normalizeSearchText(quoteSearch);
    if (!term) return quotes.slice(0, 50);
    return quotes.filter((quote) => quote.searchable.includes(term)).slice(0, 50);
  }, [quoteSearch, quotes]);

  useEffect(() => {
    if (isUserLoading || !user || !firestore) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const [pendingResponse, quoteSnapshot] = await Promise.all([
          fetch('/api/kosten/pending', {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          }),
          getDocs(query(collection(firestore, 'quotes'), where('userId', '==', user.uid))),
        ]);
        const pendingPayload = await pendingResponse.json().catch(() => null) as {
          ok?: boolean;
          data?: PendingCostImport[];
        } | null;

        if (!pendingResponse.ok || !pendingPayload?.ok) {
          throw new Error('Openstaande facturen konden niet worden geladen.');
        }

        const quoteOptions = quoteSnapshot.docs
          .map((docSnap) => {
            const raw = docSnap.data() as Record<string, unknown>;
            if (raw.archived === true || raw.isCalculationTest === true) return null;
            const clientName = getClientName(raw);
            const title = getQuoteTitle(raw);
            const number = safeString(raw.offerteNummer);
            const label = number ? `#${number} • ${clientName} • ${title}` : `${clientName} • ${title}`;
            return {
              id: docSnap.id,
              label,
              searchable: normalizeSearchText(`${label} ${docSnap.id}`),
            };
          })
          .filter((item): item is QuoteOption => Boolean(item))
          .sort((left, right) => left.label.localeCompare(right.label, 'nl'));

        if (cancelled) return;
        const pendingItems = Array.isArray(pendingPayload.data) ? pendingPayload.data : [];
        setPending(pendingItems);
        setQuotes(quoteOptions);
        setOpen(pendingItems.length > 0);
      } catch (error) {
        if (!cancelled) {
          console.error('[PendingCostImportPrompt]', error);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [firestore, isUserLoading, user]);

  useEffect(() => {
    setSelectedQuoteId('');
    setQuoteSearch('');
  }, [current?.id]);

  const handleLink = async () => {
    if (!user || !current || !selectedQuoteId || linking) return;
    setLinking(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/kosten/create', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pending_import_id: current.id,
          offerte_id: selectedQuoteId,
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }

      setPending((previous) => previous.slice(1));
      toast({
        title: 'Factuur gekoppeld',
        description: `${safeString(current.supplier_name) || 'De factuur'} is nu als Kosten opgeslagen.`,
      });
    } catch (error) {
      toast({
        title: 'Koppelen mislukt',
        description: error instanceof Error ? error.message : 'Kon de factuur niet koppelen.',
        variant: 'destructive',
      });
    } finally {
      setLinking(false);
    }
  };

  if (!current && !loading) return null;

  return (
    <Dialog open={open && Boolean(current)} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-amber-400" />
            Factuur koppelen aan een offerte
          </DialogTitle>
          <DialogDescription>
            Deze factuur heeft geen herkenbare referentie. Kies de juiste klant/offerte voordat hij in Kosten wordt opgeslagen.
          </DialogDescription>
        </DialogHeader>

        {current ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold">{safeString(current.supplier_name) || 'Onbekende leverancier'}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {safeString(current.description) || 'Geen omschrijving'}
                  </p>
                  {current.offerte_reference ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Herkende referentie: {current.offerte_reference}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 font-semibold">{formatEuro(current.amount_incl_btw || current.amount_excl_btw)}</p>
              </div>
              {current.receipt_url ? (
                <a
                  className="mt-3 inline-flex text-sm text-emerald-400 underline underline-offset-4"
                  href={current.receipt_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Bekijk factuur/bijlage
                </a>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Juiste klant/offerte</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={quoteSearch}
                  onChange={(event) => setQuoteSearch(event.target.value)}
                  placeholder="Zoek op klant, offertenummer of project..."
                  className="pl-9"
                />
              </div>
              <Select value={selectedQuoteId} onValueChange={setSelectedQuoteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer een offerte" />
                </SelectTrigger>
                <SelectContent>
                  {filteredQuotes.length > 0 ? filteredQuotes.map((quote) => (
                    <SelectItem key={quote.id} value={quote.id}>
                      {quote.label}
                    </SelectItem>
                  )) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Geen offertes gevonden.</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {pending.length > 1 ? (
              <p className="text-xs text-muted-foreground">
                Nog {pending.length - 1} factuur{pending.length - 1 === 1 ? '' : 'en'} hierna.
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Later
          </Button>
          <Button onClick={handleLink} disabled={!selectedQuoteId || linking}>
            {linking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
            Koppel en sla op
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
