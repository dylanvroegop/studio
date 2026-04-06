import { calculateQuoteTotals, normalizeDataJson, type QuoteSettings as QuoteCalculationSettings } from './quote-calculations';
import { normalizeNacalculatieDoc } from './nacalculatie';
import type {
  NacalculatieDoc,
  WinstCategoryBreakdownRow,
  WinstCostCategoryKey,
  WinstLeakInsight,
  WinstMetricsResponse,
  WinstPeriodType,
  WinstProjectPerformance,
  WinstTopCostItem,
  WinstTrendPoint,
  WinstVarianceStatus,
} from './winst-types';

const CATEGORY_ORDER: WinstCostCategoryKey[] = [
  'materialenGroot',
  'materialenVerbruik',
  'arbeid',
  'transport',
  'materieel',
  'overhead',
];

const CATEGORY_LABELS: Record<WinstCostCategoryKey, string> = {
  materialenGroot: 'Materialen (Groot)',
  materialenVerbruik: 'Verbruiksmaterialen',
  arbeid: 'Arbeid',
  transport: 'Transport',
  materieel: 'Materieel',
  overhead: 'Overhead',
};

export interface WinstMetricsFiltersInput {
  periodType?: WinstPeriodType;
  periodRange?: number;
  jobTypes?: string[];
  clientIds?: string[];
  projectIds?: string[];
}

export interface WinstQuoteSource {
  id: string;
  offerteNummer: number | null;
  title: string;
  clientId: string;
  clientName: string;
  status?: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  quotedRevenueIncl: number;
  jobTypes: string[];
  quotedMaterieelExcl: number;
  quotedOverheadExcl: number;
}

export interface WinstCalculationSource {
  quoteId: string;
  dataJson: unknown;
}

export interface WinstInvoiceSource {
  id: string;
  quoteIds: string[];
  status?: string;
  invoiceType?: string;
  createdAt: Date | null;
  dueDate: Date | null;
  totalIncl: number;
  paidAmount: number;
  openAmount: number;
}

export interface WinstPaymentSource {
  invoiceId: string;
  amount: number;
  date: Date;
}

export interface WinstNacalculatieSource {
  quoteId: string;
  data: unknown | null;
}

export interface WinstProjectCostSource {
  quoteId: string;
  category: 'materiaal' | 'brandstof' | 'gereedschap' | 'overig';
  amountExcl: number;
}

export interface WinstLaborCostSource {
  quoteId: string;
  costExcl: number;
  hours?: number;
}

export interface BuildWinstMetricsInput {
  filters: WinstMetricsFiltersInput;
  quotes: WinstQuoteSource[];
  calculations: WinstCalculationSource[];
  invoices: WinstInvoiceSource[];
  payments: WinstPaymentSource[];
  nacalculaties: WinstNacalculatieSource[];
  projectCosts?: WinstProjectCostSource[];
  laborCosts?: WinstLaborCostSource[];
  userId: string;
  now?: Date;
}

interface QuotedSnapshot {
  materialenGroot: number;
  materialenVerbruik: number;
  arbeid: number;
  transport: number;
  materieel: number;
  overhead: number;
  quotedHours: number;
  quotedDays: number;
  quotedTransportKm: number;
}

interface ActualSnapshot {
  materialenGroot: number;
  materialenVerbruik: number;
  arbeid: number;
  transport: number;
  materieel: number;
  overhead: number;
  actualHours: number;
  actualDays: number;
  actualTransportKm: number;
  transportRevenueExcl: number;
  hasAnyActualData: boolean;
  topCostItems: Array<{
    category: 'groot' | 'verbruik';
    name: string;
    totalExcl: number;
  }>;
}

const DEFAULT_WORKDAY_HOURS = 8;

interface ExternalProjectCostSnapshot {
  materiaal: number;
  brandstof: number;
  gereedschap: number;
  overig: number;
}

function safeNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function clampPeriodRange(value: unknown, periodType: WinstPeriodType): number {
  const numeric = Math.round(safeNumber(value));
  if (numeric <= 0) return periodType === 'month' ? 6 : 8;
  return Math.min(Math.max(numeric, 1), periodType === 'month' ? 24 : 52);
}

function normalizeFilters(filters: WinstMetricsFiltersInput): Required<WinstMetricsFiltersInput> {
  const periodType: WinstPeriodType = filters.periodType === 'week' ? 'week' : 'month';
  return {
    periodType,
    periodRange: clampPeriodRange(filters.periodRange, periodType),
    jobTypes: Array.from(new Set((filters.jobTypes ?? []).map((item) => String(item).trim()).filter(Boolean))),
    clientIds: Array.from(new Set((filters.clientIds ?? []).map((item) => String(item).trim()).filter(Boolean))),
    projectIds: Array.from(new Set((filters.projectIds ?? []).map((item) => String(item).trim()).filter(Boolean))),
  };
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

function endOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function buildRange(now: Date, periodType: WinstPeriodType, periodRange: number): { start: Date; end: Date; label: string } {
  if (periodType === 'week') {
    const days = Math.max(1, periodRange * 7);
    const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)));
    return {
      start,
      end: endOfDay(now),
      label: `Laatste ${periodRange} weken`,
    };
  }

  const start = new Date(now.getFullYear(), now.getMonth() - (periodRange - 1), 1);
  return {
    start: startOfDay(start),
    end: endOfDay(now),
    label: `Laatste ${periodRange} maanden`,
  };
}

function isDateWithinRange(value: Date | null, range: { start: Date; end: Date }): boolean {
  if (!value) return false;
  const timestamp = value.getTime();
  return timestamp >= range.start.getTime() && timestamp <= range.end.getTime();
}

