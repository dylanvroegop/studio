'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import {
  Area,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, Loader2, TrendingUp } from 'lucide-react';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { buildProfitCsv, downloadCsv, exportProfitPdf } from '@/lib/export-profit-report';
import {
  calculateProfitMetrics,
  type ProfitInvoiceInput,
  type ProfitPaymentInput,
  type ProfitPeriod,
  type ProfitQuoteInput,
} from '@/lib/profit-metrics';
import { cn } from '@/lib/utils';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Number.isFinite(amount) ? amount : 0);
}

function formatPercent(amount: number): string {
  return `${(Number.isFinite(amount) ? amount : 0).toFixed(1)}%`;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && value !== null && 'seconds' in value && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  return null;
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

  const [period, setPeriod] = useState<ProfitPeriod>('6m');
  const [quotes, setQuotes] = useState<ProfitQuoteInput[]>([]);
  const [invoices, setInvoices] = useState<ProfitInvoiceInput[]>([]);
  const [payments, setPayments] = useState<ProfitPaymentInput[]>([]);
  const [quotesReady, setQuotesReady] = useState(false);
  const [invoicesReady, setInvoicesReady] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showForecast, setShowForecast] = useState(true);
  const [showReceived, setShowReceived] = useState(true);

  const loading = !quotesReady || !invoicesReady;

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [isUserLoading, user, router]);

  useEffect(() => {
    if (!user || !firestore) return;

    const quotesQuery = query(collection(firestore, 'quotes'), where('userId', '==', user.uid));
    const invoicesQuery = query(collection(firestore, 'invoices'), where('userId', '==', user.uid));

    const unsubQuotes = onSnapshot(
      quotesQuery,
      (snap) => {
        setQuotes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProfitQuoteInput, 'id'>) })));
        setQuotesReady(true);
      },
      () => setQuotesReady(true)
    );

    const unsubInvoices = onSnapshot(
      invoicesQuery,
      (snap) => {
        setInvoices(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProfitInvoiceInput, 'id'>) })));
        setInvoicesReady(true);
      },
      () => setInvoicesReady(true)
    );

    return () => {
      unsubQuotes();
      unsubInvoices();
    };
  }, [firestore, user]);

  useEffect(() => {
    if (!firestore) return;

    const activeInvoices = invoices.filter((inv) => !inv.archived);
    if (activeInvoices.length === 0) {
      setPayments([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const nestedPayments = await Promise.all(
          activeInvoices.map(async (invoice) => {
            const snap = await getDocs(collection(firestore, 'invoices', invoice.id, 'payments'));
            return snap.docs.map((d) => {
              const raw = d.data() as { amount?: number; date?: Timestamp | Date | { seconds: number } };
              const paymentDate = parseDate(raw?.date);
              return {
                invoiceId: invoice.id,
                amount: Number(raw?.amount || 0),
                date: paymentDate || new Date(0),
              } satisfies ProfitPaymentInput;
            });
          })
        );
        if (!cancelled) setPayments(nestedPayments.flat());
      } catch (error) {
        console.error('Kon betalingen niet ophalen voor winstpagina:', error);
        if (!cancelled) setPayments([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [firestore, invoices]);

  const metrics = useMemo(
    () =>
      calculateProfitMetrics({
        quotes,
        invoices,
        payments,
        period,
      }),
    [quotes, invoices, payments, period]
  );

  const monthChartData = useMemo(
    () =>
      metrics.monthSeries.map((row, index, array) => {
        const previous = index > 0 ? array[index - 1] : null;
        return {
          ...row,
          forecastDelta: previous ? row.forecastProfit - previous.forecastProfit : 0,
          receivedDelta: previous ? row.received - previous.received : 0,
        };
      }),
    [metrics.monthSeries]
  );

  const nowLabel = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const handleExportCsv = () => {
    try {
      setExportingCsv(true);
      const csv = buildProfitCsv({
        periodLabel: metrics.periodLabel,
        generatedAt: new Date(),
        kpis: metrics.kpis,
        monthSeries: metrics.monthSeries,
        daySeries: metrics.daySeries,
        topOffers: metrics.topOffers,
        topOpenInvoices: metrics.topOpenInvoices,
        statusDistribution: metrics.statusDistribution,
      });
      downloadCsv(`winst-rapport-${nowLabel}.csv`, csv);
      toast({ title: 'Export klaar', description: 'CSV rapport is gedownload.' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Export mislukt', description: 'CSV kon niet worden gemaakt.', variant: 'destructive' });
    } finally {
      setExportingCsv(false);
    }
  };

  const handleExportPdf = async () => {
    try {
      setExportingPdf(true);
      await exportProfitPdf(`winst-rapport-${nowLabel}.pdf`, {
        periodLabel: metrics.periodLabel,
        generatedAt: new Date(),
        kpis: metrics.kpis,
        monthSeries: metrics.monthSeries,
        daySeries: metrics.daySeries,
        topOffers: metrics.topOffers,
        topOpenInvoices: metrics.topOpenInvoices,
        statusDistribution: metrics.statusDistribution,
      });
      toast({ title: 'Export klaar', description: 'PDF rapport is gedownload.' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Export mislukt', description: 'PDF kon niet worden gemaakt.', variant: 'destructive' });
    } finally {
      setExportingPdf(false);
    }
  };

  if (isUserLoading || !user || loading) return <PageSkeleton />;

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Winst" />

      <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
        <div className="w-full max-w-7xl space-y-6">
          <Card className="border-amber-500/20">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-amber-300">
                    <TrendingUp className="h-5 w-5" />
                    Winstoverzicht
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{metrics.periodLabel}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Tabs value={period} onValueChange={(value) => setPeriod(value as ProfitPeriod)}>
                    <TabsList>
                      <TabsTrigger value="1m">1 maand</TabsTrigger>
                      <TabsTrigger value="3m">3 maanden</TabsTrigger>
                      <TabsTrigger value="6m">6 maanden</TabsTrigger>
                      <TabsTrigger value="12m">1 jaar</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Button type="button" variant="outline" onClick={handleExportCsv} disabled={exportingCsv}>
                    <Download className="mr-2 h-4 w-4" />
                    {exportingCsv ? 'CSV...' : 'Exporteer CSV'}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleExportPdf} disabled={exportingPdf}>
                    <Download className="mr-2 h-4 w-4" />
                    {exportingPdf ? 'PDF...' : 'Exporteer PDF'}
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Geprognotiseerde winst</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-amber-700 dark:text-amber-300">{formatCurrency(metrics.kpis.forecastProfit)}</div>
              </CardContent>
            </Card>
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Ontvangen betalingen</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-emerald-700 dark:text-emerald-300">{formatCurrency(metrics.kpis.receivedPayments)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Openstaand bedrag</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{formatCurrency(metrics.kpis.openAmount)}</div>
              </CardContent>
            </Card>
            <Card className="border-red-500/20 bg-red-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Te laat risico</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-red-700 dark:text-red-300">{formatCurrency(metrics.kpis.overdueAmount)}</div>
                <p className="text-xs text-muted-foreground mt-1">{metrics.kpis.overdueCount} facturen</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Cash-in ratio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{formatPercent(metrics.kpis.cashInRatio * 100)}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-base">Forecast vs Ontvangen (trading-style)</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn('border-amber-500/30 text-amber-700 dark:text-amber-200', !showForecast && 'opacity-60')}
                    onClick={() => setShowForecast((previous) => !previous)}
                  >
                    Forecast
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn('border-emerald-500/30 text-emerald-700 dark:text-emerald-200', !showReceived && 'opacity-60')}
                    onClick={() => setShowReceived((previous) => !previous)}
                  >
                    Ontvangen
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthChartData} margin={{ top: 16, right: 12, left: 4, bottom: 8 }}>
                  <defs>
                    <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="receivedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="maand" tick={{ fill: '#a1a1aa', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={(value) => `€ ${Math.round(Number(value || 0)).toLocaleString('nl-NL')}`}
                    tick={{ fill: '#a1a1aa', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip
                    cursor={{ stroke: '#d4d4d8', strokeWidth: 1, strokeDasharray: '3 3' }}
                    contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 10 }}
                    labelStyle={{ color: '#d4d4d8' }}
                    formatter={(value: number, name: string, entry: { payload?: { forecastDelta?: number; receivedDelta?: number } }) => {
                      const numericValue = Number(value || 0);
                      if (name === 'forecastProfit') {
                        return [`${formatCurrency(numericValue)} (${formatCurrency(entry.payload?.forecastDelta || 0)})`, 'Forecast winst'];
                      }
                      return [`${formatCurrency(numericValue)} (${formatCurrency(entry.payload?.receivedDelta || 0)})`, 'Ontvangen betalingen'];
                    }}
                  />
                  <Legend formatter={(value) => (value === 'forecastProfit' ? 'Forecast winst' : 'Ontvangen betalingen')} />
                  {showForecast && <Area type="monotone" dataKey="forecastProfit" stroke="none" fill="url(#forecastGradient)" />}
                  {showReceived && <Area type="monotone" dataKey="received" stroke="none" fill="url(#receivedGradient)" />}
                  {showForecast && (
                    <Line
                      type="monotone"
                      dataKey="forecastProfit"
                      stroke="#f59e0b"
                      strokeWidth={2.2}
                      dot={{ r: 2, fill: '#f59e0b' }}
                      activeDot={{ r: 5, strokeWidth: 2 }}
                    />
                  )}
                  {showReceived && (
                    <Line
                      type="monotone"
                      dataKey="received"
                      stroke="#10b981"
                      strokeWidth={2.2}
                      dot={{ r: 2, fill: '#10b981' }}
                      activeDot={{ r: 5, strokeWidth: 2 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Inkomende betalingen (30 dagen)</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.daySeries} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="dag" tick={{ fill: '#a1a1aa', fontSize: 11 }} interval={4} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <RechartsTooltip
                      cursor={{ stroke: '#d4d4d8', strokeWidth: 1, strokeDasharray: '3 3' }}
                      formatter={(value: number) => [formatCurrency(Number(value || 0)), 'Ontvangen']}
                      contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 10 }}
                    />
                    <Line type="monotone" dataKey="received" stroke="#10b981" strokeWidth={2.1} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Statusverdeling facturen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span>Concept</span><span>{metrics.statusDistribution.concept}</span></div>
                <div className="flex items-center justify-between"><span>Openstaand</span><span>{metrics.statusDistribution.openstaand}</span></div>
                <div className="flex items-center justify-between"><span>Gedeeltelijk betaald</span><span>{metrics.statusDistribution.gedeeltelijkBetaald}</span></div>
                <div className="flex items-center justify-between"><span>Betaald</span><span>{metrics.statusDistribution.betaald}</span></div>
                <div className="pt-2 mt-2 border-t border-border flex items-center justify-between font-semibold text-red-700 dark:text-red-300">
                  <span>Te laat</span><span>{metrics.statusDistribution.teLaat}</span>
                </div>
                <div className="pt-2 mt-2 border-t border-border grid grid-cols-1 gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between"><span>Gem. winst / geaccepteerde offerte</span><span>{formatCurrency(metrics.kpis.averageForecastPerAcceptedQuote)}</span></div>
                  <div className="flex items-center justify-between"><span>Gem. factuurwaarde</span><span>{formatCurrency(metrics.kpis.averageInvoiceValue)}</span></div>
                  <div className="flex items-center justify-between"><span>Top 5 winstconcentratie</span><span>{formatPercent(metrics.kpis.top5ProfitConcentrationPct)}</span></div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-amber-700 dark:text-amber-300">Top 5 winstgevende offertes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {metrics.topOffers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nog geen geaccepteerde offertes in deze periode.</p>
                ) : (
                  metrics.topOffers.map((item, index) => (
                    <div key={item.id} className="flex items-center justify-between rounded-md border border-border/60 p-2">
                      <span className="text-sm truncate pr-3">{index + 1}. {item.label}</span>
                      <span className="text-sm font-semibold text-amber-700 dark:text-amber-200">{formatCurrency(item.value)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-emerald-700 dark:text-emerald-300">Top 5 hoogste openstaand</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {metrics.topOpenInvoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Geen openstaande facturen.</p>
                ) : (
                  metrics.topOpenInvoices.map((item, index) => (
                    <div key={item.id} className="flex items-center justify-between rounded-md border border-border/60 p-2">
                      <span className="text-sm truncate pr-3">{index + 1}. {item.label}</span>
                      <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">{formatCurrency(item.value)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
