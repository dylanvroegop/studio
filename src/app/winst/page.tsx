'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import type { WinstCostCategoryKey, WinstMetricsResponse } from '@/lib/winst-types';
import { cn } from '@/lib/utils';

type PeriodType = 'month' | 'week';
type KPIItemTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'unknown';
type ProjectRowData = WinstMetricsResponse['projectPerformances'][number] & {
  actualProjectProfit: number | null;
  actualProjectMargin: number | null;
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatPercent(value: number): string {
  return `${(Number.isFinite(value) ? value * 100 : 0).toFixed(1)}%`;
}

function formatSignedPercent(value: number): string {
  const numeric = Number.isFinite(value) ? value * 100 : 0;
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${numeric.toFixed(1)}%`;
}

function formatSignedCurrency(value: number): string {
  const numeric = Number.isFinite(value) ? value : 0;
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${formatCurrency(numeric)}`;
}

function formatProjectDate(value: string | null): string {
  if (!value) return 'Onbekende datum';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Onbekende datum';
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function kpiValueClass(tone: KPIItemTone): string {
  if (tone === 'positive') return 'text-emerald-300';
  if (tone === 'negative') return 'text-red-300';
  if (tone === 'warning') return 'text-amber-300';
  if (tone === 'unknown') return 'text-muted-foreground';
  return 'text-foreground';
}

function FilterPopover(props: {
  title: string;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { title, options, selected, onChange } = props;
  const selectedCount = selected.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-between gap-2 border-border/60 bg-background/40">
          <span>{title}</span>
          <span className="text-xs text-muted-foreground">{selectedCount > 0 ? `${selectedCount} geselecteerd` : 'Alle'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2 p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">{title}</div>
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange([])}>
            Reset
          </Button>
        </div>
        <div className="max-h-64 space-y-1 overflow-auto pr-1">
          {options.length === 0 ? (
            <p className="text-xs text-muted-foreground">Geen opties beschikbaar.</p>
          ) : (
            options.map((option) => (
              <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 px-2 py-1.5">
                <Checkbox
                  checked={selected.includes(option.id)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onChange(Array.from(new Set([...selected, option.id])));
                      return;
                    }
                    onChange(selected.filter((item) => item !== option.id));
                  }}
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function KPIItem(props: {
  label: string;
  value: string;
  tone?: KPIItemTone;
  className?: string;
}) {
  const { label, value, tone = 'neutral', className } = props;
  return (
    <div className={cn('flex-1 px-5 py-4 sm:px-6 sm:py-5', className)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80">{label}</p>
      <p className={cn('mt-2 text-3xl font-semibold leading-none drop-shadow-[0_0_16px_rgba(16,185,129,0.08)]', kpiValueClass(tone))}>{value}</p>
    </div>
  );
}

function EmptyStateBlock(props: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { title, description, actionLabel, onAction } = props;
  return (
    <div className="rounded-2xl bg-muted/20 px-6 py-12 text-center">
      <h3 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction ? (
        <Button onClick={onAction} className="mt-6 bg-emerald-500 text-black hover:bg-emerald-400">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function ProjectRow(props: {
  project: ProjectRowData;
}) {
  const { project } = props;

  const status = !project.hasActualData
    ? { label: 'Geen nacalculatie', className: 'border-amber-500/30 bg-amber-500/10 text-amber-200' }
    : (project.actualProjectProfit ?? 0) < 0
      ? { label: 'Verlies', className: 'border-red-500/30 bg-red-500/10 text-red-200' }
      : { label: 'Winstgevend', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' };

  const winstText =
    project.actualProjectProfit === null
      ? 'Onbekend'
      : formatCurrency(project.actualProjectProfit);

  const winstTextClass =
    project.actualProjectProfit === null
      ? 'text-muted-foreground'
      : project.actualProjectProfit < 0
        ? 'text-red-300'
        : 'text-emerald-300';
  const margeText =
    project.actualProjectMargin === null
      ? 'Onbekend'
      : formatPercent(project.actualProjectMargin);
  const margeTextClass =
    project.actualProjectMargin === null
      ? 'text-muted-foreground'
      : project.actualProjectMargin < 0
        ? 'text-red-300'
        : 'text-emerald-300';

  return (
    <div className="rounded-2xl bg-card/35 px-4 py-4 transition-all duration-200 hover:bg-card/55 hover:shadow-[0_12px_30px_-20px_rgba(16,185,129,0.35)] md:px-5">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] xl:items-center">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">{project.title}</p>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {project.clientName} • {formatProjectDate(project.createdAt)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <p className="text-muted-foreground">
            Omzet <span className="ml-1 font-semibold text-foreground">{formatCurrency(project.quotedRevenueIncl)}</span>
          </p>
          <p className="text-muted-foreground">
            Kosten <span className="ml-1 font-semibold text-foreground">{project.hasActualData ? formatCurrency(project.actualCostExcl) : '—'}</span>
          </p>
          <p className={cn('text-muted-foreground', winstTextClass)}>
            Winst <span className={cn('ml-1 font-semibold', winstTextClass)}>{winstText}</span>
          </p>
          <p className={cn('text-muted-foreground', margeTextClass)}>
            Marge <span className={cn('ml-1 font-semibold', margeTextClass)}>{margeText}</span>
          </p>
        </div>

        <div className="flex items-center xl:justify-end">
          <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-medium', status.className)}>{status.label}</span>
        </div>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader user={null} title="Winst" />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="flex items-center gap-3 rounded-3xl border bg-card/50 p-8 text-muted-foreground shadow-sm backdrop-blur-xl">
          <Loader2 className="h-6 w-6 animate-spin" />
          Laden...
        </div>
      </main>
    </div>
  );
}

export default function WinstPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [periodRange, setPeriodRange] = useState<number>(6);
  const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<WinstMetricsResponse | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState<boolean>(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState<string>('');

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, router, user]);

  useEffect(() => {
    setPeriodRange(periodType === 'month' ? 6 : 8);
  }, [periodType]);

  useEffect(() => {
    if (!user || !firestore) return;
    let cancelled = false;

    const loadMetrics = async () => {
      setLoadingMetrics(true);
      setMetricsError(null);
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/winst/metrics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            periodType,
            periodRange,
            jobTypes: selectedJobTypes,
            clientIds: selectedClientIds,
            projectIds: selectedProjectIds,
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
          setMetricsError(message);
          setMetrics(null);
          toast({
            title: 'Winstmetrics laden mislukt',
            description: message,
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoadingMetrics(false);
      }
    };

    void loadMetrics();

    return () => {
      cancelled = true;
    };
  }, [firestore, periodRange, periodType, selectedClientIds, selectedJobTypes, selectedProjectIds, toast, user]);

  const derived = useMemo(() => {
    const projects = metrics?.projectPerformances ?? [];
    const withActual = projects.filter((project) => project.hasActualData);

    const sumQuotedRevenue = projects.reduce((sum, project) => sum + project.quotedRevenueIncl, 0);
    const sumQuotedCost = projects.reduce(
      (sum, project) => sum + project.costBreakdown.reduce((rowSum, row) => rowSum + row.quotedExcl, 0),
      0
    );
    const estimatedProfit = sumQuotedRevenue - sumQuotedCost;

    const sumActualCostKnown = withActual.reduce((sum, project) => sum + project.actualCostExcl, 0);
    const sumActualRevenueScope = withActual.reduce((sum, project) => sum + project.quotedRevenueIncl, 0);
    const actualProfitKnown = withActual.length > 0 ? sumActualRevenueScope - sumActualCostKnown : null;
    const actualMarginKnown =
      withActual.length > 0 && sumActualRevenueScope > 0 && actualProfitKnown !== null
        ? actualProfitKnown / sumActualRevenueScope
        : null;

    const bucketDefs = [
      {
        id: 'arbeid',
        label: 'Arbeid',
        keys: new Set<WinstCostCategoryKey>(['arbeid']),
      },
      {
        id: 'materiaal',
        label: 'Materiaal',
        keys: new Set<WinstCostCategoryKey>(['materialenGroot', 'materialenVerbruik']),
      },
      {
        id: 'transport',
        label: 'Transport',
        keys: new Set<WinstCostCategoryKey>(['transport']),
      },
      {
        id: 'overhead',
        label: 'Overhead',
        keys: new Set<WinstCostCategoryKey>(['overhead', 'materieel']),
      },
    ];

    const deviations = bucketDefs
      .map((bucket) => {
        const quoted = withActual.reduce(
          (sum, project) =>
            sum +
            project.costBreakdown
              .filter((row) => bucket.keys.has(row.key))
              .reduce((rowSum, row) => rowSum + row.quotedExcl, 0),
          0
        );
        const actual = withActual.reduce(
          (sum, project) =>
            sum +
            project.costBreakdown
              .filter((row) => bucket.keys.has(row.key))
              .reduce((rowSum, row) => rowSum + row.actualExcl, 0),
          0
        );
        const diff = actual - quoted;
        const diffPct = quoted > 0 ? diff / quoted : null;
        return {
          id: bucket.id,
          label: bucket.label,
          quoted,
          actual,
          diff,
          diffPct,
        };
      })
      .filter((row) => row.quoted > 0 || row.actual > 0)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    const totalQuotedHours = withActual.reduce((sum, project) => sum + project.quotedHours, 0);
    const totalActualHours = withActual.reduce((sum, project) => sum + project.actualHours, 0);
    const hoursDiffPct = totalQuotedHours > 0 ? (totalActualHours - totalQuotedHours) / totalQuotedHours : null;

    const recommendationItems: string[] = [];
    if (withActual.length >= 2) {
      const arbeid = deviations.find((item) => item.id === 'arbeid');
      const materiaal = deviations.find((item) => item.id === 'materiaal');
      const transport = deviations.find((item) => item.id === 'transport');

      if (arbeid && arbeid.diffPct !== null && arbeid.diffPct > 0.1) {
        recommendationItems.push(
          `Arbeid ligt gemiddeld ${formatSignedPercent(arbeid.diffPct)} boven offerte.`
        );
      }

      if (materiaal && materiaal.diffPct !== null && materiaal.diffPct > 0.1) {
        recommendationItems.push(
          `Materiaalkosten lopen gemiddeld ${formatSignedPercent(materiaal.diffPct)} op.`
        );
      }

      if (transport && transport.diffPct !== null && transport.diffPct > 0.1) {
        recommendationItems.push(
          `Transport wordt gemiddeld ${formatSignedPercent(transport.diffPct)} onderschat.`
        );
      }

      if (hoursDiffPct !== null && hoursDiffPct > 0.1) {
        recommendationItems.push(
          `Werkelijke uren liggen ${formatSignedPercent(hoursDiffPct)} boven planning.`
        );
      }
    }

    const projectRows: ProjectRowData[] = projects.map((project) => {
      const actualProjectProfit = project.hasActualData ? project.quotedRevenueIncl - project.actualCostExcl : null;
      const actualProjectMargin =
        actualProjectProfit !== null && project.quotedRevenueIncl > 0
          ? actualProjectProfit / project.quotedRevenueIncl
          : null;
      return {
        ...project,
        actualProjectProfit,
        actualProjectMargin,
      };
    });

    return {
      projects,
      withActual,
      sumQuotedRevenue,
      estimatedProfit,
      sumActualCostKnown,
      actualProfitKnown,
      actualMarginKnown,
      deviations,
      recommendationItems,
      projectRows,
    };
  }, [metrics]);

  const filteredProjects = useMemo(() => {
    const term = projectSearch.trim().toLowerCase();
    if (!term) return derived.projectRows;
    return derived.projectRows.filter((project) => {
      const target = `${project.title} ${project.clientName} ${project.offerteNummer || ''}`.toLowerCase();
      return target.includes(term);
    });
  }, [derived.projectRows, projectSearch]);

  if (isUserLoading || !user || loadingMetrics || !metrics) {
    return <PageSkeleton />;
  }

  const hasActualComparison = derived.withActual.length > 0;
  const hasEnoughInsightData = derived.withActual.length >= 2;
  const hasInsightContent =
    hasEnoughInsightData && (derived.deviations.length > 0 || derived.recommendationItems.length > 0);
  const shouldShowCashflow =
    metrics.totals.receivedCashIncl > 0 || metrics.cashflow.openAmount > 0 || metrics.cashflow.overdueAmount > 0;

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Winst" />

      <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
        <div className="w-full max-w-7xl space-y-12">
          <section className="rounded-2xl bg-card/30 p-4 md:p-5">
            <div className="flex justify-end">
              <p className="text-sm text-muted-foreground">{metrics.periodLabel}</p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Tabs value={periodType} onValueChange={(value) => setPeriodType(value as PeriodType)}>
                <TabsList>
                  <TabsTrigger value="month">Per maand</TabsTrigger>
                  <TabsTrigger value="week">Per week</TabsTrigger>
                </TabsList>
              </Tabs>
              <Select value={String(periodRange)} onValueChange={(value) => setPeriodRange(Number(value))}>
                <SelectTrigger className="w-[140px] border-border/60 bg-background/40">
                  <SelectValue placeholder="Periode" />
                </SelectTrigger>
                <SelectContent>
                  {periodType === 'month' ? (
                    <>
                      <SelectItem value="3">3 maanden</SelectItem>
                      <SelectItem value="6">6 maanden</SelectItem>
                      <SelectItem value="12">12 maanden</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="4">4 weken</SelectItem>
                      <SelectItem value="8">8 weken</SelectItem>
                      <SelectItem value="12">12 weken</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              <FilterPopover
                title="Type klus"
                options={metrics.filterOptions.jobTypes}
                selected={selectedJobTypes}
                onChange={setSelectedJobTypes}
              />
              <FilterPopover
                title="Klant"
                options={metrics.filterOptions.clients}
                selected={selectedClientIds}
                onChange={setSelectedClientIds}
              />
              <FilterPopover
                title="Project"
                options={metrics.filterOptions.projects}
                selected={selectedProjectIds}
                onChange={setSelectedProjectIds}
              />
            </div>
          </section>

          {metricsError ? (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
              Metrics fout: {metricsError}
            </div>
          ) : null}

          <section className="overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500/[0.10] via-background/95 to-cyan-500/[0.06]">
            <div className="overflow-x-auto">
              <div className="flex min-w-[620px] divide-x divide-white/10">
                <KPIItem label="Geoffreerde omzet" value={formatCurrency(derived.sumQuotedRevenue)} tone="warning" />
                <KPIItem
                  label="Werkelijke winst"
                  value={derived.actualProfitKnown === null ? 'Onbekend' : formatCurrency(derived.actualProfitKnown)}
                  tone={
                    derived.actualProfitKnown === null
                      ? 'unknown'
                      : derived.actualProfitKnown >= 0
                        ? 'positive'
                        : 'negative'
                  }
                />
                <KPIItem label="Ontvangen cash" value={formatCurrency(metrics.totals.receivedCashIncl)} tone="positive" />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Winst status</h2>
            {!hasActualComparison ? (
              <EmptyStateBlock
                title="Nog geen kosten geregistreerd"
                description="Voeg kosten toe via Kosten om werkelijke winst en marge per project te berekenen."
                actionLabel="Ga naar kosten"
                onAction={() => router.push('/kosten')}
              />
            ) : (
              <div className="rounded-2xl bg-card/30 px-6 py-10">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Werkelijke winst (ingevulde projecten)</p>
                <p
                  className={cn(
                    'mt-3 text-5xl font-semibold leading-none',
                    (derived.actualProfitKnown ?? 0) >= 0 ? 'text-emerald-300' : 'text-red-300'
                  )}
                >
                  {formatCurrency(derived.actualProfitKnown ?? 0)}
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
                  <p className="text-muted-foreground">
                    Werkelijke kosten <span className="ml-1 font-semibold text-foreground">{formatCurrency(derived.sumActualCostKnown)}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Marge{' '}
                    <span className="ml-1 font-semibold text-foreground">
                      {derived.actualMarginKnown === null ? 'Onbekend' : formatPercent(derived.actualMarginKnown)}
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    Ingevulde projecten <span className="ml-1 font-semibold text-foreground">{derived.withActual.length}</span>
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-5">
            <h2 className="text-xl font-semibold tracking-tight">Inzichten</h2>
            {!hasEnoughInsightData ? (
              <EmptyStateBlock title="Geen inzichten beschikbaar" description="Minimaal 2 projecten met nacalculatie nodig." />
            ) : hasInsightContent ? (
              <div className="space-y-8">
                {derived.deviations.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Belangrijkste afwijkingen</p>
                    <div className="space-y-1">
                      {derived.deviations.map((row) => (
                        <div key={row.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border/50 py-3 text-sm last:border-0">
                          <p className="font-medium text-foreground">{row.label}</p>
                          <p className={cn('font-semibold', row.diff > 0 ? 'text-red-300' : row.diff < 0 ? 'text-emerald-300' : 'text-muted-foreground')}>
                            {formatSignedCurrency(row.diff)}
                            {row.diffPct !== null ? ` • ${formatSignedPercent(row.diffPct)}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {derived.recommendationItems.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Aanbevelingen voor volgende offertes</p>
                    <ul className="space-y-2">
                      {derived.recommendationItems.map((item, index) => (
                        <li key={`${index}-${item}`} className="text-sm text-foreground/90">
                          • {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyStateBlock title="Geen inzichten beschikbaar" description="Nog geen duidelijke afwijkingen in de huidige selectie." />
            )}
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-semibold tracking-tight">Project prestaties</h2>
              <Input
                value={projectSearch}
                onChange={(event) => setProjectSearch(event.target.value)}
                placeholder="Zoek project of klant"
                className="sm:w-72 border-border/60 bg-background/40"
              />
            </div>

            <div className="space-y-2">
              {filteredProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">Geen projecten in deze selectie.</p>
              ) : (
                filteredProjects.map((project) => (
                  <ProjectRow
                    key={project.projectId}
                    project={project}
                  />
                ))
              )}
            </div>
          </section>

          {shouldShowCashflow ? (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold tracking-tight">Cashflow</h2>
              <div className="rounded-2xl bg-card/25 px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
                  <p className="text-muted-foreground">
                    Ontvangen <span className="ml-1 font-semibold text-emerald-300">{formatCurrency(metrics.totals.receivedCashIncl)}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Openstaand <span className="ml-1 font-semibold text-foreground">{formatCurrency(metrics.cashflow.openAmount)}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Te laat risico <span className="ml-1 font-semibold text-red-300">{formatCurrency(metrics.cashflow.overdueAmount)}</span>
                  </p>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}