function calcVarianceStatus(quotedExcl: number, actualExcl: number, diffPct: number): WinstVarianceStatus {
  if (actualExcl <= quotedExcl) return 'green';
  if (quotedExcl <= 0 && actualExcl > 0) return 'red';
  if (diffPct > 0.1) return 'red';
  return 'orange';
}

function normalizeWinstBasis(value: unknown): 'totaal' | 'arbeid' | 'materiaal' {
  const normalized = safeString(value).trim().toLowerCase();
  if (normalized === 'arbeid') return 'arbeid';
  if (normalized === 'materiaal' || normalized === 'materialen') return 'materiaal';
  return 'totaal';
}

function mapSettingsForTotals(input: unknown): QuoteCalculationSettings {
  const normalized = normalizeDataJson(input);
  const rawInst = (normalized?.instellingen || {}) as Record<string, unknown>;
  const rawExtras = (normalized?.extras || {}) as Record<string, unknown>;
  const transportExtras = (rawExtras.transport || {}) as Record<string, unknown>;
  const winstExtras = (rawExtras.winstMarge || {}) as Record<string, unknown>;
  const legacyExtras = (rawInst.extras || {}) as Record<string, unknown>;
  const legacyTransport = (legacyExtras.transport || {}) as Record<string, unknown>;
  const legacyWinst = (legacyExtras.winstMarge || {}) as Record<string, unknown>;

  return {
    btwTarief: safeNumber(rawInst.btwTarief) || 21,
    uurTariefExclBtw: safeNumber(rawInst.uurTariefExclBtw) || safeNumber(rawInst.uurTarief) || 50,
    schattingUren: Boolean(rawInst.schattingUren ?? false),
    extras: {
      transport: {
        prijsPerKm: safeNumber(transportExtras.prijsPerKm) || safeNumber(legacyTransport.prijsPerKm) || safeNumber(rawInst.transportPrijsPerKm),
        vasteTransportkosten: safeNumber(transportExtras.vasteTransportkosten) || safeNumber(legacyTransport.vasteTransportkosten),
        tunnelkosten: safeNumber(transportExtras.tunnelkosten) || safeNumber(legacyTransport.tunnelkosten),
        mode: (safeString(transportExtras.mode) || safeString(legacyTransport.mode) || 'perKm') as
          | 'perKm'
          | 'fixed'
          | 'vast'
          | 'none',
      },
      winstMarge: {
        percentage: safeNumber(winstExtras.percentage) || safeNumber(legacyWinst.percentage) || 10,
        fixedAmount: safeNumber(winstExtras.fixedAmount) || safeNumber(legacyWinst.fixedAmount),
        mode: (safeString(winstExtras.mode) || safeString(legacyWinst.mode) || 'percentage') as 'percentage' | 'fixed',
        basis: normalizeWinstBasis(winstExtras.basis || legacyWinst.basis),
      },
    },
  };
}

function sumSparseCosts(entries: unknown): number {
  if (!Array.isArray(entries)) return 0;
  return entries.reduce((sum, row) => {
    if (!row || typeof row !== 'object') return sum;
    return sum + safeNumber((row as { prijs?: unknown }).prijs);
  }, 0);
}

function getQuotedSnapshot(quote: WinstQuoteSource, calculationByQuoteId: Map<string, WinstCalculationSource>): QuotedSnapshot {
  const calculation = calculationByQuoteId.get(quote.id);
  if (!calculation) {
    return {
      materialenGroot: 0,
      materialenVerbruik: 0,
      arbeid: 0,
      transport: 0,
      materieel: quote.quotedMaterieelExcl,
      overhead: quote.quotedOverheadExcl,
      quotedHours: 0,
      quotedDays: 0,
      quotedTransportKm: 0,
    };
  }

  try {
    const settings = mapSettingsForTotals(calculation.dataJson);
    const totals = calculateQuoteTotals(calculation.dataJson, settings);
    const normalized = normalizeDataJson(calculation.dataJson);
    const transportCalc = (normalized.transport_berekening || {}) as Record<string, unknown>;

    const quotedHours = Math.max(0, safeNumber(normalized.totaal_uren));
    return {
      materialenGroot: safeNumber(totals.materialenGroot),
      materialenVerbruik: safeNumber(totals.materialenVerbruik),
      arbeid: safeNumber(totals.arbeidTotaal),
      transport: safeNumber(totals.transportTotaal),
      materieel: quote.quotedMaterieelExcl,
      overhead: quote.quotedOverheadExcl,
      quotedHours,
      quotedDays: hoursToDays(quotedHours),
      quotedTransportKm: safeNumber(transportCalc.roundTripDistanceKm) || safeNumber(transportCalc.distanceKm) || 0,
    };
  } catch {
    return {
      materialenGroot: 0,
      materialenVerbruik: 0,
      arbeid: 0,
      transport: 0,
      materieel: quote.quotedMaterieelExcl,
      overhead: quote.quotedOverheadExcl,
      quotedHours: 0,
      quotedDays: 0,
      quotedTransportKm: 0,
    };
  }
}

