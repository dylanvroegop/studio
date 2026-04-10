export type WinstPeriodType = 'month' | 'week';

export type WinstCostCategoryKey =
  | 'materialenGroot'
  | 'materialenVerbruik'
  | 'arbeid'
  | 'transport'
  | 'materieel'
  | 'overhead';

export type WinstVarianceStatus = 'green' | 'orange' | 'red';

export interface NacalculatieLaborEntry {
  id: string;
  date: string;
  hours: number;
  hourRateExcl: number;
  note?: string;
}

export interface NacalculatieMaterialEntry {
  id: string;
  date: string;
  name: string;
  qty: number;
  unitCostExcl: number;
  totalExcl?: number;
  note?: string;
}

export interface NacalculatieTransportEntry {
  id: string;
  date: string;
  km: number;
  costExcl: number;
  revenueExcl: number;
  note?: string;
}

export interface NacalculatieCostEntry {
  id: string;
  date: string;
  name: string;
  costExcl: number;
  note?: string;
}

export interface NacalculatieDoc {
  quoteId: string;
  userId: string;
  status: 'concept' | 'in_progress' | 'afgerond';
  labor: {
    entries: NacalculatieLaborEntry[];
    actualHours: number;
    actualDays: number;
    actualCostExcl: number;
  };
  materials: {
    groot: {
      entries: NacalculatieMaterialEntry[];
      actualCostExcl: number;
    };
    verbruik: {
      entries: NacalculatieMaterialEntry[];
      actualCostExcl: number;
    };
  };
  transport: {
    entries: NacalculatieTransportEntry[];
    actualCostExcl: number;
    actualKm: number;
    actualRevenueExcl: number;
  };
  materieel: {
    entries: NacalculatieCostEntry[];
    actualCostExcl: number;
  };
  overhead: {
    entries: NacalculatieCostEntry[];
    actualCostExcl: number;
  };
  notes?: string;
  updatedAt?: unknown;
  updatedBy?: string;
  createdAt?: unknown;
}

export interface WinstCategoryBreakdownRow {
  key: WinstCostCategoryKey;
  label: string;
  quotedExcl: number;
  actualExcl: number;
  diffEuro: number;
  diffPct: number;
  status: WinstVarianceStatus;
}

export interface WinstProjectPerformance {
  projectId: string;
  offerteNummer: number | null;
  title: string;
  clientId: string;
  clientName: string;
  jobTypes: string[];
  createdAt: string | null;
  status?: string;
  hasActualData: boolean;
  dataQualityIssue: string | null;
  quotedRevenueIncl: number;
  receivedCashIncl: number;
  actualCostExcl: number;
  netProfitQuoteBasis: number;
  netProfitCashBasis: number;
  marginPct: number;
  quotedHours: number;
  actualHours: number;
  hoursDiff: number;
  hoursDiffPct: number;
  quotedDays: number;
  actualDays: number;
  daysDiff: number;
  daysDiffPct: number;
  expectedEuroPerHour: number;
  realizedEuroPerHour: number;
  expectedEuroPerDay: number;
  realizedEuroPerDay: number;
  quotedTransportKm: number;
  actualTransportKm: number;
  transportRevenueExcl: number;
  keyIssue: string;
  costBreakdown: WinstCategoryBreakdownRow[];
}

export interface WinstFilterOption {
  id: string;
  label: string;
}

export interface WinstLeakInsight {
  id: string;
  severity: 'warning' | 'critical';
  message: string;
}

export interface WinstTopCostItem {
  projectId: string;
  projectLabel: string;
  category: 'groot' | 'verbruik';
  name: string;
  totalExcl: number;
}

export interface WinstTrendPoint {
  key: string;
  label: string;
  quotedRevenueIncl: number;
  receivedCashIncl: number;
  actualCostExcl: number;
  netProfitQuoteBasis: number;
}

export interface WinstMetricsResponse {
  generatedAt: string;
  periodType: WinstPeriodType;
  periodRange: number;
  periodLabel: string;
  dataQuality: {
    projectsTotal: number;
    projectsWithActual: number;
    projectsMissingActual: number;
  };
  totals: {
    quotedRevenueIncl: number;
    receivedCashIncl: number;
    actualCostExcl: number;
    netProfitQuoteBasis: number;
    netProfitCashBasis: number;
    marginPct: number;
    cashInRatio: number;
    openAmount: number;
    overdueAmount: number;
    overdueCount: number;
  };
  costBreakdown: {
    categories: WinstCategoryBreakdownRow[];
    total: WinstCategoryBreakdownRow;
  };
  marginAnalysis: {
    avgMarginPct: number;
    bestProject: WinstProjectPerformance | null;
    worstProject: WinstProjectPerformance | null;
  };
  timeTracking: {
    quotedHours: number;
    actualHours: number;
    hoursDiff: number;
    hoursDiffPct: number;
    quotedDays: number;
    actualDays: number;
    daysDiff: number;
    daysDiffPct: number;
    expectedEuroPerHour: number;
    realizedEuroPerHour: number;
    expectedEuroPerDay: number;
    realizedEuroPerDay: number;
  };
  transportAnalysis: {
    quotedExcl: number;
    actualExcl: number;
    diffEuro: number;
    diffPct: number;
    avgKmPerProject: number;
    avgRevenueVsCost: number;
  };
  materialAnalysis: {
    groot: WinstCategoryBreakdownRow;
    verbruik: WinstCategoryBreakdownRow;
    materialMarginPct: number;
    markupVsRealPct: number;
    topCostItems: WinstTopCostItem[];
  };
  cashflow: {
    profitQuoteBasis: number;
    receivedCashIncl: number;
    cashInRatio: number;
    openAmount: number;
    overdueAmount: number;
    overdueCount: number;
  };
  leakDetection: WinstLeakInsight[];
  smartInsights: string[];
  topPerformers: WinstProjectPerformance[];
  worstPerformers: WinstProjectPerformance[];
  trend: WinstTrendPoint[];
  projectPerformances: WinstProjectPerformance[];
  filterOptions: {
    jobTypes: WinstFilterOption[];
    clients: WinstFilterOption[];
    projects: WinstFilterOption[];
  };
  vatSummary: {
    filingPeriod: 'maand' | 'kwartaal';
    filingPeriodMonths: 1 | 3;
    periodLabel: string;
    periodStart: string;
    periodEnd: string;
    quotesCount: number;
    outputVat: number;
    deductibleVat: number;
    netVatPayable: number;
  };
  quoteStatusSummary: {
    total: number;
    concept: number;
    inBehandeling: number;
    verzonden: number;
    geaccepteerd: number;
    afgewezen: number;
    verlopen: number;
    onbekend: number;
  };
}
