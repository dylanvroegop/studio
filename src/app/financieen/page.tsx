'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { Loader2, Pencil, Target } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { WinstMetricsResponse } from '@/lib/winst-types';

interface FinanceGoal {
  targetAmount: number;
  startDate: string;
  endDate: string;
}

interface ProjectFinanceRow {
  projectId: string;
  label: string;
  clientName: string;
  createdAt: string | null;
  profit: number | null;
  days: number;
  euroPerDay: number | null;
  hasActualData: boolean;
  excludedSunday: boolean;
}

interface ChartPoint {
  date: string;
  label: string;
  earned: number;
  goalLine: number;
}

const todayIso = () => format(new Date(), 'yyyy-MM-dd');

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatCompactCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string | null): string {
  const date = parseIsoDate(value);
  if (!date) return 'Onbekende datum';
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function isSunday(date: Date): boolean {
  return date.getDay() === 0;
}

function isSundayIso(value: string | null | undefined): boolean {
  const date = parseIsoDate(value);
  return date ? isSunday(date) : false;
}

function businessDaysBetweenInclusive(startIso: string, endIso: string): number {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end || end < start) return 1;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (!isSunday(cursor)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return Math.max(1, count);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildDefaultGoal(): FinanceGoal {
  const start = todayIso();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 3);
  return {
    targetAmount: 10000,
    startDate: start,
    endDate: format(endDate, 'yyyy-MM-dd'),
  };
}

function normalizeGoal(source: unknown): FinanceGoal {
  const fallback = buildDefaultGoal();
  if (!source || typeof source !== 'object') return fallback;
  const row = source as Record<string, unknown>;
  const targetAmount = Number(row.targetAmount);
  const startDate = typeof row.startDate === 'string' && row.startDate ? row.startDate.slice(0, 10) : fallback.startDate;
  const endDate = typeof row.endDate === 'string' && row.endDate ? row.endDate.slice(0, 10) : fallback.endDate;

  return {
    targetAmount: Number.isFinite(targetAmount) && targetAmount > 0 ? targetAmount : fallback.targetAmount,
    startDate,
    endDate: parseIsoDate(endDate) && parseIsoDate(startDate) && endDate >= startDate ? endDate : fallback.endDate,
  };
}

function LoadingPage() {
  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={null} title="Financieen" />
      <main className="flex min-h-[55vh] items-center justify-center p-6">
        <div className="flex items-center gap-3 rounded-2xl border bg-card/50 p-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Laden...
        </div>
      </main>
    </div>
  );
}

