'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getIdTokenResult } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  ArrowLeft,
  CalendarDays,
  Coins,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import {
  type DeveloperFinanceEntry,
  type DeveloperFinanceEntryKind,
  type DeveloperFinanceEntryScope,
  estimateTargetDate,
  getAverageMonthlyNet,
  getFinanceMonthlySummary,
  getProjectionPoints,
  normalizeFinanceEntry,
  roundEuro,
} from '@/lib/developer-finance';
import { cn } from '@/lib/utils';

type FinanceFormState = {
  date: string;
  kind: DeveloperFinanceEntryKind;
  scope: DeveloperFinanceEntryScope;
  amount: number;
  category: string;
  description: string;
  recurrence: 'one_time' | 'monthly';
};

const DEFAULT_FORM_STATE: FinanceFormState = {
  date: new Date().toISOString().slice(0, 10),
  kind: 'expense',
  scope: 'business',
  amount: 0,
  category: '',
  description: '',
  recurrence: 'one_time',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function toNumber(input: string): number {
  const normalized = input.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function PersonalFinanceContent() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [accessLoading, setAccessLoading] = useState(true);
  const [hasDeveloperAccess, setHasDeveloperAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [entries, setEntries] = useState<DeveloperFinanceEntry[]>([]);
  const [targetAmount, setTargetAmount] = useState<number>(25000);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<FinanceFormState>(DEFAULT_FORM_STATE);

  useEffect(() => {
    let cancelled = false;

    async function resolveDeveloperAccess() {
      if (!user) {
        if (!cancelled) {
          setHasDeveloperAccess(false);
          setAccessLoading(false);
        }
        return;
      }
      try {
        const token = await getIdTokenResult(user, false);
        const allowed = token.claims.dev === true || token.claims.admin === true;
        if (!cancelled) {
          setHasDeveloperAccess(allowed);
          setAccessLoading(false);
        }
      } catch {
        if (!cancelled) {
          setHasDeveloperAccess(false);
          setAccessLoading(false);
        }
      }
    }

    if (!isUserLoading) {
      resolveDeveloperAccess();
    }

    return () => {
      cancelled = true;
    };
  }, [isUserLoading, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!user || !firestore || !hasDeveloperAccess) return;
      setIsLoading(true);
      try {
        const userRef = doc(firestore, 'users', user.uid);
        const snap = await getDoc(userRef);
        const settings = (snap.data()?.settings || {}) as Record<string, unknown>;
        const rawEntries = Array.isArray(settings.developerFinanceEntries)
          ? settings.developerFinanceEntries
          : [];
        const normalized = rawEntries
          .map((item) => normalizeFinanceEntry(item))
          .filter((item): item is DeveloperFinanceEntry => item !== null)
          .sort((a, b) => b.date.localeCompare(a.date));
        const rawTarget = Number(settings.developerFinanceTargetAmount);

        if (!cancelled) {
          setEntries(normalized);
          setTargetAmount(Number.isFinite(rawTarget) && rawTarget > 0 ? roundEuro(rawTarget) : 25000);
        }
      } catch (error) {
        if (!cancelled) {
          toast({
            variant: 'destructive',
            title: 'Laden mislukt',
            description: 'Kon persoonlijke financiën niet laden. Probeer opnieuw.',
          });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [firestore, hasDeveloperAccess, toast, user]);

  const monthlySummary = useMemo(() => getFinanceMonthlySummary(entries), [entries]);
  const currentMonthKey = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const currentCumulative = monthlySummary.length > 0 ? monthlySummary[monthlySummary.length - 1].cumulative : 0;
  const averageMonthlyNet = useMemo(() => getAverageMonthlyNet(monthlySummary), [monthlySummary]);
  const projectionPoints = useMemo(
    () => getProjectionPoints(currentMonthKey, currentCumulative, averageMonthlyNet, 6),
    [averageMonthlyNet, currentCumulative, currentMonthKey]
  );
  const estimatedTargetLabel = useMemo(
    () => estimateTargetDate(currentCumulative, targetAmount, averageMonthlyNet, currentMonthKey),
    [averageMonthlyNet, currentCumulative, currentMonthKey, targetAmount]
  );

  const kpis = useMemo(() => {
    const businessIncome = entries
      .filter((entry) => entry.kind === 'income' && entry.scope === 'business')
      .reduce((sum, entry) => sum + entry.amount, 0);
    const businessExpenses = entries
      .filter((entry) => entry.kind === 'expense' && entry.scope === 'business')
      .reduce((sum, entry) => sum + entry.amount, 0);
    const personalExpenses = entries
      .filter((entry) => entry.kind === 'expense' && entry.scope === 'personal')
      .reduce((sum, entry) => sum + entry.amount, 0);
    const totalNet = entries.reduce((sum, entry) => {
      const signed = entry.kind === 'income' ? entry.amount : -entry.amount;
      return sum + signed;
    }, 0);

    return {
      businessIncome: roundEuro(businessIncome),
      businessExpenses: roundEuro(businessExpenses),
      personalExpenses: roundEuro(personalExpenses),
      totalNet: roundEuro(totalNet),
    };
  }, [entries]);

  const chartRows = useMemo(() => {
    const historical = monthlySummary.map((month) => ({
      month: month.label,
      historisch: month.cumulative,
      projectie: null as number | null,
    }));
    const projected = projectionPoints.map((point) => ({
      month: point.label,
      historisch: null as number | null,
      projectie: point.projectedCumulative,
    }));
    return [...historical, ...projected];
  }, [monthlySummary, projectionPoints]);

  if (isUserLoading || accessLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    router.replace('/login');
    return null;
  }

  if (!hasDeveloperAccess) {
    return (
      <div className="app-shell min-h-screen bg-background pb-20">
        <AppNavigation />
        <DashboardHeader user={user} title="Persoonlijke financiën" />
        <div className="mx-auto mt-8 max-w-3xl px-4">
          <Card>
            <CardHeader>
              <CardTitle>Geen toegang</CardTitle>
              <CardDescription>Deze tab is alleen beschikbaar voor developer-accounts.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href="/instellingen">Terug naar instellingen</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const saveToFirestore = async (nextEntries: DeveloperFinanceEntry[], nextTargetAmount: number): Promise<void> => {
    if (!user || !firestore) return;
    setIsSaving(true);
    try {
      const userRef = doc(firestore, 'users', user.uid);
      await setDoc(
        userRef,
        {
          settings: {
            developerFinanceEntries: nextEntries,
            developerFinanceTargetAmount: roundEuro(nextTargetAmount),
          },
        },
        { merge: true }
      );
      toast({
        title: 'Opgeslagen',
        description: 'Persoonlijke financiën zijn bijgewerkt.',
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Opslaan mislukt',
        description: 'Wijzigingen konden niet worden opgeslagen.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const openCreateDialog = () => {
    setEditingId(null);
    setForm({
      ...DEFAULT_FORM_STATE,
      date: new Date().toISOString().slice(0, 10),
    });
    setDialogOpen(true);
  };

  const openEditDialog = (entry: DeveloperFinanceEntry) => {
    setEditingId(entry.id);
    setForm({
      date: entry.date,
      kind: entry.kind,
      scope: entry.scope,
      amount: entry.amount,
      category: entry.category,
      description: entry.description,
      recurrence: entry.recurrence,
    });
    setDialogOpen(true);
  };

  const handleSaveEntry = async () => {
    const amount = roundEuro(form.amount);
    if (!form.date || amount <= 0) {
      toast({
        variant: 'destructive',
        title: 'Controleer invoer',
        description: 'Datum en bedrag zijn verplicht.',
      });
      return;
    }

    const now = new Date().toISOString();
    const entry: DeveloperFinanceEntry = {
      id: editingId || crypto.randomUUID(),
      date: form.date,
      kind: form.kind,
      scope: form.scope,
      amount,
      category: form.category.trim(),
      description: form.description.trim(),
      recurrence: form.recurrence,
      createdAt: now,
      updatedAt: now,
    };

    const updated = editingId
      ? entries.map((item) => (item.id === editingId ? { ...entry, createdAt: item.createdAt } : item))
      : [entry, ...entries];
    const sorted = updated.sort((a, b) => b.date.localeCompare(a.date));
    setEntries(sorted);
    setDialogOpen(false);
    await saveToFirestore(sorted, targetAmount);
  };

  const handleDeleteEntry = async () => {
    if (!deleteId) return;
    const updated = entries.filter((entry) => entry.id !== deleteId);
    setEntries(updated);
    setDeleteId(null);
    await saveToFirestore(updated, targetAmount);
  };

  const handleSaveTarget = async () => {
    await saveToFirestore(entries, targetAmount);
  };

  return (
    <div className="app-shell min-h-screen bg-background pb-24">
      <AppNavigation />
      <DashboardHeader user={user} title="Persoonlijke financiën (dev)" />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline" className="gap-2">
            <Link href="/instellingen">
              <ArrowLeft className="h-4 w-4" />
              Terug naar instellingen
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              Laatste 3 maanden gemiddelde
            </Badge>
            <Button onClick={openCreateDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              Nieuwe regel
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Zakelijke inkomsten</CardDescription>
              <CardTitle className="text-2xl">{formatCurrency(kpis.businessIncome)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Zakelijke kosten</CardDescription>
              <CardTitle className="text-2xl">{formatCurrency(kpis.businessExpenses)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Privé kosten</CardDescription>
              <CardTitle className="text-2xl">{formatCurrency(kpis.personalExpenses)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Totale netto stand</CardDescription>
              <CardTitle className={cn('text-2xl', kpis.totalNet >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {formatCurrency(kpis.totalNet)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader className="gap-3">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Projectie
            </CardTitle>
            <CardDescription>
              Maandelijkse trend op basis van je laatste 3 maanden netto resultaat.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-border/60 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Gem. netto / maand</p>
                <p className={cn('mt-1 text-xl font-semibold', averageMonthlyNet >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {formatCurrency(averageMonthlyNet)}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Huidige cumulatieve stand</p>
                <p className="mt-1 text-xl font-semibold">{formatCurrency(currentCumulative)}</p>
              </div>
              <div className="rounded-lg border border-border/60 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Doel bereikt rond</p>
                <p className="mt-1 text-xl font-semibold">
                  {estimatedTargetLabel || 'Niet berekenbaar'}
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-2">
                <Label htmlFor="targetAmount">Doelbedrag</Label>
                <Input
                  id="targetAmount"
                  inputMode="decimal"
                  value={targetAmount}
                  onChange={(event) => setTargetAmount(roundEuro(toNumber(event.target.value)))}
                />
                <Button variant="outline" onClick={handleSaveTarget} disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Doel opslaan
                </Button>
              </div>

              <div className="h-[320px] rounded-lg border border-border/60 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(value) => `€${Math.round(value)}`} />
                    <Tooltip formatter={(value) => formatCurrency(Number(value || 0))} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="historisch"
                      name="Historisch"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="projectie"
                      name="Projectie"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" />
              Invoerregels
            </CardTitle>
            <CardDescription>
              Beheer inkomsten en uitgaven voor business en privé.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Laden...
              </div>
            ) : entries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nog geen regels toegevoegd.
              </p>
            ) : (
              <div className="space-y-2">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-3"
                  >
                    <div className="min-w-[230px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={entry.kind === 'income' ? 'default' : 'secondary'}>
                          {entry.kind === 'income' ? 'Inkomst' : 'Uitgave'}
                        </Badge>
                        <Badge variant="outline">{entry.scope === 'business' ? 'Zakelijk' : 'Privé'}</Badge>
                        {entry.recurrence === 'monthly' ? <Badge variant="outline">Maandelijks</Badge> : null}
                      </div>
                      <p className="mt-2 text-sm font-medium">
                        {entry.description || entry.category || 'Onbeschreven regel'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.date} {entry.category ? `· ${entry.category}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={cn('min-w-[120px] text-right font-semibold', entry.kind === 'income' ? 'text-emerald-400' : 'text-red-400')}>
                        {entry.kind === 'income' ? '+' : '-'}
                        {formatCurrency(entry.amount)}
                      </p>
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(entry)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(entry.id)}>
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Regel bewerken' : 'Nieuwe regel'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor="entry-date">Datum</Label>
              <Input
                id="entry-date"
                type="date"
                value={form.date}
                onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
              />
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={form.kind} onValueChange={(value: DeveloperFinanceEntryKind) => setForm((prev) => ({ ...prev, kind: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Inkomst</SelectItem>
                    <SelectItem value="expense">Uitgave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Scope</Label>
                <Select value={form.scope} onValueChange={(value: DeveloperFinanceEntryScope) => setForm((prev) => ({ ...prev, scope: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="business">Zakelijk</SelectItem>
                    <SelectItem value="personal">Privé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="entry-amount">Bedrag (€)</Label>
              <Input
                id="entry-amount"
                inputMode="decimal"
                value={form.amount}
                onChange={(event) => setForm((prev) => ({ ...prev, amount: roundEuro(toNumber(event.target.value)) }))}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="entry-category">Categorie</Label>
              <Input
                id="entry-category"
                value={form.category}
                placeholder="Bijv. Salaris, Materiaal, Auto, Privé opname"
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="entry-description">Omschrijving</Label>
              <Input
                id="entry-description"
                value={form.description}
                placeholder="Korte toelichting"
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>Herhaling</Label>
              <Select value={form.recurrence} onValueChange={(value: 'one_time' | 'monthly') => setForm((prev) => ({ ...prev, recurrence: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">Eenmalig</SelectItem>
                  <SelectItem value="monthly">Maandelijks</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={handleSaveEntry} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regel verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Deze actie verwijdert de regel permanent uit je persoonlijke financiën.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEntry}>Verwijderen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function PersonalFinancePage() {
  return <PersonalFinanceContent />;
}
