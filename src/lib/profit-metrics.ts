import { Timestamp } from 'firebase/firestore';

export type ProfitPeriod = '1m' | '3m' | '6m' | '12m';

export interface ProfitQuoteInput {
  id: string;
  status?: string;
  createdAt?: Timestamp | Date | { seconds: number };
  archived?: boolean;
  offerteNummer?: number;
  klantinformatie?: {
    bedrijfsnaam?: string | null;
    voornaam?: string;
    achternaam?: string;
  };
  totals?: {
    winstMarge?: number;
  };
}

export interface ProfitInvoiceInput {
  id: string;
  status?: string;
  createdAt?: Timestamp | Date | { seconds: number };
  dueDate?: Timestamp | Date | { seconds: number };
  archived?: boolean;
  invoiceNumberLabel?: string;
  sourceQuote?: {
    klantSnapshot?: {
      naam?: string;
    };
  };
  totalsSnapshot?: {
    totaalInclBtw?: number;
  };
  paymentSummary?: {
    openAmount?: number;
  };
}

export interface ProfitPaymentInput {
  invoiceId: string;
  amount: number;
  date: Timestamp | Date | { seconds: number };
}

export interface ProfitMonthPoint {
  key: string;
  maand: string;
  forecastProfit: number;
  received: number;
  open: number;
  overdue: number;
}

export interface ProfitDayPoint {
  key: string;
  dag: string;
  received: number;
}

export interface ProfitTopItem {
  id: string;
  label: string;
  value: number;
}

export interface ProfitStatusDistribution {
  concept: number;
  openstaand: number;
  gedeeltelijkBetaald: number;
  betaald: number;
  teLaat: number;
}

export interface ProfitKpis {
  forecastProfit: number;
  receivedPayments: number;
  openAmount: number;
  overdueAmount: number;
  overdueCount: number;
  cashInRatio: number;
  averageForecastPerAcceptedQuote: number;
  averageInvoiceValue: number;
  top5ProfitConcentrationPct: number;
}

export interface ProfitMetricsResult {
  period: ProfitPeriod;
  periodLabel: string;
  monthSeries: ProfitMonthPoint[];
  daySeries: ProfitDayPoint[];
  topOffers: ProfitTopItem[];
  topOpenInvoices: ProfitTopItem[];
  statusDistribution: ProfitStatusDistribution;
  kpis: ProfitKpis;
}

const PERIOD_TO_MONTHS: Record<ProfitPeriod, number> = {
  '1m': 1,
  '3m': 3,
  '6m': 6,
  '12m': 12,
};

export function periodToLabel(period: ProfitPeriod): string {
  if (period === '1m') return 'Laatste 1 maand';
  if (period === '3m') return 'Laatste 3 maanden';
  if (period === '6m') return 'Laatste 6 maanden';
  return 'Laatste 12 maanden';
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

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function safeNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getQuoteLabel(q: ProfitQuoteInput): string {
  const nummer = q.offerteNummer ? `#${q.offerteNummer}` : q.id.slice(0, 8);
  const name = q.klantinformatie?.bedrijfsnaam || [q.klantinformatie?.voornaam, q.klantinformatie?.achternaam].filter(Boolean).join(' ');
  return name ? `${name} (${nummer})` : `Offerte ${nummer}`;
}

function getInvoiceLabel(inv: ProfitInvoiceInput): string {
  const nummer = inv.invoiceNumberLabel || inv.id.slice(0, 8);
  const name = inv.sourceQuote?.klantSnapshot?.naam;
  return name ? `${name} (${nummer})` : `Factuur ${nummer}`;
}

function buildMonthBuckets(period: ProfitPeriod, now: Date): Array<{ key: string; maand: string; start: Date; end: Date }> {
  const months = PERIOD_TO_MONTHS[period];
  const firstMonth = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const formatter = new Intl.DateTimeFormat('nl-NL', { month: 'short' });

  return Array.from({ length: months }).map((_, index) => {
    const start = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + index, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
    return {
      key: monthKey(start),
      maand: formatter.format(start),
      start,
      end,
    };
  });
}

function buildDayBuckets(days: number, now: Date): Array<{ key: string; dag: string; start: Date; end: Date }> {
  const formatter = new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: '2-digit' });
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));

  return Array.from({ length: days }).map((_, index) => {
    const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index, 0, 0, 0, 0);
    const dayEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index, 23, 59, 59, 999);
    return {
      key: dayKey(dayStart),
      dag: formatter.format(dayStart),
      start: dayStart,
      end: dayEnd,
    };
  });
}

