'use client';

import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import type { QuoteAdvanceCandidate } from '@/lib/invoice-bank-matching';
import { Button } from '@/components/ui/button';

const euro = (cents: number) => (cents / 100).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });

export function useQuoteAdvancePayments(user: User | null, quoteId: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string; connected: boolean; lastSyncedAt?: string | null; candidates: QuoteAdvanceCandidate[]; error?: string;
  } | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [skip, setSkip] = useState(false);
  useEffect(() => {
    if (!quoteId || ids.length || skip) return;
    const refresh = () => setAttempt((value) => value + 1);
    window.addEventListener('knab:bijgewerkt', refresh);
    return () => window.removeEventListener('knab:bijgewerkt', refresh);
  }, [quoteId, ids.length, skip]);
  const key = user && quoteId ? JSON.stringify([user.uid, quoteId, attempt]) : '';
  useEffect(() => {
    setResult(null);
    setIds([]);
    setSkip(false);
    if (!user || !quoteId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/facturen/bank-payments?view=quote-advances&quoteId=${encodeURIComponent(quoteId)}`, {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store', signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.message || 'Knab-betalingen konden niet worden geladen.');
        if (controller.signal.aborted) return;
        const candidates: QuoteAdvanceCandidate[] = payload.data.candidates;
        setIds(candidates.length === 1 && candidates[0].numberMatch ? [candidates[0].transactionId] : []);
        setResult({ key, connected: payload.data.connected, lastSyncedAt: payload.data.lastSyncedAt, candidates });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key, connected: false, candidates: [],
          error: error instanceof Error ? error.message : 'Knab-betalingen konden niet worden geladen.' });
      }
    })();
    return () => controller.abort();
  }, [user, quoteId, key]);

  const view = key && result?.key === key ? result : null;
  const selected = view?.candidates.filter((row) => ids.includes(row.transactionId)) || [];
  return {
    view, selected, skip, amountCents: selected.reduce((sum, row) => sum + row.amountCents, 0),
    ready: !!view && (skip || selected.length > 0 || (!view.error && !view.candidates.length)),
    toggle: (id: string) => { setSkip(false); setIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]); },
    skipPayments: () => { setIds([]); setSkip((value) => !value); }, retry: () => setAttempt((value) => value + 1),
  };
}

export function QuoteAdvancePayments({ bank, disabled }: { bank: ReturnType<typeof useQuoteAdvancePayments>; disabled: boolean }) {
  const { view, selected } = bank;
  return <fieldset className="min-w-0 space-y-2 rounded-md border p-3 text-sm" disabled={disabled}>
    <legend className="px-1 font-medium">Voorschot via Knab</legend>
    {!view ? <p role="status">Bijschrijvingen zoeken…</p> : <>
      {view.lastSyncedAt && <p className="text-xs text-muted-foreground">Bank bijgewerkt op {new Date(view.lastSyncedAt).toLocaleString('nl-NL')}</p>}
      {view.error ? <div role="alert"><p>{view.error}</p><Button type="button" size="sm" variant="outline" onClick={bank.retry}>Opnieuw proberen</Button></div>
        : !view.connected ? <p className="text-muted-foreground">Geen actieve Knab-koppeling.</p>
          : !view.candidates.length ? <p className="text-muted-foreground">Geen bijschrijving gevonden op offertenummer of klantnaam.</p>
            : <p>Welke betalingen horen bij dit voorschot?</p>}
      {view.candidates.map((row) => <label key={row.transactionId} className="flex cursor-pointer items-start gap-3 border-t py-2">
        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={selected.some((item) => item.transactionId === row.transactionId)}
          onChange={() => bank.toggle(row.transactionId)} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2"><span>{row.name || 'Bijschrijving'}</span><strong className="shrink-0">{euro(row.amountCents)}</strong></span>
          <span className="block text-xs text-muted-foreground">{new Date(row.date).toLocaleDateString('nl-NL')} · {row.reason}</span>
          <span className="block break-words text-xs">{row.description}</span>
        </span>
      </label>)}
      {(view.error || view.candidates.length > 0) && <label className="flex cursor-pointer items-center gap-3 border-t pt-2">
        <input type="checkbox" checked={bank.skip} onChange={bank.skipPayments} className="h-4 w-4" />
        {view.error ? 'Doorgaan zonder bankcontrole' : 'Geen van deze betalingen verrekenen'}
      </label>}
    </>}
  </fieldset>;
}