export default function FinancieenPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [goal, setGoal] = useState<FinanceGoal | null>(null);
  const [metrics, setMetrics] = useState<WinstMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [goalAmountInput, setGoalAmountInput] = useState('');
  const [goalStartDateInput, setGoalStartDateInput] = useState('');
  const [goalEndDateInput, setGoalEndDateInput] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  useEffect(() => {
    if (!user || !firestore) return;
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        const [userDocSnap, token] = await Promise.all([
          getDoc(doc(firestore, 'users', user.uid)),
          user.getIdToken(),
        ]);

        const nextGoal = normalizeGoal(userDocSnap.exists() ? userDocSnap.data()?.financeGoal : null);
        if (!cancelled) {
          setGoal(nextGoal);
          setGoalAmountInput(String(nextGoal.targetAmount));
          setGoalStartDateInput(nextGoal.startDate);
          setGoalEndDateInput(nextGoal.endDate);
        }

        const response = await fetch('/api/winst/metrics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            periodType: 'month',
            periodRange: 24,
            jobTypes: [],
            clientIds: [],
            projectIds: [],
          }),
        });
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          message?: string;
          data?: WinstMetricsResponse;
        } | null;

        if (!response.ok || !payload?.ok || !payload.data) {
          throw new Error(payload?.message || `HTTP ${response.status}`);
        }
        if (!cancelled) setMetrics(payload.data);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Onbekende fout';
        if (!cancelled) {
          toast({
            title: 'Financieen laden mislukt',
            description: message,
            variant: 'destructive',
          });
          setMetrics(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [firestore, toast, user]);

  const derived = useMemo(() => {
    const activeGoal = goal ?? buildDefaultGoal();
    const start = parseIsoDate(activeGoal.startDate) ?? parseIsoDate(todayIso())!;
    const end = parseIsoDate(activeGoal.endDate) ?? start;
    const now = parseIsoDate(todayIso())!;
    const chartEnd = end > now ? end : now;
    const todayWithinRangeIso = todayIso() < activeGoal.startDate ? activeGoal.startDate : todayIso();
    const elapsedEndIso = todayWithinRangeIso > activeGoal.endDate ? activeGoal.endDate : todayWithinRangeIso;

    const allProjects = metrics?.projectPerformances ?? [];
    const projects: ProjectFinanceRow[] = allProjects
      .map((project) => {
        const createdAt = project.createdAt?.slice(0, 10) ?? null;
        const excludedSunday = isSundayIso(createdAt);
        const actualProfit = project.quotedRevenueIncl - project.actualCostExcl;
        const profit = project.hasActualData ? actualProfit : null;
        const days = project.hasActualData && project.actualDays > 0 ? project.actualDays : 0;
        return {
          projectId: project.projectId,
          label: project.offerteNummer ? `#${project.offerteNummer}` : project.title,
          clientName: project.clientName,
          createdAt,
          profit,
          days,
          euroPerDay: profit !== null && days > 0 ? profit / days : null,
          hasActualData: project.hasActualData,
          excludedSunday,
        };
      })
      .filter((project) => {
        const created = parseIsoDate(project.createdAt);
        return Boolean(created && created >= start && created <= end);
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const earnedProjects = projects.filter((project) => project.profit !== null && !project.excludedSunday);
    const totalEarned = earnedProjects.reduce((sum, project) => sum + (project.profit ?? 0), 0);
    const totalDays = earnedProjects.reduce((sum, project) => sum + Math.max(0, project.days), 0);
    const averagePerJob = earnedProjects.length > 0 ? totalEarned / earnedProjects.length : 0;
    const averagePerWorkedDay = totalDays > 0 ? totalEarned / totalDays : 0;
    const calendarDaysElapsed = businessDaysBetweenInclusive(activeGoal.startDate, elapsedEndIso);
    const averagePerCalendarDay = totalEarned / calendarDaysElapsed;
    const totalGoalDays = businessDaysBetweenInclusive(activeGoal.startDate, activeGoal.endDate);
    const neededPerDay = activeGoal.targetAmount / totalGoalDays;
    const remaining = Math.max(0, activeGoal.targetAmount - totalEarned);
    const remainingStartIso = todayIso() < activeGoal.startDate ? activeGoal.startDate : todayIso();
    const daysLeft = todayIso() > activeGoal.endDate ? 0 : businessDaysBetweenInclusive(remainingStartIso, activeGoal.endDate);
    const neededRemainingPerDay = daysLeft > 0 ? remaining / daysLeft : remaining;
    const progressPct = clampNumber((totalEarned / activeGoal.targetAmount) * 100, 0, 100);

    const dayMap = new Map<string, number>();
    projects.forEach((project) => {
      if (!project.createdAt || project.profit === null || isSundayIso(project.createdAt)) return;
      dayMap.set(project.createdAt, (dayMap.get(project.createdAt) ?? 0) + project.profit);
    });

    const chart: ChartPoint[] = [];
    let running = 0;
    const cursor = new Date(start);
    const goalDays = businessDaysBetweenInclusive(activeGoal.startDate, activeGoal.endDate);
    let elapsedGoalDays = 0;
    while (cursor <= chartEnd) {
      const iso = format(cursor, 'yyyy-MM-dd');
      if (!isSunday(cursor)) {
        running += dayMap.get(iso) ?? 0;
        elapsedGoalDays += iso >= activeGoal.startDate && iso <= activeGoal.endDate ? 1 : 0;
        const goalLine = goalDays <= 1
          ? activeGoal.targetAmount
          : activeGoal.targetAmount * clampNumber((elapsedGoalDays - 1) / (goalDays - 1), 0, 1);
        chart.push({
          date: iso,
          label: new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(cursor),
          earned: running,
          goalLine,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return {
      projects,
      earnedProjects,
      chart,
      totalEarned,
      totalDays,
      averagePerJob,
      averagePerWorkedDay,
      averagePerCalendarDay,
      neededPerDay,
      neededRemainingPerDay,
      remaining,
      progressPct,
    };
  }, [goal, metrics]);

  const handleOpenGoalDialog = () => {
    const activeGoal = goal ?? buildDefaultGoal();
    setGoalAmountInput(String(activeGoal.targetAmount));
    setGoalStartDateInput(activeGoal.startDate);
    setGoalEndDateInput(activeGoal.endDate);
    setGoalDialogOpen(true);
  };

  const handleSaveGoal = async () => {
    if (!user || !firestore || !goal) return;
    const targetAmount = Number(goalAmountInput.replace(',', '.'));
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      toast({
        title: 'Ongeldig doelbedrag',
        description: 'Vul een bedrag groter dan 0 in.',
        variant: 'destructive',
      });
      return;
    }
    if (!parseIsoDate(goalStartDateInput)) {
      toast({
        title: 'Ongeldige startdatum',
        description: 'Kies een geldige startdatum.',
        variant: 'destructive',
      });
      return;
    }
    if (!parseIsoDate(goalEndDateInput) || goalEndDateInput < goalStartDateInput) {
      toast({
        title: 'Ongeldige einddatum',
        description: 'De einddatum moet op of na de startdatum liggen.',
        variant: 'destructive',
      });
      return;
    }

    setSavingGoal(true);
    try {
      const nextGoal: FinanceGoal = {
        targetAmount,
        startDate: goalStartDateInput,
        endDate: goalEndDateInput,
      };
      await setDoc(
        doc(firestore, 'users', user.uid),
        {
          financeGoal: {
            ...nextGoal,
            updatedAt: serverTimestamp(),
          },
        },
        { merge: true }
      );
      setGoal(nextGoal);
      setGoalDialogOpen(false);
      toast({
        title: 'Doel opgeslagen',
        description: `Nieuw financieel doel: ${formatCurrency(targetAmount)}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      toast({
        title: 'Opslaan mislukt',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSavingGoal(false);
    }
  };

  if (isUserLoading || !user || loading || !goal) {
    return <LoadingPage />;
  }

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Financieen" />

      <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
        <div className="w-full max-w-7xl space-y-8">
          <section className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/[0.12] via-card/55 to-cyan-500/[0.08]">
            <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-200">
                  <Target className="h-4 w-4" />
                  Financieel doel vanaf {formatDate(goal.startDate)}
                </div>
                <div>
                  <p className="text-4xl font-semibold tracking-tight text-foreground">
                    {formatCurrency(derived.totalEarned)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    van {formatCurrency(goal.targetAmount)} tot {formatDate(goal.endDate)}. Zondagen tellen niet mee.
                  </p>
                </div>
              </div>

              <Button type="button" onClick={handleOpenGoalDialog} className="gap-2 self-start">
                <Pencil className="h-4 w-4" />
                Doel instellen
              </Button>
            </div>
            <div className="px-5 pb-5">
              <Progress value={derived.progressPct} className="h-2" />
              <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>{derived.progressPct.toFixed(1)}% behaald</span>
                <span>Nog {formatCurrency(derived.remaining)} te gaan</span>
              </div>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Gemiddeld per klus', value: formatCurrency(derived.averagePerJob), tone: 'text-emerald-300' },
              { label: 'Gemiddeld per werkdag', value: formatCurrency(derived.averagePerWorkedDay), tone: 'text-cyan-300' },
              { label: 'Gemiddeld per doeldag', value: formatCurrency(derived.averagePerCalendarDay), tone: 'text-foreground' },
              { label: 'Nodig per dag vanaf nu', value: formatCurrency(derived.neededRemainingPerDay), tone: 'text-amber-300' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-white/10 bg-card/45 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80">{item.label}</p>
                <p className={cn('mt-2 text-2xl font-semibold leading-none', item.tone)}>{item.value}</p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-white/10 bg-card/35 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Voortgang</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Opbouw van {formatDate(goal.startDate)} tot {formatDate(goal.endDate)}. Zondagen zijn uitgesloten.
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-background/30 px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Benodigd gemiddeld</p>
                <p className="text-sm font-semibold text-foreground">{formatCurrency(derived.neededPerDay)} / dag</p>
              </div>
            </div>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={derived.chart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="earnedFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={formatCompactCurrency} width={70} />
                  <Tooltip
                    cursor={{ stroke: 'rgba(255,255,255,0.16)' }}
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      color: 'hsl(var(--foreground))',
                    }}
                    formatter={(value: number, name) => [
                      formatCurrency(value),
                      name === 'earned' ? 'Verdiend' : 'Doellijn',
                    ]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.date ? formatDate(payload[0].payload.date) : ''}
                  />
                  <Area type="monotone" dataKey="goalLine" stroke="#f59e0b" strokeWidth={2} fill="transparent" dot={false} />
                  <Area type="monotone" dataKey="earned" stroke="#34d399" strokeWidth={3} fill="url(#earnedFill)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Verdiensten per klus</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                {derived.earnedProjects.length} klus(sen) met werkelijke verdiensten in deze periode, exclusief zondagen.
                </p>
              </div>
              <div className="text-sm text-muted-foreground">
                Totaal: <span className="font-semibold text-foreground">{formatCurrency(derived.totalEarned)}</span>
              </div>
            </div>

            {derived.projects.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-card/35 p-6 text-sm text-muted-foreground">
                Nog geen inkomsten in deze periode. Zondaginkomsten worden niet meegenomen.
              </div>
            ) : (
              <div className="space-y-3">
                {derived.projects.map((project) => (
                  <div key={project.projectId} className="rounded-xl border border-white/10 bg-card/40 px-4 py-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-foreground">{project.label}</p>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          {project.clientName} • {formatDate(project.createdAt)}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-right sm:grid-cols-3">
                        <div className="rounded-lg border border-white/10 bg-background/25 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Verdiend</p>
                          <p
                            className={cn(
                              'mt-0.5 text-sm font-semibold',
                              project.excludedSunday
                                ? 'text-amber-300'
                                : project.profit === null
                                ? 'text-muted-foreground'
                                : project.profit >= 0
                                  ? 'text-emerald-300'
                                  : 'text-red-300'
                            )}
                          >
                            {project.excludedSunday ? 'Zondag' : project.profit === null ? 'Onbekend' : formatCurrency(project.profit)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-background/25 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">€/dag</p>
                          <p className="mt-0.5 text-sm font-semibold text-cyan-300">
                            {project.euroPerDay === null ? 'Onbekend' : formatCurrency(project.euroPerDay)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-background/25 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Dagen</p>
                          <p className="mt-0.5 text-sm font-semibold text-foreground">{project.days.toFixed(1)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Financieel doel instellen</DialogTitle>
            <DialogDescription>
              Kies de periode voor deze hele pagina. Verdiensten op zondag tellen niet mee.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="goal-amount">Doelbedrag</Label>
              <Input
                id="goal-amount"
                inputMode="decimal"
                value={goalAmountInput}
                onChange={(event) => setGoalAmountInput(event.target.value)}
                placeholder="10000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-start-date">Startdatum</Label>
              <Input
                id="goal-start-date"
                type="date"
                value={goalStartDateInput}
                onChange={(event) => setGoalStartDateInput(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-end-date">Einddatum</Label>
              <Input
                id="goal-end-date"
                type="date"
                min={goalStartDateInput || undefined}
                value={goalEndDateInput}
                onChange={(event) => setGoalEndDateInput(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGoalDialogOpen(false)}>
              Annuleren
            </Button>
            <Button type="button" onClick={handleSaveGoal} disabled={savingGoal}>
              {savingGoal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
