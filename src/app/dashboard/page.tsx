/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import {
  CalendarDays,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { AppNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore, useUser } from '@/firebase';
import { getEffectiveQuoteStatus, invoiceImpliesAccepted } from '@/lib/quote-status';
import { parsePriceToNumber } from '@/lib/utils';

type QuoteStatus =
  | 'concept'
  | 'in_behandeling'
  | 'verzonden'
  | 'geaccepteerd'
  | 'afgewezen'
  | 'verlopen';

type InvoiceStatus =
  | 'concept'
  | 'verzonden'
  | 'gedeeltelijk_betaald'
  | 'betaald'
  | 'geannuleerd';

interface DashboardQuote {
  id: string;
  status?: QuoteStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  archived?: boolean;
  totals?: {
    winstMarge?: number;
  };
}

interface DashboardInvoice {
  id: string;
  quoteId?: string;
  status?: InvoiceStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  paidAt?: Timestamp;
  dueDate?: Timestamp;
  archived?: boolean;
  paymentSummary?: {
    paidAmount?: number;
    openAmount?: number;
    lastPaymentAt?: Timestamp;
  };
}

interface PlanningEntry {
  id: string;
  quoteId?: string;
  startDate?: Timestamp;
  endDate?: Timestamp;
  cache?: {
    clientName?: string;
    projectTitle?: string;
  };
}

interface PaymentPoint {
  invoiceId: string;
  amount: number;
  date: Date;
}

const WEBSITE_PROMO_DISMISS_KEY = 'website_promo_dismissed_until';
const WEBSITE_PROMO_HIDE_MS = 30 * 24 * 60 * 60 * 1000;

function parseDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  return null;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function lastMonths(count: number): Array<{ key: string; label: string }> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (count - 1), 1);
  const formatMonth = new Intl.DateTimeFormat('nl-NL', { month: 'short' });

  return Array.from({ length: count }).map((_, idx) => {
    const d = new Date(start.getFullYear(), start.getMonth() + idx, 1);
    return { key: monthKey(d), label: formatMonth.format(d) };
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount || 0);
}

