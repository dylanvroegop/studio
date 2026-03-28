'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, BarChart3, Loader2 } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import type { WinstCostCategoryKey, WinstMetricsResponse, WinstVarianceStatus } from '@/lib/winst-types';
import { cn } from '@/lib/utils';

type PeriodType = 'month' | 'week';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Number.isFinite(amount) ? amount : 0);
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

function varianceStatusClass(status: WinstVarianceStatus): string {
  if (status === 'green') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (status === 'orange') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-red-500/15 text-red-300 border-red-500/30';
}

function varianceLabel(status: WinstVarianceStatus): string {
  if (status === 'green') return 'Onder budget';
  if (status === 'orange') return 'Waarschuwing';
  return 'Over budget';
}

function issueLabelFromCategoryKey(key: WinstCostCategoryKey): string {
  if (key === 'arbeid') return 'arbeid overschreden';
  if (key === 'materialenGroot') return 'groot materiaal overschreden';
  if (key === 'materialenVerbruik') return 'verbruiksmateriaal overschreden';
  if (key === 'transport') return 'transport onderschat';
  if (key === 'materieel') return 'materieel onderschat';
  return 'overhead onderschat';
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
        <Button variant="outline" className="justify-between gap-2">
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
        const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; data?: WinstMetricsResponse } | null;
        if (!response.ok || !payload?.ok || !payload.data) {
          throw new Error(payload?.message || `HTTP ${response.status}`);
        }
        if (!cancelled) {
          setMetrics(payload.data);
        }
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

  const filteredProjects = useMemo(() => {
    if (!metrics?.projectPerformances) return [];
    const term = projectSearch.trim().toLowerCase();
    if (!term) return metrics.projectPerformances;
    return metrics.projectPerformances.filter((project) => {
      const target = `${project.title} ${project.clientName} ${project.offerteNummer || ''}`.toLowerCase();
      return target.includes(term);
    });
  }, [metrics?.projectPerformances, projectSearch]);

  if (isUserLoading || !user || loadingMetrics || !metrics) {
    return <PageSkeleton />;
  }

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Winst" />

      <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
        <div className="w-full max-w-7xl space-y-6">
          <Card className="border-amber-500/20">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="flex items-center gap-2 text-amber-300">
                    <BarChart3 className="h-5 w-5" />
                    Winst 2.0 - Offerte vs Werkelijk
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{metrics.periodLabel}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Tabs value={periodType} onValueChange={(value) => setPeriodType(value as PeriodType)}>
                    <TabsList>
                      <TabsTrigger value="month">Per maand</TabsTrigger>
                      <TabsTrigger value="week">Per week</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Select value={String(periodRange)} onValueChange={(value) => setPeriodRange(Number(value))}>
                    <SelectTrigger className="w-[140px]">
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
              </div>
            </CardHeader>
          </Card>

          {metricsError ? (
            <Card className="border-red-500/30 bg-red-500/10">
              <CardContent className="pt-6 text-sm text-red-200">Metrics fout: {metricsError}</CardContent>
            </Card>
          ) : null}

          {metrics.dataQuality.projectsMissingActual > 0 ? (
            <Card className="border-amber-500/25 bg-amber-500/10">
              <CardContent className="pt-6 text-sm text-amber-200">
                {metrics.dataQuality.projectsMissingActual} van {metrics.dataQuality.projectsTotal} projecten hebben nog geen nacalculatie.
                Deze projecten blijven zichtbaar met datakwaliteit-waarschuwing.
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Omzet geoffreerd (incl.)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-amber-300">{formatCurrency(metrics.totals.quotedRevenueIncl)}</div>
              </CardContent>
            </Card>
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Ontvangen cash (incl.)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-emerald-300">{formatCurrency(metrics.totals.receivedCashIncl)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Werkelijke kosten (excl.)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{formatCurrency(metrics.totals.actualCostExcl)}</div>
              </CardContent>
            </Card>
            <Card className={cn(metrics.totals.netProfitQuoteBasis >= 0 ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5')}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Netto winst (quote basis)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn('text-2xl font-semibold', metrics.totals.netProfitQuoteBasis >= 0 ? 'text-emerald-300' : 'text-red-300')}>
                  {formatCurrency(metrics.totals.netProfitQuoteBasis)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Winstmarge</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{formatPercent(metrics.totals.marginPct)}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Trend: Omzet vs Kosten vs Netto winst</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics.trend} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trendQuoted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="trendActual" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.24} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="trendProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <RechartsTooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 10 }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Area type="monotone" dataKey="quotedRevenueIncl" name="Geoffreerd" stroke="#f59e0b" fill="url(#trendQuoted)" />
                  <Area type="monotone" dataKey="actualCostExcl" name="Werkelijke kosten" stroke="#ef4444" fill="url(#trendActual)" />
                  <Area type="monotone" dataKey="netProfitQuoteBasis" name="Netto winst" stroke="#10b981" fill="url(#trendProfit)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">1) Cost Breakdown (Werkelijk vs Geoffreerd)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {metrics.costBreakdown.categories.map((row) => (
                <div key={row.key} className="grid grid-cols-12 items-center gap-2 rounded-md border border-border/60 p-2 text-sm">
                  <div className="col-span-12 font-medium md:col-span-3">{row.label}</div>
                  <div className="col-span-6 md:col-span-2">{formatCurrency(row.actualExcl)}</div>
                  <div className="col-span-6 md:col-span-2">{formatCurrency(row.quotedExcl)}</div>
                  <div className="col-span-6 md:col-span-2">{formatSignedCurrency(row.diffEuro)}</div>
                  <div className="col-span-6 md:col-span-1">{formatSignedPercent(row.diffPct)}</div>
                  <div className="col-span-12 md:col-span-2">
                    <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium', varianceStatusClass(row.status))}>
                      {varianceLabel(row.status)}
                    </span>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-12 items-center gap-2 rounded-md border border-border p-2 text-sm font-semibold">
                <div className="col-span-12 md:col-span-3">Totaal</div>
                <div className="col-span-6 md:col-span-2">{formatCurrency(metrics.costBreakdown.total.actualExcl)}</div>
                <div className="col-span-6 md:col-span-2">{formatCurrency(metrics.costBreakdown.total.quotedExcl)}</div>
                <div className="col-span-6 md:col-span-2">{formatSignedCurrency(metrics.costBreakdown.total.diffEuro)}</div>
                <div className="col-span-6 md:col-span-1">{formatSignedPercent(metrics.costBreakdown.total.diffPct)}</div>
                <div className="col-span-12 md:col-span-2">
                  <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium', varianceStatusClass(metrics.costBreakdown.total.status))}>
                    {varianceLabel(metrics.costBreakdown.total.status)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">2) Margin Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span>Gemiddelde marge per klus</span><span>{formatPercent(metrics.marginAnalysis.avgMarginPct)}</span></div>
                <div className="flex items-center justify-between"><span>Hoogste marge klus</span><span>{metrics.marginAnalysis.bestProject ? `${formatPercent(metrics.marginAnalysis.bestProject.marginPct)} (${metrics.marginAnalysis.bestProject.title})` : '—'}</span></div>
                <div className="flex items-center justify-between"><span>Slechtste klus</span><span>{metrics.marginAnalysis.worstProject ? `${formatPercent(metrics.marginAnalysis.worstProject.marginPct)} (${metrics.marginAnalysis.worstProject.title})` : '—'}</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">3) Leak Detection</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {metrics.leakDetection.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nog geen structurele lekken gedetecteerd (of te weinig data).</p>
                ) : (
                  metrics.leakDetection.map((leak) => (
                    <div key={leak.id} className={cn('rounded-md border px-3 py-2 text-sm', leak.severity === 'critical' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200')}>
                      {leak.message}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">4) Time Tracking Insights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span>Gecalculeerde uren</span><span>{metrics.timeTracking.quotedHours.toFixed(1)} u</span></div>
                <div className="flex items-center justify-between"><span>Gewerkte uren</span><span>{metrics.timeTracking.actualHours.toFixed(1)} u</span></div>
                <div className="flex items-center justify-between"><span>Verschil</span><span>{metrics.timeTracking.hoursDiff.toFixed(1)} u ({formatSignedPercent(metrics.timeTracking.hoursDiffPct)})</span></div>
                <div className="flex items-center justify-between"><span>€ / uur verwacht</span><span>{formatCurrency(metrics.timeTracking.expectedEuroPerHour)}</span></div>
                <div className="flex items-center justify-between"><span>€ / uur gerealiseerd</span><span>{formatCurrency(metrics.timeTracking.realizedEuroPerHour)}</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">5) Transport Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span>Werkelijk transport</span><span>{formatCurrency(metrics.transportAnalysis.actualExcl)}</span></div>
                <div className="flex items-center justify-between"><span>Geoffreerd transport</span><span>{formatCurrency(metrics.transportAnalysis.quotedExcl)}</span></div>
                <div className="flex items-center justify-between"><span>Verschil</span><span>{formatSignedCurrency(metrics.transportAnalysis.diffEuro)} ({formatSignedPercent(metrics.transportAnalysis.diffPct)})</span></div>
                <div className="flex items-center justify-between"><span>Gem. km per klus</span><span>{metrics.transportAnalysis.avgKmPerProject.toFixed(1)} km</span></div>
                <div className="flex items-center justify-between"><span>Opbrengst/kosten ratio</span><span>{metrics.transportAnalysis.avgRevenueVsCost.toFixed(2)}</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">6) Material Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="rounded border border-border/60 p-2">
                  <div className="font-medium">Groot materiaal</div>
                  <div>{formatCurrency(metrics.materialAnalysis.groot.actualExcl)} vs {formatCurrency(metrics.materialAnalysis.groot.quotedExcl)}</div>
                  <div className={cn(metrics.materialAnalysis.groot.diffEuro <= 0 ? 'text-emerald-300' : 'text-red-300')}>
                    {formatSignedCurrency(metrics.materialAnalysis.groot.diffEuro)} ({formatSignedPercent(metrics.materialAnalysis.groot.diffPct)})
                  </div>
                </div>
                <div className="rounded border border-border/60 p-2">
                  <div className="font-medium">Verbruiksmateriaal</div>
                  <div>{formatCurrency(metrics.materialAnalysis.verbruik.actualExcl)} vs {formatCurrency(metrics.materialAnalysis.verbruik.quotedExcl)}</div>
                  <div className={cn(metrics.materialAnalysis.verbruik.diffEuro <= 0 ? 'text-emerald-300' : 'text-red-300')}>
                    {formatSignedCurrency(metrics.materialAnalysis.verbruik.diffEuro)} ({formatSignedPercent(metrics.materialAnalysis.verbruik.diffPct)})
                  </div>
                </div>
                <div className="rounded border border-border/60 p-2">
                  <div className="font-medium">Materiaalmarge (markup vs real)</div>
                  <div className={cn(metrics.materialAnalysis.markupVsRealPct >= 0 ? 'text-emerald-300' : 'text-red-300')}>
                    {formatSignedPercent(metrics.materialAnalysis.markupVsRealPct)}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Top 5 duurste materiaalposten (werkelijk)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {metrics.materialAnalysis.topCostItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen materiaalposten uit nacalculatie.</p>
              ) : (
                metrics.materialAnalysis.topCostItems.map((item, index) => (
                  <div key={`${item.projectId}-${item.name}-${index}`} className="flex items-center justify-between rounded border border-border/60 px-3 py-2 text-sm">
                    <div className="truncate pr-3">
                      {index + 1}. {item.name} <span className="text-muted-foreground">({item.projectLabel})</span>
                    </div>
                    <div className="font-semibold">{formatCurrency(item.totalExcl)}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">7) Smart Insights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {metrics.smartInsights.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen inzichten beschikbaar.</p>
              ) : (
                metrics.smartInsights.map((insight, index) => (
                  <div key={`${index}-${insight}`} className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
                    {insight}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">8) Cashflow vs Profit</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div className="rounded border border-border/60 p-3">
                <div className="text-xs text-muted-foreground">Winst (boekhoudkundig)</div>
                <div className={cn('text-lg font-semibold', metrics.cashflow.profitQuoteBasis >= 0 ? 'text-emerald-300' : 'text-red-300')}>
                  {formatCurrency(metrics.cashflow.profitQuoteBasis)}
                </div>
              </div>
              <div className="rounded border border-border/60 p-3">
                <div className="text-xs text-muted-foreground">Ontvangen geld</div>
                <div className="text-lg font-semibold">{formatCurrency(metrics.cashflow.receivedCashIncl)}</div>
                <div className="text-xs text-muted-foreground mt-1">Cash-in ratio: {formatPercent(metrics.cashflow.cashInRatio)}</div>
              </div>
              <div className="rounded border border-border/60 p-3">
                <div className="text-xs text-muted-foreground">Openstaand / Te laat risico</div>
                <div className="text-lg font-semibold">{formatCurrency(metrics.cashflow.openAmount)}</div>
                <div className="text-xs text-red-300 mt-1">Te laat: {formatCurrency(metrics.cashflow.overdueAmount)} ({metrics.cashflow.overdueCount} facturen)</div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-emerald-300">10) Top 5 winstgevende klussen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {metrics.topPerformers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nog niet genoeg nacalculatie-data.</p>
                ) : (
                  metrics.topPerformers.map((project, index) => (
                    <div key={project.projectId} className="rounded-md border border-border/60 p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{index + 1}. {project.title}</span>
                        <span className="font-semibold text-emerald-300">{formatCurrency(project.netProfitQuoteBasis)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Marge: {formatPercent(project.marginPct)}</span>
                        <span>Issue: {project.keyIssue}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-red-300">10) Slechtste 5 klussen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {metrics.worstPerformers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nog niet genoeg nacalculatie-data.</p>
                ) : (
                  metrics.worstPerformers.map((project, index) => (
                    <div key={project.projectId} className="rounded-md border border-border/60 p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{index + 1}. {project.title}</span>
                        <span className={cn('font-semibold', project.netProfitQuoteBasis >= 0 ? 'text-amber-300' : 'text-red-300')}>
                          {formatCurrency(project.netProfitQuoteBasis)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Marge: {formatPercent(project.marginPct)}</span>
                        <span>Issue: {project.keyIssue}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Project prestaties (geoffreerd vs werkelijk)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="projectSearch" className="text-xs text-muted-foreground">Zoek project</Label>
                <Input
                  id="projectSearch"
                  value={projectSearch}
                  onChange={(event) => setProjectSearch(event.target.value)}
                  placeholder="Zoek op klant of project"
                  className="max-w-xs"
                />
              </div>
              <div className="space-y-2">
                {filteredProjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Geen projecten in deze selectie.</p>
                ) : (
                  filteredProjects.map((project) => {
                    const topOverrun = project.costBreakdown
                      .filter((row) => row.diffEuro > 0)
                      .sort((a, b) => b.diffEuro - a.diffEuro)[0];

                    return (
                      <div key={project.projectId} className="rounded-md border border-border/60 p-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {project.offerteNummer ? `#${project.offerteNummer} • ` : ''}
                              {project.title}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {project.clientName} • {project.jobTypes.join(', ') || 'Onbekend type'}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={cn('text-sm font-semibold', project.netProfitQuoteBasis >= 0 ? 'text-emerald-300' : 'text-red-300')}>
                              {formatCurrency(project.netProfitQuoteBasis)}
                            </div>
                            <div className="text-xs text-muted-foreground">Marge {formatPercent(project.marginPct)}</div>
                          </div>
                        </div>

                        <div className="mt-2 grid gap-2 text-xs md:grid-cols-4">
                          <div>Omzet: {formatCurrency(project.quotedRevenueIncl)}</div>
                          <div>Werkelijke kosten: {formatCurrency(project.actualCostExcl)}</div>
                          <div>Uren: {project.actualHours.toFixed(1)} / {project.quotedHours.toFixed(1)}</div>
                          <div className={cn(!project.hasActualData ? 'text-amber-300' : 'text-muted-foreground')}>
                            {project.hasActualData
                              ? `Issue: ${topOverrun ? issueLabelFromCategoryKey(topOverrun.key) : 'Binnen budget'}`
                              : 'Waarschuwing: geen nacalculatie'}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70">
            <CardContent className="pt-6 text-xs text-muted-foreground">
              Elk getal is bedoeld als offerte-feedback voor je volgende klus: waar zat je ernaast, en welke opslag of ureninschatting moet je aanpassen.
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
