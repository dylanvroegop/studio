'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { AppNavigation } from '@/components/AppNavigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUser } from '@/firebase';
import { formatOfferteNummerLabel } from '@/lib/quote-number';
import type { InvoiceStartRow } from '@/lib/invoice-start';

const currency = (amount: number): string => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);

export default function StartFactuurPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const [rows, setRows] = useState<InvoiceStartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) router.replace('/login?next=%2Ffacturen%2Fstart');
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const startedAt = performance.now();
    void (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/facturen/start', {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.message || 'Facturen konden niet worden geladen.');
        if (!controller.signal.aborted) {
          setRows(result.rows);
          performance.measure('factureren-lijst-laden', { start: startedAt, end: performance.now() });
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Laden mislukt.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [user, attempt]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('nl-NL');
    return rows.filter((row) => term
      ? `${row.client} ${row.title} ${row.quoteNumber ?? ''}`.toLocaleLowerCase('nl-NL').includes(term)
      : showAll || row.ready);
  }, [rows, search, showAll]);

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <header className="border-b border-border py-3 pl-16 pr-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">Factureren</h1>
          <Button asChild variant="outline" size="sm"><Link href="/facturen">Alle facturen</Link></Button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 p-4 pb-12">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Zoek klant of klus" placeholder="Zoek klant, klus of offertenummer" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <Button size="sm" variant={!showAll ? 'default' : 'outline'} onClick={() => setShowAll(false)}>Te factureren</Button>
            <Button size="sm" variant={showAll ? 'default' : 'outline'} onClick={() => setShowAll(true)}>Alle klussen</Button>
          </div>
          <Button variant="ghost" size="icon" aria-label="Facturatielijst vernieuwen" disabled={loading} onClick={() => setAttempt((value) => value + 1)}><RefreshCw className="h-4 w-4" /></Button>
        </div>
        {error && <div role="alert" className="rounded border border-destructive/40 p-3 text-sm">{error}<Button variant="link" onClick={() => setAttempt((value) => value + 1)}>Opnieuw laden</Button></div>}
        {loading || isUserLoading ? (
          <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Factuurgegevens laden…</div>
        ) : filtered.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{search ? 'Geen klussen gevonden.' : 'Geen klussen klaar voor facturatie. Zoek een klant of kies Alle klussen.'}</p>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {filtered.map((row) => (
              <div key={row.id} className="space-y-2 p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.client}</p>
                    <p className="text-sm text-muted-foreground">{row.title}{row.quoteNumber !== null ? ` · #${formatOfferteNummerLabel(row.quoteNumber, row.quoteVersion ?? undefined)}` : ''}</p>
                  </div>
                  {row.total !== null && <span className="shrink-0 text-sm tabular-nums">{currency(row.total)}</span>}
                </div>
                {row.issuedAdvance > 0 && <p className="text-xs text-muted-foreground">Voorschot gefactureerd {currency(row.issuedAdvance)} · ontvangen {currency(row.receivedAdvance)}</p>}
                {row.note && <p className="text-sm text-muted-foreground">{row.note}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild size="sm"><Link href={row.href}>{row.action}{row.amount !== null ? ` · ${currency(row.amount)}` : ''}</Link></Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Snel openen op iPhone</summary>
          <p className="mt-2">Voeg deze pagina in Safari via Delen → Zet op beginscherm toe als ‘Factureren’.</p>
        </details>
      </main>
    </div>
  );
}