function formatTime(value: Date | null): string {
  if (!value) return '—';
  return value.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

function safeAmount(value: unknown): number {
  const parsed = parsePriceToNumber(value);
  return parsed == null || !Number.isFinite(parsed) ? 0 : parsed;
}

function DashboardSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader user={null} />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="flex items-center gap-3 rounded-3xl border bg-card/50 p-8 text-muted-foreground shadow-sm backdrop-blur-xl">
          <Loader2 className="h-6 w-6 animate-spin" />
          Laden...
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [quotes, setQuotes] = useState<DashboardQuote[]>([]);
  const [invoices, setInvoices] = useState<DashboardInvoice[]>([]);
  const [planningEntries, setPlanningEntries] = useState<PlanningEntry[]>([]);
  const [payments, setPayments] = useState<PaymentPoint[]>([]);

  const [quotesReady, setQuotesReady] = useState(false);
  const [invoicesReady, setInvoicesReady] = useState(false);
  const [planningReady, setPlanningReady] = useState(false);
  const [showWebsitePromo, setShowWebsitePromo] = useState(false);

  const loading = !quotesReady || !invoicesReady || !planningReady;

  const greeting = useMemo(() => {
    let name =
      (user as any)?.displayName ||
      (user as any)?.name ||
      (user as any)?.email?.split('@')?.[0] ||
      '';
    if (name) name = name.charAt(0).toUpperCase() + name.slice(1);
    return name ? `Welkom, ${name}` : 'Welkom';
  }, [user]);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

  useEffect(() => {
    const raw = window.localStorage.getItem(WEBSITE_PROMO_DISMISS_KEY);
    const until = raw ? Number(raw) : 0;
    if (Number.isFinite(until) && until > Date.now()) {
      setShowWebsitePromo(false);
      return;
    }
    setShowWebsitePromo(true);
  }, []);

  useEffect(() => {
    if (!user || !firestore) return;

    const quotesQuery = query(collection(firestore, 'quotes'), where('userId', '==', user.uid));
    const invoicesQuery = query(collection(firestore, 'invoices'), where('userId', '==', user.uid));
    const planningQuery = query(
      collection(firestore, 'planning_entries'),
      where('userId', '==', user.uid)
    );

    const unsubQuotes = onSnapshot(
      quotesQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as DashboardQuote[];
        setQuotes(list);
        setQuotesReady(true);
      },
      () => setQuotesReady(true)
    );

    const unsubInvoices = onSnapshot(
      invoicesQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as DashboardInvoice[];
        setInvoices(list);
        setInvoicesReady(true);
      },
      () => setInvoicesReady(true)
    );

    const unsubPlanning = onSnapshot(
      planningQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PlanningEntry[];
        setPlanningEntries(list);
        setPlanningReady(true);
      },
      () => setPlanningReady(true)
    );

    return () => {
      unsubQuotes();
      unsubInvoices();
      unsubPlanning();
    };
  }, [user, firestore]);

  useEffect(() => {
    if (!firestore) return;
    const nonArchivedInvoices = invoices.filter((inv) => !inv.archived);
    if (nonArchivedInvoices.length === 0) {
      setPayments([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const nested = await Promise.all(
          nonArchivedInvoices.map(async (inv) => {
            const snap = await getDocs(collection(firestore, 'invoices', inv.id, 'payments'));
            return snap.docs.map((d) => {
              const raw = d.data() as any;
              return {
                invoiceId: inv.id,
                amount: safeAmount(raw?.amount),
                date: parseDate(raw?.date) || new Date(0),
              } as PaymentPoint;
            });
          })
        );

        if (!cancelled) {
          setPayments(nested.flat());
        }
      } catch (e) {
        console.error('Fout bij ophalen betalingen voor dashboard:', e);
        if (!cancelled) setPayments([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [firestore, invoices]);

  const monthBuckets = useMemo(() => lastMonths(6), []);
  const monthKeySet = useMemo(() => new Set(monthBuckets.map((m) => m.key)), [monthBuckets]);

  const activeQuotes = useMemo(() => quotes.filter((q) => !q.archived), [quotes]);
  const archivedQuotes = useMemo(() => quotes.filter((q) => !!q.archived), [quotes]);
  const activeInvoices = useMemo(() => invoices.filter((i) => !i.archived), [invoices]);
  const acceptedQuoteIdsFromInvoices = useMemo(() => {
    const set = new Set<string>();
    activeInvoices.forEach((inv) => {
      if (!invoiceImpliesAccepted(inv.status)) return;
      if (inv.quoteId) set.add(inv.quoteId);
    });
    return set;
  }, [activeInvoices]);

  const projectStats = useMemo(() => {
    const counts: Record<QuoteStatus, number> = {
      concept: 0,
      in_behandeling: 0,
      verzonden: 0,
      geaccepteerd: 0,
      afgewezen: 0,
      verlopen: 0,
    };

    activeQuotes.forEach((q) => {
      const effectiveStatus = getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id)) as QuoteStatus;
      counts[effectiveStatus] += 1;
    });

    return {
      concept: counts.concept,
      inBehandeling: counts.in_behandeling,
      verzonden: counts.verzonden,
      geaccepteerd: counts.geaccepteerd,
      afgewezen: counts.afgewezen,
      verlopen: counts.verlopen,
      totaal: activeQuotes.length,
      archief: archivedQuotes.length,
    };
  }, [activeQuotes, archivedQuotes.length, acceptedQuoteIdsFromInvoices]);

  const invoiceStats = useMemo(() => {
    const now = new Date();
    const concept = activeInvoices.filter((inv) => inv.status === 'concept').length;
    const openstaand = activeInvoices.filter((inv) => (inv.paymentSummary?.openAmount ?? 0) > 0).length;
    const gedeeltelijk = activeInvoices.filter((inv) => inv.status === 'gedeeltelijk_betaald').length;
    const betaald = activeInvoices.filter((inv) => inv.status === 'betaald').length;
    const teLaat = activeInvoices.filter((inv) => {
      const due = parseDate(inv.dueDate);
      const open = inv.paymentSummary?.openAmount ?? 0;
      return !!due && due.getTime() < now.getTime() && open > 0;
    }).length;

    return { concept, openstaand, gedeeltelijk, betaald, teLaat };
  }, [activeInvoices]);

  const planningTodayTomorrow = useMemo(() => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const normalized = planningEntries
      .map((entry) => {
        const start = parseDate(entry.startDate);
        const end = parseDate(entry.endDate);
        return {
          ...entry,
          start,
          end,
          title:
            entry.cache?.projectTitle ||
            entry.cache?.clientName ||
            'Onbekend project',
        };
      })
      .filter((entry) => !!entry.start)
      .sort((a, b) => (a.start!.getTime() - b.start!.getTime()));

    const today = normalized.filter((entry) => isSameDay(entry.start!, now)).slice(0, 5);
    const tomorrowItems = normalized
      .filter((entry) => isSameDay(entry.start!, tomorrow))
      .slice(0, 5);

    return { today, tomorrow: tomorrowItems };
  }, [planningEntries]);

  const acceptedPerMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of monthBuckets) map.set(m.key, 0);

    activeQuotes.forEach((q) => {
      const effectiveStatus = getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id));
      if (effectiveStatus !== 'geaccepteerd') return;
      const d = parseDate(q.createdAt);
      if (!d) return;
      const key = monthKey(d);
      if (monthKeySet.has(key)) {
        map.set(key, (map.get(key) || 0) + 1);
      }
    });

    return monthBuckets.map((m) => ({
      maand: m.label,
      value: map.get(m.key) || 0,
    }));
  }, [activeQuotes, monthBuckets, monthKeySet, acceptedQuoteIdsFromInvoices]);

  const offerProfitPerMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of monthBuckets) map.set(m.key, 0);

    activeQuotes.forEach((q) => {
      const effectiveStatus = getEffectiveQuoteStatus(q.status, acceptedQuoteIdsFromInvoices.has(q.id));
      if (effectiveStatus !== 'geaccepteerd') return;
      const d = parseDate(q.createdAt);
      if (!d) return;
      const key = monthKey(d);
      if (!monthKeySet.has(key)) return;
      const winst = Number(q?.totals?.winstMarge || 0);
      map.set(key, (map.get(key) || 0) + (Number.isFinite(winst) ? winst : 0));
    });

    return monthBuckets.map((m) => ({
      maand: m.label,
      value: map.get(m.key) || 0,
    }));
  }, [activeQuotes, monthBuckets, monthKeySet, acceptedQuoteIdsFromInvoices]);

  const invoicePaymentsPerMonth = useMemo(() => {
    const invoiceIds = new Set(activeInvoices.map((i) => i.id));
    const recordedPaidByInvoice = new Map<string, number>();
    const map = new Map<string, number>();
    for (const m of monthBuckets) map.set(m.key, 0);

    payments.forEach((p) => {
      if (!invoiceIds.has(p.invoiceId)) return;
      const amount = safeAmount(p.amount);
      if (amount <= 0) return;
      recordedPaidByInvoice.set(p.invoiceId, (recordedPaidByInvoice.get(p.invoiceId) || 0) + amount);
    });

    const syntheticPayments: PaymentPoint[] = activeInvoices.flatMap((inv) => {
      const expectedPaid = safeAmount(inv.paymentSummary?.paidAmount);
      if (expectedPaid <= 0) return [];

      const recordedPaid = recordedPaidByInvoice.get(inv.id) || 0;
      const missing = expectedPaid - recordedPaid;
      if (missing <= 0.0001) return [];

      const fallbackDate =
        parseDate(inv.paidAt) ||
        parseDate(inv.paymentSummary?.lastPaymentAt) ||
        parseDate(inv.updatedAt) ||
        parseDate(inv.createdAt) ||
        new Date();

      return [{
        invoiceId: inv.id,
        amount: missing,
        date: fallbackDate,
      }];
    });

    const effectivePayments = [...payments, ...syntheticPayments];
    effectivePayments.forEach((p) => {
      if (!invoiceIds.has(p.invoiceId)) return;
      const amount = safeAmount(p.amount);
      if (amount <= 0) return;
      const key = monthKey(p.date);
      if (!monthKeySet.has(key)) return;
      map.set(key, (map.get(key) || 0) + amount);
    });

    return monthBuckets.map((m) => ({
      maand: m.label,
      value: map.get(m.key) || 0,
    }));
  }, [activeInvoices, monthBuckets, monthKeySet, payments]);

  if (isUserLoading || !user || loading) return <DashboardSkeleton />;

  const dismissWebsitePromo = () => {
    const hideUntil = Date.now() + WEBSITE_PROMO_HIDE_MS;
    window.localStorage.setItem(WEBSITE_PROMO_DISMISS_KEY, String(hideUntil));
    setShowWebsitePromo(false);
  };

  return (
    <div className="app-shell min-h-screen bg-background">
      <AppNavigation />
      <DashboardHeader user={user} title="Dashboard" />

      <main className="flex flex-col items-center p-4 pb-10 md:px-6 md:pt-6">
        <div className="w-full max-w-7xl space-y-6">
          <div className="px-1">
            <div className="text-3xl font-light tracking-tight">{greeting}</div>
          </div>

          {showWebsitePromo && (
            <Card className="relative border-cyan-500/30 bg-cyan-500/5">
              <button
                type="button"
                aria-label="Premium kaart sluiten"
                onClick={dismissWebsitePromo}
                className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-cyan-500/10 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              <CardHeader className="pb-2 pr-12">
                <CardTitle className="flex items-center gap-2 text-base text-cyan-200">
                  <Sparkles className="h-4 w-4 text-cyan-300" />
                  Zet je bedrijf online op premium niveau
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-cyan-50/90">
                  Een strakke, snelle website die vertrouwen uitstraalt en aanvragen oplevert. Volledig
                  afgestemd op jouw diensten. Vanaf €200.
                </p>
                <p className="text-xs text-cyan-100/80">
                  Vrijblijvende intake, daarna pas een voorstel.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="success"
                    onClick={() => router.push('/website-laten-maken?mode=plan')}
                  >
                    Plan strategiegesprek
                  </Button>
                  <Button variant="ghost" size="sm" onClick={dismissWebsitePromo}>
                    Later bekijken
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Planning</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Vandaag</div>
                  {planningTodayTomorrow.today.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Geen planning voor vandaag</div>
                  ) : (
                    <div className="space-y-2">
                      {planningTodayTomorrow.today.map((entry) => (
                        <button
                          key={entry.id}
                          className="w-full text-left rounded-md border border-border/60 bg-card/40 p-2 hover:bg-card/60 transition-colors"
                          onClick={() => router.push('/planning')}
                        >
                          <div className="text-sm font-medium truncate">{entry.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatTime(entry.start || null)} - {formatTime(entry.end || null)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Morgen</div>
                  {planningTodayTomorrow.tomorrow.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Geen planning voor morgen</div>
                  ) : (
                    <div className="space-y-2">
                      {planningTodayTomorrow.tomorrow.map((entry) => (
                        <button
                          key={entry.id}
                          className="w-full text-left rounded-md border border-border/60 bg-card/40 p-2 hover:bg-card/60 transition-colors"
                          onClick={() => router.push('/planning')}
                        >
                          <div className="text-sm font-medium truncate">{entry.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatTime(entry.start || null)} - {formatTime(entry.end || null)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-9"
                  onClick={() => router.push('/planning')}
                >
                  <CalendarDays className="h-4 w-4 mr-2" />
                  Open planning
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-cyan-300">Projecten / Offertes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span>Concept</span><span>{projectStats.concept}</span></div>
                <div className="flex items-center justify-between"><span>In behandeling</span><span>{projectStats.inBehandeling}</span></div>
                <div className="flex items-center justify-between"><span>Verzonden</span><span>{projectStats.verzonden}</span></div>
                <div className="flex items-center justify-between"><span>Geaccepteerd</span><span>{projectStats.geaccepteerd}</span></div>
                <div className="flex items-center justify-between"><span>Afgewezen</span><span>{projectStats.afgewezen}</span></div>
                <div className="flex items-center justify-between"><span>Verlopen</span><span>{projectStats.verlopen}</span></div>
                <div className="pt-2 mt-2 border-t border-border flex items-center justify-between font-semibold">
                  <span>Totaal</span><span>{projectStats.totaal}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-emerald-300">Facturen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span>Concept</span><span>{invoiceStats.concept}</span></div>
                <div className="flex items-center justify-between"><span>Openstaand</span><span>{invoiceStats.openstaand}</span></div>
                <div className="flex items-center justify-between"><span>Gedeeltelijk betaald</span><span>{invoiceStats.gedeeltelijk}</span></div>
                <div className="flex items-center justify-between"><span>Betaald</span><span>{invoiceStats.betaald}</span></div>
                <div className="pt-2 mt-2 border-t border-border flex items-center justify-between font-semibold text-amber-300">
                  <span>Te laat</span><span>{invoiceStats.teLaat}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Goedgekeurde offertes per maand</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={acceptedPerMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="maand" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                    <RechartsTooltip
                      formatter={(value: any) => [value, 'Aantal']}
                      contentStyle={{ background: '#18181b', border: '1px solid #27272a' }}
                      labelStyle={{ color: '#d4d4d8' }}
                    />
                    <Bar dataKey="value" fill="#22d3ee" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Mini winstgrafieken (6 maanden)</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm text-cyan-300 font-medium">Offertes - Prognose winst</div>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={offerProfitPerMonth}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="maand" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                        <RechartsTooltip
                          formatter={(value: any) => [formatCurrency(Number(value || 0)), 'Winst']}
                          contentStyle={{ background: '#18181b', border: '1px solid #27272a' }}
                          labelStyle={{ color: '#d4d4d8' }}
                        />
                        <Bar dataKey="value" fill="#22d3ee" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-emerald-300 font-medium">Facturen - Ontvangen betalingen</div>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={invoicePaymentsPerMonth}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="maand" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                        <RechartsTooltip
                          formatter={(value: any) => [formatCurrency(Number(value || 0)), 'Ontvangen']}
                          contentStyle={{ background: '#18181b', border: '1px solid #27272a' }}
                          labelStyle={{ color: '#d4d4d8' }}
                        />
                        <Bar dataKey="value" fill="#10b981" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
