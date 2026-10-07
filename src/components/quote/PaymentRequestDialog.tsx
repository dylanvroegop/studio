'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { parsePaymentAmount, paymentRequestStatus, paymentInstallmentAmounts, type PaymentRequestKind, type PaymentRequestView } from '@/lib/payment-request';
import { cn } from '@/lib/utils';

interface PaymentRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  quoteNumber: string;
  defaultAmount: number;
}

const money = (cents: number): string => (cents / 100).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });

export function PaymentRequestDialog({ open, onOpenChange, quoteId, quoteNumber, defaultAmount }: PaymentRequestDialogProps) {
  const { user } = useUser();
  const [kind, setKind] = useState<PaymentRequestKind>('upfront');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState(`Offerte ${quoteNumber}`);
  const totalCents = Math.round(defaultAmount * 100);
  const [readyTotal, setReadyTotal] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const [mode, setMode] = useState<'test' | 'live' | null>(null);
  const [items, setItems] = useState<PaymentRequestView[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [customCreatedId, setCustomCreatedId] = useState<string | null>(null);
  const requestAttempt = useRef<{ fingerprint: string; id: string } | null>(null);
  const submitting = useRef(false);

  const api = useCallback(async (method = 'GET', body?: unknown) => {
    if (!user) throw new Error('Log opnieuw in.');
    const response = await fetch(`/api/offertes/${encodeURIComponent(quoteId)}/betaalverzoeken`, {
      method,
      headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || 'Betaalverzoek kon niet worden verwerkt.'), { status: response.status });
    return data as { mode: 'test' | 'live'; items: PaymentRequestView[]; item: PaymentRequestView; totalCents: number; };
  }, [quoteId, user]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setMode(null);
    setReadyTotal(null);
    setCopied(null);
    setError('');
    void (async () => {
      try {
        let data;
        for (let attempt = 0; ; attempt++) {
          try { data = await api('POST', { kind: 'sync', expectedTotalCents: totalCents }); break; }
          catch (err) {
            const retryable = err instanceof Error && ('status' in err) &&
              (err.status === 423 || err.message.startsWith('De offerte wordt nog opgeslagen'));
            if (!retryable || attempt >= 3 || !active) throw err;
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        if (!active) return;
        const updated = data.items;
        setMode(data.mode); setItems(updated); setReadyTotal(data.totalCents);
        const upfront = updated.find(item => item.kind === 'upfront');
        setKind(upfront?.paidAt ? 'final' : 'upfront');
        setCustomCreatedId(null);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Laden mislukt.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [open, api, totalCents, reload]);

  const ready = readyTotal === totalCents && mode !== null;
  const split = paymentInstallmentAmounts(totalCents, items);
  const selected = kind === 'custom' ? items.find(item => item.id === customCreatedId) : items.find(item => item.kind === kind);
  const amountCents = kind === 'custom' ? parsePaymentAmount(amount) : split[kind];
  const installmentDescription = `Offerte ${quoteNumber} - ${kind === 'upfront' ? '50% vooraf' : items.some(item => item.kind === 'upfront' && item.paidAt) ? 'Restant' : '50% achteraf'}`;
  const customItems = items.filter(item => (!item.kind || item.kind === 'custom') && item.id !== selected?.id);

  async function create(): Promise<void> {
    if (submitting.current || selected || loading || !ready) return;
    if (!amountCents || (kind === 'custom' && !description.trim())) { setError('Vul een geldig bedrag en een omschrijving in.'); return; }
    let body: unknown;
    if (kind === 'custom') {
      const fingerprint = JSON.stringify({ amountCents, description: description.trim() });
      if (requestAttempt.current?.fingerprint !== fingerprint) requestAttempt.current = { fingerprint, id: crypto.randomUUID() };
      body = { kind, requestId: requestAttempt.current.id, amountCents, description: description.trim() };
    } else {
      body = { kind, expectedTotalCents: totalCents };
    }
    submitting.current = true; setBusy(true); setError('');
    try {
      const data = await api('POST', body);
      setItems(previous => kind === 'custom' ? [data.item, ...previous.filter(item => item.id !== data.item.id)] : data.items);
      if (kind === 'custom') setCustomCreatedId(data.item.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Aanmaken mislukt. Probeer opnieuw.'); }
    finally { submitting.current = false; setBusy(false); }
  }

  async function refresh(item: PaymentRequestView): Promise<void> {
    if (item.kind === 'upfront' || item.kind === 'final') { setReload(value => value + 1); return; }
    setRefreshing(item.id); setError('');
    try {
      const data = await api('PATCH', { id: item.id });
      setItems(previous => previous.map(entry => entry.id === item.id ? data.item : entry));
    } catch (err) { setError(err instanceof Error ? err.message : 'Status ophalen mislukt.'); }
    finally { setRefreshing(null); }
  }

  async function copy(item: PaymentRequestView): Promise<void> {
    try { await navigator.clipboard.writeText(item.url); setCopied(item.id); }
    catch { setError('Kopiëren mislukt. Selecteer en kopieer de link hieronder.'); }
  }

  function linkCard(item: PaymentRequestView) {
    return <div key={item.id} className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="break-words text-sm font-medium">{item.description}</p><p className="text-sm">{money(item.amountCents)}</p></div>
        <span className="shrink-0 text-xs text-muted-foreground">{paymentRequestStatus(item)}</span>
      </div>
      <Input readOnly value={item.url} aria-label={`Betaallink ${item.description}`} className="h-8 text-xs" onFocus={event => event.target.select()} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void copy(item)}><Copy className="mr-1.5 h-3.5 w-3.5" />{copied === item.id ? 'Gekopieerd' : 'Kopieer link'}</Button>
        <Button variant="outline" size="sm" asChild><a href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />{mode === 'test' ? 'Test openen' : 'Openen'}</a></Button>
        <Button variant="ghost" size="sm" disabled={refreshing !== null || loading} onClick={() => void refresh(item)}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing === item.id ? 'animate-spin' : ''}`} />Status</Button>
      </div>
    </div>;
  }

  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Betaalverzoek</DialogTitle>
          <DialogDescription>Offerte {quoteNumber}</DialogDescription>
        </DialogHeader>
        {mode === 'test' && <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-300">Testmodus — hiermee ontvang je geen echte betalingen.</p>}
        <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Offertetotaal (incl. btw)</span><strong>{money(totalCents)}</strong></div>
        <div className="grid grid-cols-2 gap-2" aria-label="Betaaltermijn">
          {(['upfront', 'final'] as const).map(option => {
            const existing = items.find(item => item.kind === option);
            return <button key={option} type="button" disabled={busy || loading || !ready} aria-pressed={kind === option} onClick={() => { setKind(option); setError(''); }}
              className={cn('rounded-lg border p-3 text-left text-sm transition-colors disabled:opacity-60', kind === option ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50')}>
              <span className="block font-medium">{option === 'upfront' ? '50% vooraf' : items.some(item => item.kind === 'upfront' && item.paidAt) ? 'Restant achteraf' : '50% achteraf'}</span>
              <span className="mt-1 block">{money(split[option])}</span>
              {existing && <span className="mt-1 block text-xs text-muted-foreground">{paymentRequestStatus(existing)}</span>}
            </button>;
          })}
        </div>
        <button type="button" disabled={busy || loading || !ready} aria-pressed={kind === 'custom'} onClick={() => { setKind('custom'); setError(''); }} className="w-fit text-xs text-muted-foreground underline underline-offset-4">Ander bedrag</button>
        {loading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Betaalverzoeken laden…</p> : !ready ? <Button variant="outline" onClick={() => setReload(value => value + 1)}>Opnieuw laden</Button> : selected ? <>
          {linkCard(selected)}
          {kind === 'custom' && <Button variant="outline" onClick={() => { requestAttempt.current = null; setCustomCreatedId(null); setAmount(''); setDescription(`Offerte ${quoteNumber}`); }}>Nieuw betaalverzoek</Button>}
        </> : <form onSubmit={event => { event.preventDefault(); void create(); }} className="space-y-3">
          {kind === 'custom' ? <>
            <div className="space-y-1.5"><Label htmlFor="payment-request-amount">Bedrag (incl. btw)</Label><Input id="payment-request-amount" inputMode="decimal" placeholder="0,00" value={amount} disabled={busy} onChange={event => setAmount(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="payment-request-description">Omschrijving</Label><Input id="payment-request-description" maxLength={255} value={description} disabled={busy} onChange={event => setDescription(event.target.value)} /></div>
          </> : <p className="text-sm text-muted-foreground">{totalCents < 2 ? 'Vul eerst een offertetotaal in, of kies Ander bedrag.' : !amountCents ? 'Er staat geen bedrag meer open voor deze termijn.' : installmentDescription}</p>}
          <Button type="submit" className="w-full" disabled={busy || !mode || !amountCents || (kind !== 'custom' && totalCents < 2) || (kind === 'custom' && !description.trim())}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {busy ? 'Betaallink maken…' : `Maak betaalverzoek${amountCents ? ` · ${money(amountCents)}` : ''}`}
          </Button>
        </form>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {customItems.length > 0 && <details className="border-t pt-3"><summary className="cursor-pointer text-sm text-muted-foreground">Andere betaalverzoeken ({customItems.length})</summary><div className="mt-3 space-y-3">{customItems.map(linkCard)}</div></details>}
      </DialogContent>
    </Dialog>
  );
}
