'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, runTransaction, type Firestore } from 'firebase/firestore';
import { Pencil, Trash2 } from 'lucide-react';
import { z } from 'zod';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFirestore, useUser } from '@/firebase';
import { parseScenarioAmount } from '@/lib/bank-cost-scenario';

const euros = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
const expenseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  amountCents: z.number().int().positive().max(9_999_999_999),
});
const expenseListSchema = z.array(expenseSchema);
type Expense = z.infer<typeof expenseSchema>;

function TravelBudget({ firestore, uid }: { firestore: Firestore; uid: string }) {
  const userRef = useMemo(() => doc(firestore, 'users', uid), [firestore, uid]);
  const nameInput = useRef<HTMLInputElement>(null);
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => onSnapshot(userRef, (snapshot) => {
    const result = expenseListSchema.safeParse(snapshot.data()?.travelMonthlyExpenses ?? []);
    setExpenses(result.success ? result.data : null);
    setLoadError(!result.success);
  }, () => {
    setExpenses(null);
    setLoadError(true);
  }), [userRef, loadAttempt]);

  function resetForm() {
    setEditingId(null);
    setDraftId(null);
    setName('');
    setAmount('');
    setFormError('');
  }

  async function changeExpense(change: { expense: Expense; editing: boolean } | { removeId: string }) {
    setFormError('');
    setSaving(true);
    try {
      await runTransaction(firestore, async (transaction) => {
        const snapshot = await transaction.get(userRef);
        const rows = expenseListSchema.parse(snapshot.data()?.travelMonthlyExpenses ?? []);
        let updated: Expense[];
        if ('removeId' in change) {
          updated = rows.filter((row) => row.id !== change.removeId);
        } else {
          const { expense, editing } = change;
          const exists = rows.some((row) => row.id === expense.id);
          if (editing && !exists) throw new Error('expense-removed');
          updated = exists ? rows.map((row) => row.id === expense.id ? expense : row) : [...rows, expense];
        }
        transaction.set(userRef, { travelMonthlyExpenses: updated }, { merge: true });
      });
      if ('removeId' in change) {
        setToDelete(null);
        if (editingId === change.removeId) resetForm();
      } else {
        resetForm();
      }
    } catch (error) {
      setFormError(error instanceof Error && error.message === 'expense-removed'
        ? 'Deze kostenpost is inmiddels verwijderd. Voeg de post eventueel opnieuw toe.'
        : 'Wijziging kon niet worden opgeslagen. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !expenses) return;
    const parsed = parseScenarioAmount(amount);
    const result = expenseSchema.safeParse({
      id: editingId ?? draftId ?? crypto.randomUUID(),
      name: name.trim(),
      amountCents: parsed === null ? 0 : Math.round(parsed * 100),
    });
    if (!result.success) {
      setFormError(name.trim() ? 'Vul een geldig positief maandbedrag in.' : 'Vul een naam in voor de kostenpost.');
      return;
    }
    if (!editingId) setDraftId(result.data.id);
    void changeExpense({ expense: result.data, editing: Boolean(editingId) });
  }

  function edit(expense: Expense) {
    setEditingId(expense.id);
    setDraftId(null);
    setName(expense.name);
    setAmount((expense.amountCents / 100).toFixed(2).replace('.', ','));
    setFormError('');
    nameInput.current?.focus();
  }

  const monthlyTotal = expenses?.reduce((total, expense) => total + expense.amountCents, 0) ?? 0;

  return (
    <Card>
      <CardContent className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 className="text-base font-semibold">Maandelijkse lasten tijdens je reis</h2>
          {expenses && (
            <p aria-live="polite" className="text-lg font-semibold tabular-nums sm:text-xl">
              {euros.format(monthlyTotal / 100)} <span className="text-sm font-normal text-muted-foreground">per maand</span>
            </p>
          )}
        </div>

        {loadError ? (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className="text-sm text-destructive">Je maandlasten konden niet worden geladen.</p>
            <Button type="button" variant="outline" onClick={() => { setLoadError(false); setLoadAttempt((attempt) => attempt + 1); }}>Opnieuw proberen</Button>
          </div>
        ) : !expenses ? (
          <p role="status" className="text-sm text-muted-foreground">Maandlasten laden…</p>
        ) : (
          <>
            <form onSubmit={save} className="space-y-2">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[9rem] flex-1 space-y-1.5">
                  <Label htmlFor="travel-expense-name">Kostenpost</Label>
                  <Input ref={nameInput} id="travel-expense-name" value={name} maxLength={120} placeholder="Mobiel of ChatGPT" onChange={(event) => setName(event.target.value)} disabled={saving} required />
                </div>
                <div className="w-36 space-y-1.5">
                  <Label htmlFor="travel-expense-amount">Per maand (€)</Label>
                  <Input id="travel-expense-amount" inputMode="decimal" value={amount} placeholder="100,00" onChange={(event) => setAmount(event.target.value)} disabled={saving} required />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={saving}>{editingId ? 'Opslaan' : 'Toevoegen'}</Button>
                  {editingId && <Button type="button" variant="outline" disabled={saving} onClick={resetForm}>Annuleren</Button>}
                </div>
              </div>
              {formError && !toDelete && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            </form>

            {expenses.length > 0 && (
              <ul className="divide-y border-y">
                {expenses.map((expense) => (
                  <li key={expense.id} className="flex flex-wrap items-center gap-x-3 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 break-words">{expense.name}</span>
                    <span className="tabular-nums">{euros.format(expense.amountCents / 100)}</span>
                    <div className="flex">
                      <Button type="button" variant="ghost" size="icon" aria-label={`${expense.name} bewerken`} disabled={saving} onClick={() => edit(expense)}><Pencil className="h-4 w-4" /></Button>
                      <Button type="button" variant="ghost" size="icon" aria-label={`${expense.name} verwijderen`} disabled={saving} onClick={() => { setFormError(''); setToDelete(expense); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <AlertDialog open={Boolean(toDelete)} onOpenChange={(open) => { if (!open && !saving) { setToDelete(null); setFormError(''); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Kostenpost verwijderen?</AlertDialogTitle>
              <AlertDialogDescription>Verwijder {toDelete?.name} uit je maandelijkse reislasten.</AlertDialogDescription>
            </AlertDialogHeader>
            {formError && toDelete && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Annuleren</AlertDialogCancel>
              <Button type="button" variant="destructive" disabled={saving} onClick={() => { if (toDelete) void changeExpense({ removeId: toDelete.id }); }}>Verwijderen</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

export default function PersonalFinancePage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  useEffect(() => {
    if (!isUserLoading && !user) router.replace('/login');
  }, [isUserLoading, router, user]);

  if (!user || !firestore) return <main className="p-6 text-sm">Sessie controleren…</main>;

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Personal Finance" />
      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4 md:px-6 md:pt-6">
        <TravelBudget key={user.uid} firestore={firestore} uid={user.uid} />
      </main>
    </div>
  );
}