function getActualSnapshot(
  quote: WinstQuoteSource,
  userId: string,
  nacalculatieByQuoteId: Map<string, WinstNacalculatieSource>,
  projectCostsByQuoteId: Map<string, ExternalProjectCostSnapshot>,
  laborCostsByQuoteId: Map<string, { costExcl: number; hours: number }>
): { doc: NacalculatieDoc; snapshot: ActualSnapshot } {
  const source = nacalculatieByQuoteId.get(quote.id);
  const normalized = normalizeNacalculatieDoc({
    quoteId: quote.id,
    userId,
    source: source?.data ?? null,
  });

  const externalProjectCosts = projectCostsByQuoteId.get(quote.id);
  const externalLabor = laborCostsByQuoteId.get(quote.id);
  const externalCostsTotal =
    safeNumber(externalProjectCosts?.materiaal)
    + safeNumber(externalProjectCosts?.brandstof)
    + safeNumber(externalProjectCosts?.gereedschap)
    + safeNumber(externalProjectCosts?.overig);
  const externalLaborCost = safeNumber(externalLabor?.costExcl);
  const externalLaborHours = safeNumber(externalLabor?.hours);
  const manualActualDays = Math.max(0, safeNumber(normalized.labor.actualDays));
  const hasExternalCosts = externalCostsTotal > 0 || externalLaborCost > 0 || externalLaborHours > 0;

  if (hasExternalCosts) {
    const mappedMaterial = safeNumber(externalProjectCosts?.materiaal);
    const mappedTransport = safeNumber(externalProjectCosts?.brandstof);
    const mappedTools = safeNumber(externalProjectCosts?.gereedschap);
    const mappedOther = safeNumber(externalProjectCosts?.overig);

    const externalSnapshot: ActualSnapshot = {
      materialenGroot: mappedMaterial,
      materialenVerbruik: 0,
      arbeid: externalLaborCost,
      transport: mappedTransport,
      materieel: mappedTools,
      overhead: mappedOther,
      actualHours: externalLaborHours,
      actualDays: manualActualDays > 0 ? manualActualDays : hoursToDays(externalLaborHours),
      actualTransportKm: 0,
      transportRevenueExcl: 0,
      hasAnyActualData:
        mappedMaterial > 0 ||
        mappedTransport > 0 ||
        mappedTools > 0 ||
        mappedOther > 0 ||
        externalLaborCost > 0 ||
        externalLaborHours > 0 ||
        manualActualDays > 0,
      topCostItems: mappedMaterial > 0
        ? [
          {
            category: 'groot',
            name: 'Inkoopkosten (materiaal)',
            totalExcl: mappedMaterial,
          },
        ]
        : [],
    };

    return {
      doc: normalized,
      snapshot: externalSnapshot,
    };
  }

  const grootTopItems = normalized.materials.groot.entries
    .map((entry) => ({
      category: 'groot' as const,
      name: safeString(entry.name).trim() || 'Onbekend materiaal',
      totalExcl: safeNumber(entry.totalExcl) || safeNumber(entry.qty) * safeNumber(entry.unitCostExcl),
    }))
    .filter((entry) => entry.totalExcl > 0);

  const verbruikTopItems = normalized.materials.verbruik.entries
    .map((entry) => ({
      category: 'verbruik' as const,
      name: safeString(entry.name).trim() || 'Onbekend verbruiksmateriaal',
      totalExcl: safeNumber(entry.totalExcl) || safeNumber(entry.qty) * safeNumber(entry.unitCostExcl),
    }))
    .filter((entry) => entry.totalExcl > 0);

  const actualSnapshot: ActualSnapshot = {
    materialenGroot: safeNumber(normalized.materials.groot.actualCostExcl),
    materialenVerbruik: safeNumber(normalized.materials.verbruik.actualCostExcl),
    arbeid: safeNumber(normalized.labor.actualCostExcl),
    transport: safeNumber(normalized.transport.actualCostExcl),
    materieel: safeNumber(normalized.materieel.actualCostExcl),
    overhead: safeNumber(normalized.overhead.actualCostExcl),
    actualHours: safeNumber(normalized.labor.actualHours),
    actualDays: Math.max(0, safeNumber(normalized.labor.actualDays)),
    actualTransportKm: safeNumber(normalized.transport.actualKm),
    transportRevenueExcl: safeNumber(normalized.transport.actualRevenueExcl),
    hasAnyActualData:
      safeNumber(normalized.labor.actualHours) > 0 ||
      safeNumber(normalized.labor.actualDays) > 0 ||
      safeNumber(normalized.materials.groot.actualCostExcl) > 0 ||
      safeNumber(normalized.materials.verbruik.actualCostExcl) > 0 ||
      safeNumber(normalized.transport.actualCostExcl) > 0 ||
      safeNumber(normalized.materieel.actualCostExcl) > 0 ||
      safeNumber(normalized.overhead.actualCostExcl) > 0,
    topCostItems: [...grootTopItems, ...verbruikTopItems],
  };

  return {
    doc: normalized,
    snapshot: actualSnapshot,
  };
}

function toCategoryRows(
  quoted: QuotedSnapshot,
  actual: ActualSnapshot
): { categories: WinstCategoryBreakdownRow[]; total: WinstCategoryBreakdownRow } {
  const categories = CATEGORY_ORDER.map((key) => {
    const quotedExcl = safeNumber(quoted[key]);
    const actualExcl = safeNumber(actual[key]);
    const diffEuro = actualExcl - quotedExcl;
    const diffPct = quotedExcl > 0 ? diffEuro / quotedExcl : actualExcl > 0 ? 1 : 0;
    return {
      key,
      label: CATEGORY_LABELS[key],
      quotedExcl,
      actualExcl,
      diffEuro,
      diffPct,
      status: calcVarianceStatus(quotedExcl, actualExcl, diffPct),
    };
  });

  const quotedTotal = categories.reduce((sum, category) => sum + category.quotedExcl, 0);
  const actualTotal = categories.reduce((sum, category) => sum + category.actualExcl, 0);
  const diffEuro = actualTotal - quotedTotal;
  const diffPct = quotedTotal > 0 ? diffEuro / quotedTotal : actualTotal > 0 ? 1 : 0;
  const total: WinstCategoryBreakdownRow = {
    key: 'arbeid',
    label: 'Totaal kosten',
    quotedExcl: quotedTotal,
    actualExcl: actualTotal,
    diffEuro,
    diffPct,
    status: calcVarianceStatus(quotedTotal, actualTotal, diffPct),
  };

  return { categories, total };
}

