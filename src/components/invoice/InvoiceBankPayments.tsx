'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { InvoiceBankCandidate, InvoiceBankView } from '@/lib/invoice-bank-matching';

interface InvoiceBankPaymentsProps { invoiceId: string; refreshKey?: string }
interface Confirmation { candidate: InvoiceBankCandidate; mode: 'add' | 'link' }
const money = (cents: number): string => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const date = (value: string): string => new Date(value).toLocaleDateString('nl-NL');

export function InvoiceBankPayments({ invoiceId, refreshKey }: InvoiceBankPaymentsProps) {
  const { user } = useUser();
  const [view, setView] = useState<InvoiceBankView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [refreshAfterMutation, setRefreshAfterMutation] = useState(0);
  const identity = `${user?.uid || ''}:${invoiceId}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const loadedIdentityRef = useRef('');
  const readSequenceRef = useRef(0);
  const mutationRef = useRef<{ identity: string; token: symbol } | null>(null);
  const needsRefreshRef = useRef(false);

  const request = useCallback(async (url: string, options?: { body?: Record<string, unknown>; signal?: AbortSignal }) => {
    if (!user) throw new Error('Log opnieuw in om betalingen te controleren.');
    const token = await user.getIdToken();
    const response = await fetch(url, {
      method: options?.body ? 'POST' : 'GET', cache: 'no-store', signal: options?.signal,
      headers: { Authorization: `Bearer ${token}`, ...(options?.body ? { 'Content-Type': 'application/json' } : {}) },
      ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const result = await response.json();
    if (!response.ok || result.ok === false) throw new Error(result.message || result.error || 'Bankbetalingen konden niet worden geladen.');
    return result as { data: InvoiceBankView; applied?: number; invoiceMatching?: { applied: number; remaining: number; warnings: string[] } };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (loadedIdentityRef.current !== identity) {
      loadedIdentityRef.current = identity;
      setView(null); setNotice(''); setConfirmation(null); setError('');
      setBusy(mutationRef.current?.identity === identity);
      setLoading(true);
    }
    if (mutationRef.current?.identity === identity) {
      needsRefreshRef.current = true;
      return;
    }
    const controller = new AbortController();
    const sequence = ++readSequenceRef.current;
    const current = () => !controller.signal.aborted && identityRef.current === identity && readSequenceRef.current === sequence;
    setLoading(true);
    setError('');
    // Bezoek/prefetch is altijd alleen lezen. Boekingen vragen een bewuste actie.
    void request(`/api/facturen/bank-payments?invoiceId=${encodeURIComponent(invoiceId)}`, { signal: controller.signal })
      .then((result) => { if (current()) setView(result.data); })
      .catch((cause: unknown) => { if (current()) setError(cause instanceof Error ? cause.message : 'Bankbetalingen konden niet worden geladen.'); })
      .finally(() => { if (current()) setLoading(false); });
    return () => controller.abort();
  }, [invoiceId, identity, refreshKey, refreshAfterMutation, user, request]);

  const beginMutation = () => {
    const token = Symbol('bank-payment');
    mutationRef.current = { identity, token };
    ++readSequenceRef.current;
    needsRefreshRef.current = false;
    setBusy(true); setError(''); setNotice('');
    return {
      current: () => identityRef.current === identity && mutationRef.current?.token === token,
      finish: () => {
        if (mutationRef.current?.token !== token) return;
        // Ook na navigatie moet de oude operatie vrijkomen; geen UI van de
        // nieuwe factuur bijwerken en nooit een nieuwere operatie opruimen.
        mutationRef.current = null;
        if (identityRef.current !== identity) return;
        setBusy(false); setLoading(false);
        if (needsRefreshRef.current) {
          needsRefreshRef.current = false;
          setRefreshAfterMutation((value) => value + 1);
        }
      },
    };
  };

  const checkPayments = async (): Promise<void> => {
    if (busy || mutationRef.current?.identity === identity) return;
    const linkedBefore = view?.linkedCents || 0;
    const { current, finish } = beginMutation();
    try {
      const sync = await request('/api/bank/sync-enablebanking', { body: {} });
      if (!current()) return;
      const result = await request('/api/facturen/bank-payments', { body: { invoiceId, action: 'reconcile' } });
      if (!current()) return;
      ++readSequenceRef.current;
      setView(result.data);
      const applied = (result.applied || 0) + (sync.invoiceMatching?.applied || 0);
      const linkedNow = Math.max(0, result.data.linkedCents - linkedBefore);
      setNotice(linkedNow > 0 ? `${money(linkedNow)} via Knab bevestigd voor deze factuur.`
        : result.data.candidates.length ? 'Controleer de onderstaande betaalvoorstellen.'
          : applied > 0 ? `${applied} betaling${applied === 1 ? '' : 'en'} bij andere facturen gekoppeld. Voor deze factuur geen nieuwe betaling gevonden.`
            : 'Geen nieuwe passende betaling gevonden.');
      if (sync.invoiceMatching?.warnings.length) setError(sync.invoiceMatching.warnings.join(' '));
      else if (sync.invoiceMatching?.remaining) setNotice(`${applied} betalingen gekoppeld. Controleer opnieuw voor de overige ${sync.invoiceMatching.remaining} betalingen.`);
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : 'Betalingen controleren is mislukt.'); }
    finally { finish(); }
  };

  const confirmPayment = async (): Promise<void> => {
    if (!confirmation || busy || mutationRef.current?.identity === identity) return;
    const { current, finish } = beginMutation();
    try {
      const { candidate, mode } = confirmation;
      const result = await request('/api/facturen/bank-payments', { body: {
        invoiceId, action: 'confirm', transactionId: candidate.transactionId, mode,
        amountCents: mode === 'add' ? candidate.suggestedCents : candidate.linkExistingCents,
      } });
      if (!current()) return;
      ++readSequenceRef.current;
      setView(result.data);
      setConfirmation(null);
      setNotice(mode === 'link' ? 'Bankbetaling gekoppeld aan het eerder geregistreerde bedrag.' : 'Bankbetaling geboekt. Factuur bijgewerkt.');
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : 'Betaling koppelen is mislukt.'); }
    finally { finish(); }
  };

  return (
    <section className="space-y-3 rounded-md border p-3" aria-label="Knab-betalingen">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Knab-betalingen</h3>
          <p className="text-xs text-muted-foreground">
            {view?.lastSyncedAt ? `Laatst bijgewerkt: ${new Date(view.lastSyncedAt).toLocaleString('nl-NL')}` : 'Bankstatus nog niet gecontroleerd'}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={busy || loading || view?.connected === false} onClick={() => void checkPayments()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Controleer betalingen
        </Button>
      </div>
      {loading && <p className="text-sm text-muted-foreground">Bankgegevens laden…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {view && !view.connected && <p className="text-sm text-muted-foreground">Geen actieve Knab-koppeling. <Link className="underline" href="/bank-overzicht">Open bankoverzicht</Link></p>}
      {view?.connected && <>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span>Via Knab bevestigd: <strong>{money(view.linkedCents)}</strong></span>
          <span>Openstaand: <strong>{money(view.openCents)}</strong></span>
        </div>
        {view.unlinkedPaidCents > 0 && <p className="text-xs text-muted-foreground">{money(view.unlinkedPaidCents)} handmatig geregistreerd, nog niet aan een bankbetaling gekoppeld.</p>}
        {view.candidates.length === 0 && !notice && <p className="text-xs text-muted-foreground">Geen passende bijschrijving in de opgeslagen bankgegevens.</p>}
        {view.candidates.map((candidate) => (
          <div key={candidate.transactionId} className="space-y-2 border-t pt-3">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{candidate.name || 'Bijschrijving'} · {date(candidate.date)}</span>
              <strong className="shrink-0">{money(candidate.amountCents)}</strong>
            </div>
            <p className="break-words text-xs text-muted-foreground">{candidate.description}</p>
            <p className="text-xs">{candidate.reason}</p>
            <div className="flex flex-wrap gap-2">
              {candidate.linkExistingCents > 0 && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setConfirmation({ candidate, mode: 'link' })}>
                Koppel eerder geregistreerde {money(candidate.linkExistingCents)}
              </Button>}
              {candidate.suggestedCents > 0 && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setConfirmation({ candidate, mode: 'add' })}>
                Boek nieuwe betaling {money(candidate.suggestedCents)}
              </Button>}
            </div>
          </div>
        ))}
      </>}
      <Dialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open && !busy) setConfirmation(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bankbetaling koppelen</DialogTitle></DialogHeader>
          {confirmation && <div className="space-y-3 text-sm">
            <p>{confirmation.candidate.name || 'Bijschrijving'} · {date(confirmation.candidate.date)} · {money(confirmation.candidate.amountCents)}</p>
            <p className="break-words text-muted-foreground">{confirmation.candidate.description}</p>
            {confirmation.mode === 'link'
              ? <p>Koppel {money(confirmation.candidate.linkExistingCents)} aan de eerder geregistreerde betaling. Het betaalde factuurbedrag blijft gelijk.</p>
              : <p>Boek {money(confirmation.candidate.suggestedCents)} als nieuwe betaling. Bevestig alleen als deze bijschrijving nog niet handmatig is geregistreerd.</p>}
            {error && <p role="alert" className="text-destructive">{error}</p>}
          </div>}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>Annuleren</Button>
            <Button disabled={busy} onClick={() => void confirmPayment()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{confirmation?.mode === 'link' ? 'Koppeling bevestigen' : 'Nieuwe betaling bevestigen'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
