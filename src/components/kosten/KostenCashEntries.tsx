'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { CASH_PURCHASE_CATEGORIES, parseCashEntry, type CashDeposit, type CashEntry } from '@/lib/kosten-cash';
import { PROJECT_COST_CATEGORY_LABELS } from '@/lib/project-costs';

interface Props {
  user: { uid: string; getIdToken(forceRefresh?: boolean): Promise<string> };
  today: string;
  deposits: CashDeposit[] | null;
  onDepositsLoaded: (deposits: CashDeposit[]) => void;
  onPurchaseSaved: () => Promise<void>;
}

const entryOptions = [
  { value: 'deposit', label: 'Privé-inleg in de kas' },
  { value: 'private-purchase', label: 'Contante aankoop uit privégeld' },
  { value: 'business-purchase', label: 'Aankoop uit de zakelijke kas' },
] as const;

interface Draft {
  id: string;
  kind: CashEntry['kind'];
  date: string;
  amount: string;
  description: string;
  supplier: string;
  category: string;
  editing: boolean;
}

const euros = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });

export function KostenCashEntries({ user, today, deposits, onDepositsLoaded, onPurchaseSaved }: Props) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [remove, setRemove] = useState(false);
  const [formError, setFormError] = useState('');
  const [listError, setListError] = useState('');
  const listVersion = useRef(0);
  const submitPending = useRef(false);
  const mounted = useRef(false);
  const [kindLocked, setKindLocked] = useState(false);

  const request = useCallback(async (method: string, body?: Draft) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await user.getIdToken(attempt > 0);
      let response: Response;
      try {
        response = await fetch('/api/kosten/contant', {
          method, cache: 'no-store',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw new Error('Studio reageerde niet. Controleer je verbinding en probeer dezelfde boeking opnieuw.');
      }
      if (response.status === 401 && attempt === 0) continue;
      const payload = await response.json().catch(() => null) as { ok?: boolean; deposits?: CashDeposit[]; message?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || `Studio kon de contante boekingen niet ophalen of opslaan (HTTP ${response.status}).`);
      return payload;
    }
    throw new Error('Log opnieuw in bij Studio.');
  }, [user]);

  const loadDeposits = useCallback(async () => {
    const version = ++listVersion.current;
    setListError('');
    try {
      const payload = await request('GET');
      if (!Array.isArray(payload.deposits)) throw new Error('Studio gaf een onvolledige lijst met privé-inleg terug.');
      if (version === listVersion.current) onDepositsLoaded(payload.deposits);
    } catch (error) {
      if (version === listVersion.current) setListError(error instanceof Error ? error.message : 'Privé-inleg kon niet worden geladen.');
    }
  }, [onDepositsLoaded, request]);

  useEffect(() => {
    mounted.current = true;
    void loadDeposits();
    return () => {
      mounted.current = false;
      listVersion.current++;
    };
  }, [loadDeposits]);

  function open(deposit?: CashDeposit) {
    setFormError('');
    setRemove(false);
    setKindLocked(false);
    setDraft({
      id: deposit?.id || crypto.randomUUID(), kind: 'deposit', date: deposit?.date || today,
      amount: deposit ? (deposit.amountCents / 100).toFixed(2).replace('.', ',') : '',
      description: deposit?.description || '', supplier: '', category: '', editing: Boolean(deposit),
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || submitPending.current) return;
    setFormError('');
    if (!remove) {
      const validation = parseCashEntry({ ...draft }, today);
      if (typeof validation === 'string') { setFormError(validation); return; }
    }
    submitPending.current = true;
    setKindLocked(true);
    setSaving(true);
    try {
      await request(remove ? 'DELETE' : 'POST', draft);
      setDraft(null);
      toast({ title: remove ? 'Privé-inleg verwijderd' : draft.kind === 'deposit' ? 'Privé-inleg opgeslagen' : 'Contante aankoop opgeslagen' });
      if (draft.kind === 'deposit') {
        if (mounted.current) await loadDeposits();
      } else {
        await onPurchaseSaved().catch(() => undefined);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'De boeking kon niet worden opgeslagen.');
    } finally {
      submitPending.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={saving} onClick={() => open()}>Contant boeken</Button>
        {deposits?.length ? (
          <details className="min-w-0 max-w-full text-sm">
            <summary className="cursor-pointer py-2 text-muted-foreground">Contante privé-inleg ({deposits.length})</summary>
            <ul className="mt-1 max-h-56 min-w-0 space-y-1 overflow-y-auto">
              {deposits.map((deposit) => (
                <li key={deposit.id}>
                  <button type="button" className="flex w-full flex-wrap gap-x-3 rounded px-2 py-2 text-left hover:bg-muted" disabled={saving} onClick={() => open(deposit)}>
                    <span>{new Date(`${deposit.date}T12:00:00`).toLocaleDateString('nl-NL')}</span>
                    <span className="font-medium">{euros.format(deposit.amountCents / 100)}</span>
                    {deposit.description ? <span className="break-words text-muted-foreground">{deposit.description}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
      {listError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-red-400">{listError}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadDeposits()}>Privé-inleg opnieuw laden</Button>
        </div>
      ) : null}
      <Dialog open={draft !== null} onOpenChange={(open) => { if (!open && !submitPending.current) setDraft(null); }}>
        {draft ? (
          <DialogContent className="max-h-[85dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{draft.editing ? 'Contante privé-inleg bewerken' : 'Contant boeken'}</DialogTitle>
              <DialogDescription>
                {draft.kind === 'deposit' ? 'Bedrag dat je vanuit privé aan de zakelijke kas toevoegt.'
                  : 'Boek de aankoop met het betaalde bedrag. Je kunt de bon later bij Kosten toevoegen.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(event) => void save(event)}>
              <fieldset disabled={saving} className="min-w-0 space-y-4">
                {!draft.editing ? (
                  <div className="space-y-1">
                    <Label htmlFor="cash-entry-kind">Boeking</Label>
                    <select id="cash-entry-kind" disabled={kindLocked} className="flex min-h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.kind} onChange={(event) => {
                      const option = entryOptions.find(({ value }) => value === event.target.value);
                      if (option) setDraft({ ...draft, kind: option.value });
                    }}>
                      {entryOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0 space-y-1">
                    <Label htmlFor="cash-entry-date">Datum</Label>
                    <Input id="cash-entry-date" type="date" max={today} value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <Label htmlFor="cash-entry-amount">Bedrag (€)</Label>
                    <Input id="cash-entry-amount" type="text" inputMode="decimal" placeholder="0,00" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} required />
                  </div>
                </div>
                {draft.kind !== 'deposit' ? (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="cash-entry-category">Categorie</Label>
                      <select id="cash-entry-category" className="flex min-h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} required>
                        <option value="" disabled>Kies een categorie</option>
                        {CASH_PURCHASE_CATEGORIES.map((category) => <option key={category} value={category}>{PROJECT_COST_CATEGORY_LABELS[category]}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cash-entry-supplier">Leverancier (optioneel)</Label>
                      <Input id="cash-entry-supplier" maxLength={160} value={draft.supplier} onChange={(event) => setDraft({ ...draft, supplier: event.target.value })} />
                    </div>
                  </>
                ) : null}
                <div className="space-y-1">
                  <Label htmlFor="cash-entry-description">{draft.kind === 'deposit' ? 'Omschrijving (optioneel)' : 'Wat heb je gekocht?'}</Label>
                  <Textarea id="cash-entry-description" maxLength={500} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} required={draft.kind !== 'deposit'} />
                </div>
                {formError ? <p role="alert" className="text-sm text-red-400">{formError}</p> : null}
                {remove ? <p className="text-sm">Deze privé-inleg verwijderen?</p> : null}
                <DialogFooter>
                  {draft.editing && !remove ? <Button type="button" variant="outline" disabled={saving} onClick={() => setRemove(true)}>Verwijderen</Button> : null}
                  {remove ? <Button type="button" variant="outline" disabled={saving} onClick={() => setRemove(false)}>Annuleren</Button> : null}
                  <Button type="submit" variant={remove ? 'destructive' : 'default'} disabled={saving} formNoValidate={remove}>
                    {saving ? 'Bezig…' : remove ? 'Inleg verwijderen' : 'Opslaan'}
                  </Button>
                </DialogFooter>
              </fieldset>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