export function calculateProfitMetrics(params: {
  quotes: ProfitQuoteInput[];
  invoices: ProfitInvoiceInput[];
  payments: ProfitPaymentInput[];
  period: ProfitPeriod;
  now?: Date;
}): ProfitMetricsResult {
  const now = params.now || new Date();
  const monthBuckets = buildMonthBuckets(params.period, now);
  const monthKeys = new Set(monthBuckets.map((bucket) => bucket.key));
  const dayBuckets = buildDayBuckets(30, now);
  const dayKeys = new Set(dayBuckets.map((bucket) => bucket.key));

  const activeQuotes = params.quotes.filter((q) => !q.archived);
  const activeInvoices = params.invoices.filter((inv) => !inv.archived);
  const activeInvoiceIds = new Set(activeInvoices.map((inv) => inv.id));

  const monthMap = new Map<string, ProfitMonthPoint>();
  monthBuckets.forEach((bucket) => {
    monthMap.set(bucket.key, {
      key: bucket.key,
      maand: bucket.maand,
      forecastProfit: 0,
      received: 0,
      open: 0,
      overdue: 0,
    });
  });

  const dayMap = new Map<string, ProfitDayPoint>();
  dayBuckets.forEach((bucket) => {
    dayMap.set(bucket.key, {
      key: bucket.key,
      dag: bucket.dag,
      received: 0,
    });
  });

  const acceptedQuotes = activeQuotes.filter((q) => q.status === 'geaccepteerd');
  acceptedQuotes.forEach((quote) => {
    const created = parseDate(quote.createdAt);
    if (!created) return;
    const key = monthKey(created);
    if (!monthKeys.has(key)) return;
    const current = monthMap.get(key);
    if (!current) return;
    current.forecastProfit += safeNumber(quote.totals?.winstMarge);
  });

  activeInvoices.forEach((invoice) => {
    const created = parseDate(invoice.createdAt);
    const dueDate = parseDate(invoice.dueDate);
    const openAmount = safeNumber(invoice.paymentSummary?.openAmount);

    if (created) {
      const key = monthKey(created);
      if (monthKeys.has(key)) {
        const current = monthMap.get(key);
        if (current) current.open += openAmount;
      }
    }

    if (dueDate && dueDate.getTime() < now.getTime() && openAmount > 0) {
      const dueKey = monthKey(dueDate);
      if (monthKeys.has(dueKey)) {
        const current = monthMap.get(dueKey);
        if (current) current.overdue += openAmount;
      }
    }
  });

  params.payments.forEach((payment) => {
    if (!activeInvoiceIds.has(payment.invoiceId)) return;
    const date = parseDate(payment.date);
    if (!date) return;
    const amount = safeNumber(payment.amount);

    const mKey = monthKey(date);
    if (monthKeys.has(mKey)) {
      const point = monthMap.get(mKey);
      if (point) point.received += amount;
    }

    const dKey = dayKey(date);
    if (dayKeys.has(dKey)) {
      const point = dayMap.get(dKey);
      if (point) point.received += amount;
    }
  });

  const topOffers = acceptedQuotes
    .map((q) => ({
      id: q.id,
      label: getQuoteLabel(q),
      value: safeNumber(q.totals?.winstMarge),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const topOpenInvoices = activeInvoices
    .map((inv) => ({
      id: inv.id,
      label: getInvoiceLabel(inv),
      value: safeNumber(inv.paymentSummary?.openAmount),
    }))
    .filter((inv) => inv.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const forecastProfit = monthBuckets.reduce((acc, bucket) => acc + (monthMap.get(bucket.key)?.forecastProfit || 0), 0);
  const receivedPayments = monthBuckets.reduce((acc, bucket) => acc + (monthMap.get(bucket.key)?.received || 0), 0);
  const openAmount = activeInvoices.reduce((acc, inv) => acc + safeNumber(inv.paymentSummary?.openAmount), 0);
  const overdueInvoices = activeInvoices.filter((inv) => {
    const dueDate = parseDate(inv.dueDate);
    const open = safeNumber(inv.paymentSummary?.openAmount);
    return !!dueDate && dueDate.getTime() < now.getTime() && open > 0;
  });
  const overdueAmount = overdueInvoices.reduce((acc, inv) => acc + safeNumber(inv.paymentSummary?.openAmount), 0);
  const overdueCount = overdueInvoices.length;
  const invoicedTotalInPeriod = activeInvoices
    .filter((inv) => {
      const created = parseDate(inv.createdAt);
      if (!created) return false;
      return monthKeys.has(monthKey(created));
    })
    .reduce((acc, inv) => acc + safeNumber(inv.totalsSnapshot?.totaalInclBtw), 0);

  const cashInRatio = invoicedTotalInPeriod > 0 ? receivedPayments / invoicedTotalInPeriod : 0;
  const averageForecastPerAcceptedQuote = acceptedQuotes.length > 0 ? forecastProfit / acceptedQuotes.length : 0;
  const averageInvoiceValue = activeInvoices.length > 0
    ? activeInvoices.reduce((acc, inv) => acc + safeNumber(inv.totalsSnapshot?.totaalInclBtw), 0) / activeInvoices.length
    : 0;
  const top5Forecast = topOffers.reduce((acc, item) => acc + item.value, 0);
  const top5ProfitConcentrationPct = forecastProfit > 0 ? (top5Forecast / forecastProfit) * 100 : 0;

  const statusDistribution: ProfitStatusDistribution = {
    concept: activeInvoices.filter((inv) => inv.status === 'concept').length,
    openstaand: activeInvoices.filter((inv) => safeNumber(inv.paymentSummary?.openAmount) > 0).length,
    gedeeltelijkBetaald: activeInvoices.filter((inv) => inv.status === 'gedeeltelijk_betaald').length,
    betaald: activeInvoices.filter((inv) => inv.status === 'betaald').length,
    teLaat: overdueCount,
  };

  return {
    period: params.period,
    periodLabel: periodToLabel(params.period),
    monthSeries: monthBuckets.map((bucket) => monthMap.get(bucket.key)!),
    daySeries: dayBuckets.map((bucket) => dayMap.get(bucket.key)!),
    topOffers,
    topOpenInvoices,
    statusDistribution,
    kpis: {
      forecastProfit,
      receivedPayments,
      openAmount,
      overdueAmount,
      overdueCount,
      cashInRatio,
      averageForecastPerAcceptedQuote,
      averageInvoiceValue,
      top5ProfitConcentrationPct,
    },
  };
}