function getIssueLabel(category: WinstCategoryBreakdownRow | undefined, hasActualData: boolean): string {
  if (!hasActualData) return 'Geen nacalculatie';
  if (!category || category.diffEuro <= 0) return 'Binnen budget';
  if (category.key === 'arbeid') return 'Arbeid overschreden';
  if (category.key === 'materialenGroot') return 'Groot materiaal overschreden';
  if (category.key === 'materialenVerbruik') return 'Verbruiksmateriaal overschreden';
  if (category.key === 'transport') return 'Transport onderschat';
  if (category.key === 'materieel') return 'Materieel onderschat';
  return 'Overhead onderschat';
}

function buildTrend(
  projects: WinstProjectPerformance[],
  range: { start: Date; end: Date },
  periodType: WinstPeriodType
): WinstTrendPoint[] {
  const buckets: Array<{ key: string; label: string; start: Date; end: Date }> = [];
  if (periodType === 'week') {
    const count = Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24 * 7)));
    const fmt = new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: '2-digit' });
    for (let index = 0; index <= count; index += 1) {
      const bucketStart = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate() + index * 7);
      const bucketEnd = new Date(bucketStart.getFullYear(), bucketStart.getMonth(), bucketStart.getDate() + 6, 23, 59, 59, 999);
      const label = `${fmt.format(bucketStart)} - ${fmt.format(bucketEnd)}`;
      buckets.push({
        key: `${bucketStart.getFullYear()}-${bucketStart.getMonth() + 1}-${bucketStart.getDate()}`,
        label,
        start: bucketStart,
        end: bucketEnd,
      });
    }
  } else {
    const fmt = new Intl.DateTimeFormat('nl-NL', { month: 'short' });
    const startMonth = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    const endMonth = new Date(range.end.getFullYear(), range.end.getMonth(), 1);
    let cursor = new Date(startMonth);
    while (cursor.getTime() <= endMonth.getTime()) {
      const bucketStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const bucketEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
      buckets.push({
        key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
        label: fmt.format(cursor),
        start: bucketStart,
        end: bucketEnd,
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  }

  return buckets.map((bucket) => {
    const inBucket = projects.filter((project) => {
      if (!project.createdAt) return false;
      const created = new Date(project.createdAt);
      return created.getTime() >= bucket.start.getTime() && created.getTime() <= bucket.end.getTime();
    });
    return {
      key: bucket.key,
      label: bucket.label,
      quotedRevenueIncl: inBucket.reduce((sum, row) => sum + row.quotedRevenueIncl, 0),
      receivedCashIncl: inBucket.reduce((sum, row) => sum + row.receivedCashIncl, 0),
      actualCostExcl: inBucket.reduce((sum, row) => sum + row.actualCostExcl, 0),
      netProfitQuoteBasis: inBucket.reduce((sum, row) => sum + row.netProfitQuoteBasis, 0),
    };
  });
}

function buildSmartInsights(
  projects: WinstProjectPerformance[],
  leakDetection: WinstLeakInsight[]
): string[] {
  const insights: string[] = [];

  leakDetection.slice(0, 2).forEach((item) => insights.push(item.message));

  const withActual = projects.filter((project) => project.hasActualData);
  if (withActual.length > 0) {
    const groupedByType = new Map<string, WinstProjectPerformance[]>();
    withActual.forEach((project) => {
      const type = project.jobTypes[0] || 'Onbekend';
      const list = groupedByType.get(type) || [];
      list.push(project);
      groupedByType.set(type, list);
    });

    const typeMargins = Array.from(groupedByType.entries())
      .map(([type, rows]) => ({
        type,
        avgMargin: rows.reduce((sum, row) => sum + row.marginPct, 0) / rows.length,
      }))
      .sort((a, b) => b.avgMargin - a.avgMargin);

    if (typeMargins[0]) {
      insights.push(
        `Je verdient het meest op ${typeMargins[0].type}, gemiddeld ${(typeMargins[0].avgMargin * 100).toFixed(1)}% marge.`
      );
    }
    if (typeMargins.length > 1) {
      const worst = typeMargins[typeMargins.length - 1];
      insights.push(`Let op ${worst.type}: daar blijft gemiddeld ${(worst.avgMargin * 100).toFixed(1)}% marge over.`);
    }

    const large = withActual.filter((project) => project.quotedRevenueIncl >= 5000);
    const small = withActual.filter((project) => project.quotedRevenueIncl < 5000);
    if (large.length >= 2 && small.length >= 2) {
      const largeMargin = large.reduce((sum, row) => sum + row.marginPct, 0) / large.length;
      const smallMargin = small.reduce((sum, row) => sum + row.marginPct, 0) / small.length;
      if (largeMargin > smallMargin) {
        insights.push(`Je marge stijgt bij projecten boven € 5.000 (+${((largeMargin - smallMargin) * 100).toFixed(1)} p.p.).`);
      }
    }
  }

  return Array.from(new Set(insights)).slice(0, 5);
}

function toPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function hoursToDays(hours: number): number {
  const normalizedHours = Math.max(0, safeNumber(hours));
  if (normalizedHours <= 0) return 0;
  return normalizedHours / DEFAULT_WORKDAY_HOURS;
}

function buildInvoiceAllocation(
  quoteIds: string[],
  amount: number,
  quotedRevenueByQuoteId: Map<string, number>
): Array<{ quoteId: string; amount: number }> {
  const normalizedQuoteIds = Array.from(new Set(quoteIds.filter(Boolean)));
  const targetAmount = Math.max(0, safeNumber(amount));
  if (targetAmount <= 0 || normalizedQuoteIds.length === 0) return [];
  if (normalizedQuoteIds.length === 1) {
    return [{ quoteId: normalizedQuoteIds[0], amount: targetAmount }];
  }

  const weighted = normalizedQuoteIds.map((quoteId) => ({
    quoteId,
    weight: Math.max(0, quotedRevenueByQuoteId.get(quoteId) || 0),
  }));
  const totalWeight = weighted.reduce((sum, row) => sum + row.weight, 0);

  if (totalWeight <= 0) {
    const equalShare = targetAmount / normalizedQuoteIds.length;
    return normalizedQuoteIds.map((quoteId) => ({ quoteId, amount: equalShare }));
  }

  return weighted.map((row) => ({
    quoteId: row.quoteId,
    amount: targetAmount * (row.weight / totalWeight),
  }));
}

function createTotalBreakdownRow(projects: WinstProjectPerformance[]): { categories: WinstCategoryBreakdownRow[]; total: WinstCategoryBreakdownRow } {
  const totalsByCategory = new Map<WinstCostCategoryKey, { quoted: number; actual: number }>();
  CATEGORY_ORDER.forEach((key) => totalsByCategory.set(key, { quoted: 0, actual: 0 }));

  projects.forEach((project) => {
    project.costBreakdown.forEach((row) => {
      const bucket = totalsByCategory.get(row.key);
      if (!bucket) return;
      bucket.quoted += row.quotedExcl;
      bucket.actual += row.actualExcl;
    });
  });

  const categories = CATEGORY_ORDER.map((key) => {
    const bucket = totalsByCategory.get(key)!;
    const diffEuro = bucket.actual - bucket.quoted;
    const diffPct = bucket.quoted > 0 ? diffEuro / bucket.quoted : bucket.actual > 0 ? 1 : 0;
    return {
      key,
      label: CATEGORY_LABELS[key],
      quotedExcl: bucket.quoted,
      actualExcl: bucket.actual,
      diffEuro,
      diffPct,
      status: calcVarianceStatus(bucket.quoted, bucket.actual, diffPct),
    };
  });

  const quotedTotal = categories.reduce((sum, row) => sum + row.quotedExcl, 0);
  const actualTotal = categories.reduce((sum, row) => sum + row.actualExcl, 0);
  const totalDiff = actualTotal - quotedTotal;
  const totalDiffPct = quotedTotal > 0 ? totalDiff / quotedTotal : actualTotal > 0 ? 1 : 0;

  return {
    categories,
    total: {
      key: 'arbeid',
      label: 'Totaal kosten',
      quotedExcl: quotedTotal,
      actualExcl: actualTotal,
      diffEuro: totalDiff,
      diffPct: totalDiffPct,
      status: calcVarianceStatus(quotedTotal, actualTotal, totalDiffPct),
    },
  };
}

export function buildWinstMetrics(input: BuildWinstMetricsInput): WinstMetricsResponse {
  const now = input.now ?? new Date();
  const normalizedFilters = normalizeFilters(input.filters);
  const range = buildRange(now, normalizedFilters.periodType, normalizedFilters.periodRange);

  const calculationByQuoteId = new Map<string, WinstCalculationSource>();
  input.calculations.forEach((row) => {
    if (!row.quoteId) return;
    if (calculationByQuoteId.has(row.quoteId)) return;
    calculationByQuoteId.set(row.quoteId, row);
  });

  const nacalculatieByQuoteId = new Map<string, WinstNacalculatieSource>();
  input.nacalculaties.forEach((row) => {
    if (!row.quoteId) return;
    nacalculatieByQuoteId.set(row.quoteId, row);
  });

  const projectCostsByQuoteId = new Map<string, ExternalProjectCostSnapshot>();
  (input.projectCosts || []).forEach((row) => {
    if (!row.quoteId) return;
    const current = projectCostsByQuoteId.get(row.quoteId) || {
      materiaal: 0,
      brandstof: 0,
      gereedschap: 0,
      overig: 0,
    };
    current[row.category] = safeNumber(current[row.category]) + safeNumber(row.amountExcl);
    projectCostsByQuoteId.set(row.quoteId, current);
  });

  const laborCostsByQuoteId = new Map<string, { costExcl: number; hours: number }>();
  (input.laborCosts || []).forEach((row) => {
    if (!row.quoteId) return;
    const current = laborCostsByQuoteId.get(row.quoteId) || { costExcl: 0, hours: 0 };
    laborCostsByQuoteId.set(row.quoteId, {
      costExcl: safeNumber(current.costExcl) + safeNumber(row.costExcl),
      hours: safeNumber(current.hours) + safeNumber(row.hours),
    });
  });

  const relevantQuotes = input.quotes.filter((quote) => {
    const quoteStatus = String(quote.status || '').trim().toLowerCase();
    if (quoteStatus !== 'geaccepteerd') return false;
    const baseDate = quote.updatedAt || quote.createdAt;
    if (!isDateWithinRange(baseDate, range)) return false;
    if (normalizedFilters.projectIds.length > 0 && !normalizedFilters.projectIds.includes(quote.id)) return false;
    if (normalizedFilters.clientIds.length > 0 && !normalizedFilters.clientIds.includes(quote.clientId)) return false;
    if (
      normalizedFilters.jobTypes.length > 0 &&
      !quote.jobTypes.some((type) => normalizedFilters.jobTypes.includes(type))
    ) {
      return false;
    }
    return true;
  });

  const relevantQuoteIds = new Set(relevantQuotes.map((quote) => quote.id));
  const quotedRevenueByQuoteId = new Map(relevantQuotes.map((quote) => [quote.id, Math.max(0, safeNumber(quote.quotedRevenueIncl))]));

  const invoiceById = new Map<string, WinstInvoiceSource>();
  const relevantInvoices = input.invoices.filter((invoice) => {
    const linksSelectedQuote = invoice.quoteIds.some((quoteId) => relevantQuoteIds.has(quoteId));
    if (!linksSelectedQuote) return false;
    invoiceById.set(invoice.id, invoice);
    return true;
  });

  const paymentByInvoice = new Map<string, number>();
  input.payments
    .filter((payment) => {
      if (!invoiceById.has(payment.invoiceId)) return false;
      return isDateWithinRange(payment.date, range);
    })
    .forEach((payment) => {
      paymentByInvoice.set(payment.invoiceId, (paymentByInvoice.get(payment.invoiceId) || 0) + safeNumber(payment.amount));
    });

  const quotePaymentsInPeriod = new Map<string, number>();
  relevantInvoices.forEach((invoice) => {
    let paid = paymentByInvoice.get(invoice.id) || 0;
    const invoiceCreatedInRange = isDateWithinRange(invoice.createdAt, range);
    if (paid <= 0 && invoiceCreatedInRange) {
      const paidFromSummary = Math.max(0, safeNumber(invoice.paidAmount));
      if (paidFromSummary > 0) {
        paid = paidFromSummary;
      } else {
        const invoiceType = String(invoice.invoiceType || '').trim().toLowerCase();
        if (invoiceType === 'voorschot') {
          // In Calvora workflow, voorschotfacturen represent already received cash
          // unless explicit payment records indicate otherwise.
          paid = Math.max(0, safeNumber(invoice.totalIncl));
        }
      }
    }
    const allocations = buildInvoiceAllocation(
      invoice.quoteIds.filter((quoteId) => relevantQuoteIds.has(quoteId)),
      paid,
      quotedRevenueByQuoteId
    );
    allocations.forEach((allocation) => {
      quotePaymentsInPeriod.set(allocation.quoteId, (quotePaymentsInPeriod.get(allocation.quoteId) || 0) + allocation.amount);
    });
  });

  const openAmountByQuote = new Map<string, number>();
  const overdueAmountByQuote = new Map<string, number>();
  let overdueCount = 0;
  relevantInvoices.forEach((invoice) => {
    const open = Math.max(0, safeNumber(invoice.openAmount));
    if (open <= 0) return;
    const allocations = buildInvoiceAllocation(
      invoice.quoteIds.filter((quoteId) => relevantQuoteIds.has(quoteId)),
      open,
      quotedRevenueByQuoteId
    );
    allocations.forEach((allocation) => {
      openAmountByQuote.set(allocation.quoteId, (openAmountByQuote.get(allocation.quoteId) || 0) + allocation.amount);
      if (invoice.dueDate && invoice.dueDate.getTime() < now.getTime()) {
        overdueAmountByQuote.set(
          allocation.quoteId,
          (overdueAmountByQuote.get(allocation.quoteId) || 0) + allocation.amount
        );
      }
    });
    if (invoice.dueDate && invoice.dueDate.getTime() < now.getTime()) overdueCount += 1;
  });

  const topCostItems: WinstTopCostItem[] = [];

  const projects = relevantQuotes.map((quote): WinstProjectPerformance => {
    const quoted = getQuotedSnapshot(quote, calculationByQuoteId);
    const { snapshot: actual } = getActualSnapshot(
      quote,
      input.userId,
      nacalculatieByQuoteId,
      projectCostsByQuoteId,
      laborCostsByQuoteId
    );
    const breakdown = toCategoryRows(quoted, actual);
    const quotedRevenueIncl = Math.max(0, safeNumber(quote.quotedRevenueIncl));
    const receivedCashIncl = Math.max(0, quotePaymentsInPeriod.get(quote.id) || 0);
    const actualCostExcl = CATEGORY_ORDER.reduce((sum, key) => sum + safeNumber(actual[key]), 0);
    const netProfitQuoteBasis = quotedRevenueIncl - actualCostExcl;
    const netProfitCashBasis = receivedCashIncl - actualCostExcl;
    const marginPct = toPercent(netProfitQuoteBasis, quotedRevenueIncl);
    const hoursDiff = actual.actualHours - quoted.quotedHours;
    const hoursDiffPct = toPercent(hoursDiff, quoted.quotedHours);
    const daysDiff = actual.actualDays - quoted.quotedDays;
    const daysDiffPct = toPercent(daysDiff, quoted.quotedDays);
    const expectedEuroPerHour = toPercent(quotedRevenueIncl, quoted.quotedHours);
    const realizedEuroPerHour = toPercent(receivedCashIncl, actual.actualHours);
    const expectedEuroPerDay = toPercent(quotedRevenueIncl, quoted.quotedDays);
    const realizedEuroPerDay = toPercent(receivedCashIncl, actual.actualDays);
    const positiveVariance = breakdown.categories
      .filter((row) => row.diffEuro > 0)
      .sort((a, b) => b.diffEuro - a.diffEuro)[0];
    const dataQualityIssue = actual.hasAnyActualData ? null : 'Geen nacalculatie ingevuld';

    actual.topCostItems.forEach((item) => {
      topCostItems.push({
        projectId: quote.id,
        projectLabel: quote.title,
        category: item.category,
        name: item.name,
        totalExcl: item.totalExcl,
      });
    });

    return {
      projectId: quote.id,
      offerteNummer: quote.offerteNummer,
      title: quote.title,
      clientId: quote.clientId,
      clientName: quote.clientName,
      jobTypes: quote.jobTypes,
      createdAt: (quote.createdAt || quote.updatedAt)?.toISOString() ?? null,
      status: quote.status,
      hasActualData: actual.hasAnyActualData,
      dataQualityIssue,
      quotedRevenueIncl,
      receivedCashIncl,
      actualCostExcl,
      netProfitQuoteBasis,
      netProfitCashBasis,
      marginPct,
      quotedHours: quoted.quotedHours,
      actualHours: actual.actualHours,
      hoursDiff,
      hoursDiffPct,
      quotedDays: quoted.quotedDays,
      actualDays: actual.actualDays,
      daysDiff,
      daysDiffPct,
      expectedEuroPerHour,
      realizedEuroPerHour,
      expectedEuroPerDay,
      realizedEuroPerDay,
      quotedTransportKm: quoted.quotedTransportKm,
      actualTransportKm: actual.actualTransportKm,
      transportRevenueExcl: actual.transportRevenueExcl,
      keyIssue: getIssueLabel(positiveVariance, actual.hasAnyActualData),
      costBreakdown: breakdown.categories,
    };
  });

  const totals = {
    quotedRevenueIncl: projects.reduce((sum, row) => sum + row.quotedRevenueIncl, 0),
    receivedCashIncl: projects.reduce((sum, row) => sum + row.receivedCashIncl, 0),
    actualCostExcl: projects.reduce((sum, row) => sum + row.actualCostExcl, 0),
    netProfitQuoteBasis: 0,
    netProfitCashBasis: 0,
    marginPct: 0,
    cashInRatio: 0,
    openAmount: 0,
    overdueAmount: 0,
    overdueCount,
  };
  totals.netProfitQuoteBasis = totals.quotedRevenueIncl - totals.actualCostExcl;
  totals.netProfitCashBasis = totals.receivedCashIncl - totals.actualCostExcl;
  totals.marginPct = toPercent(totals.netProfitQuoteBasis, totals.quotedRevenueIncl);
  totals.cashInRatio = toPercent(totals.receivedCashIncl, totals.quotedRevenueIncl);
  totals.openAmount = projects.reduce((sum, project) => sum + (openAmountByQuote.get(project.projectId) || 0), 0);
  totals.overdueAmount = projects.reduce((sum, project) => sum + (overdueAmountByQuote.get(project.projectId) || 0), 0);

  const totalBreakdown = createTotalBreakdownRow(projects);
  const withActual = projects.filter((project) => project.hasActualData);
  const sortedByMargin = [...withActual].sort((a, b) => b.marginPct - a.marginPct);
  const sortedByProfit = [...withActual].sort((a, b) => b.netProfitQuoteBasis - a.netProfitQuoteBasis);
  const worstByProfit = [...withActual].sort((a, b) => a.netProfitQuoteBasis - b.netProfitQuoteBasis);
  const avgMarginPct =
    withActual.length > 0 ? withActual.reduce((sum, row) => sum + row.marginPct, 0) / withActual.length : 0;

  const weightedDeviation = (key: WinstCostCategoryKey): number => {
    const rows = withActual.filter((project) => {
      const row = project.costBreakdown.find((item) => item.key === key);
      return !!row && row.quotedExcl > 0;
    });
    const quotedTotal = rows.reduce(
      (sum, project) => sum + (project.costBreakdown.find((item) => item.key === key)?.quotedExcl || 0),
      0
    );
    const diffTotal = rows.reduce(
      (sum, project) => sum + (project.costBreakdown.find((item) => item.key === key)?.diffEuro || 0),
      0
    );
    return toPercent(diffTotal, quotedTotal);
  };

  const leakDetection: WinstLeakInsight[] = [];
  if (withActual.length >= 5) {
    const arbeidDeviation = weightedDeviation('arbeid');
    if (arbeidDeviation >= 0.15) {
      leakDetection.push({
        id: 'arbeid-onderschat',
        severity: arbeidDeviation >= 0.25 ? 'critical' : 'warning',
        message: `Je onderschat arbeid gemiddeld met ${(arbeidDeviation * 100).toFixed(1)}% over de laatste ${withActual.length} klussen.`,
      });
    }

    const grootDeviation = weightedDeviation('materialenGroot');
    if (grootDeviation >= 0.15) {
      leakDetection.push({
        id: 'materiaal-groot-onderschat',
        severity: grootDeviation >= 0.25 ? 'critical' : 'warning',
        message: `Groot materiaal wordt gemiddeld ${(grootDeviation * 100).toFixed(1)}% onderschat.`,
      });
    }

    const verbruikDeviation = weightedDeviation('materialenVerbruik');
    if (verbruikDeviation >= 0.15) {
      leakDetection.push({
        id: 'materiaal-verbruik-onderschat',
        severity: verbruikDeviation >= 0.25 ? 'critical' : 'warning',
        message: `Verbruiksmateriaal wordt gemiddeld ${(verbruikDeviation * 100).toFixed(1)}% onderschat.`,
      });
    }

    const transportRows = withActual.filter((project) => {
      const row = project.costBreakdown.find((item) => item.key === 'transport');
      return !!row;
    });
    if (transportRows.length > 0) {
      const undercovered = transportRows.filter((project) => {
        const row = project.costBreakdown.find((item) => item.key === 'transport');
        return (row?.actualExcl || 0) > (row?.quotedExcl || 0);
      }).length;
      const undercoveredRatio = undercovered / transportRows.length;
      if (undercoveredRatio >= 0.6) {
        leakDetection.push({
          id: 'transport-onderdekking',
          severity: undercoveredRatio >= 0.8 ? 'critical' : 'warning',
          message: `Transportkosten worden in ${(undercoveredRatio * 100).toFixed(0)}% van de offertes niet volledig gedekt.`,
        });
      }
    }

    const transportForgottenRatio =
      withActual.filter((project) => {
        const row = project.costBreakdown.find((item) => item.key === 'transport');
        return (row?.quotedExcl || 0) <= 0 && (row?.actualExcl || 0) > 0;
      }).length / withActual.length;
    if (transportForgottenRatio >= 0.4) {
      leakDetection.push({
        id: 'transport-vergeten',
        severity: transportForgottenRatio >= 0.6 ? 'critical' : 'warning',
        message: `Transport wordt in ${(transportForgottenRatio * 100).toFixed(0)}% van je projecten niet vooraf meegenomen.`,
      });
    }
  }

  const timeTracking = {
    quotedHours: projects.reduce((sum, project) => sum + project.quotedHours, 0),
    actualHours: projects.reduce((sum, project) => sum + project.actualHours, 0),
    hoursDiff: 0,
    hoursDiffPct: 0,
    quotedDays: projects.reduce((sum, project) => sum + project.quotedDays, 0),
    actualDays: projects.reduce((sum, project) => sum + project.actualDays, 0),
    daysDiff: 0,
    daysDiffPct: 0,
    expectedEuroPerHour: 0,
    realizedEuroPerHour: 0,
    expectedEuroPerDay: 0,
    realizedEuroPerDay: 0,
  };
  timeTracking.hoursDiff = timeTracking.actualHours - timeTracking.quotedHours;
  timeTracking.hoursDiffPct = toPercent(timeTracking.hoursDiff, timeTracking.quotedHours);
  timeTracking.daysDiff = timeTracking.actualDays - timeTracking.quotedDays;
  timeTracking.daysDiffPct = toPercent(timeTracking.daysDiff, timeTracking.quotedDays);
  timeTracking.expectedEuroPerHour = toPercent(totals.quotedRevenueIncl, timeTracking.quotedHours);
  timeTracking.realizedEuroPerHour = toPercent(totals.receivedCashIncl, timeTracking.actualHours);
  timeTracking.expectedEuroPerDay = toPercent(totals.quotedRevenueIncl, timeTracking.quotedDays);
  timeTracking.realizedEuroPerDay = toPercent(totals.receivedCashIncl, timeTracking.actualDays);

  const transportRow = totalBreakdown.categories.find((category) => category.key === 'transport')!;
  const transportAnalysis = {
    quotedExcl: transportRow.quotedExcl,
    actualExcl: transportRow.actualExcl,
    diffEuro: transportRow.diffEuro,
    diffPct: transportRow.diffPct,
    avgKmPerProject: toPercent(
      projects.reduce((sum, project) => sum + project.actualTransportKm, 0),
      Math.max(projects.length, 1)
    ),
    avgRevenueVsCost: toPercent(
      projects.reduce((sum, project) => sum + project.transportRevenueExcl, 0),
      Math.max(
        projects.reduce((sum, project) => sum + (project.costBreakdown.find((row) => row.key === 'transport')?.actualExcl || 0), 0),
        1
      )
    ),
  };

  const materialAnalysis = {
    groot: totalBreakdown.categories.find((category) => category.key === 'materialenGroot')!,
    verbruik: totalBreakdown.categories.find((category) => category.key === 'materialenVerbruik')!,
    materialMarginPct: 0,
    markupVsRealPct: 0,
    topCostItems: topCostItems.sort((a, b) => b.totalExcl - a.totalExcl).slice(0, 5),
  };
  const quotedMaterialTotal = materialAnalysis.groot.quotedExcl + materialAnalysis.verbruik.quotedExcl;
  const actualMaterialTotal = materialAnalysis.groot.actualExcl + materialAnalysis.verbruik.actualExcl;
  materialAnalysis.materialMarginPct = toPercent(quotedMaterialTotal - actualMaterialTotal, quotedMaterialTotal);
  materialAnalysis.markupVsRealPct = toPercent(quotedMaterialTotal - actualMaterialTotal, actualMaterialTotal);

  const trend = buildTrend(projects, range, normalizedFilters.periodType);
  const smartInsights = buildSmartInsights(projects, leakDetection);

  const uniqueFilterOptions = {
    jobTypes: Array.from(
      new Set(input.quotes.flatMap((quote) => quote.jobTypes).filter(Boolean))
    )
      .map((jobType) => ({ id: jobType, label: jobType }))
      .sort((a, b) => a.label.localeCompare(b.label, 'nl-NL')),
    clients: Array.from(
      new Set(input.quotes.map((quote) => quote.clientId).filter(Boolean))
    )
      .map((clientId) => {
        const match = input.quotes.find((quote) => quote.clientId === clientId);
        return {
          id: clientId,
          label: match?.clientName || clientId,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'nl-NL')),
    projects: input.quotes
      .map((quote) => ({
        id: quote.id,
        label: quote.offerteNummer ? `#${quote.offerteNummer} • ${quote.title}` : quote.title,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'nl-NL')),
  };

  return {
    generatedAt: now.toISOString(),
    periodType: normalizedFilters.periodType,
    periodRange: normalizedFilters.periodRange,
    periodLabel: range.label,
    dataQuality: {
      projectsTotal: projects.length,
      projectsWithActual: withActual.length,
      projectsMissingActual: projects.length - withActual.length,
    },
    totals,
    costBreakdown: totalBreakdown,
    marginAnalysis: {
      avgMarginPct,
      bestProject: sortedByMargin[0] || null,
      worstProject: sortedByMargin.length > 0 ? sortedByMargin[sortedByMargin.length - 1] : null,
    },
    timeTracking,
    transportAnalysis,
    materialAnalysis,
    cashflow: {
      profitQuoteBasis: totals.netProfitQuoteBasis,
      receivedCashIncl: totals.receivedCashIncl,
      cashInRatio: totals.cashInRatio,
      openAmount: totals.openAmount,
      overdueAmount: totals.overdueAmount,
      overdueCount: totals.overdueCount,
    },
    leakDetection,
    smartInsights,
    topPerformers: sortedByProfit.slice(0, 5),
    worstPerformers: worstByProfit.slice(0, 5),
    trend,
    projectPerformances: projects,
    filterOptions: uniqueFilterOptions,
  };
}

export function extractQuoteCostFromExtras(extras: unknown): { materieel: number; overhead: number } {
  if (!extras || typeof extras !== 'object') {
    return { materieel: 0, overhead: 0 };
  }
  const source = extras as Record<string, unknown>;
  return {
    materieel: sumSparseCosts(source.materieel),
    overhead: sumSparseCosts(source.verzendkosten),
  };
}
