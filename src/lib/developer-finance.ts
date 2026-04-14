export type DeveloperFinanceEntryKind = 'income' | 'expense';
export type DeveloperFinanceEntryScope = 'business' | 'personal';
export type DeveloperFinanceEntryRecurrence = 'one_time' | 'monthly';

export interface DeveloperFinanceEntry {
  id: string;
  date: string; // YYYY-MM-DD
  kind: DeveloperFinanceEntryKind;
  scope: DeveloperFinanceEntryScope;
  category: string;
  description: string;
  amount: number;
  recurrence: DeveloperFinanceEntryRecurrence;
  createdAt: string;
  updatedAt: string;
}

export interface DeveloperFinanceMeta {
  targetAmount: number;
}

export interface DeveloperFinanceMonthlySummary {
  monthKey: string;
  label: string;
  incomeBusiness: number;
  incomePersonal: number;
  expenseBusiness: number;
  expensePersonal: number;
  net: number;
  cumulative: number;
}

export interface DeveloperFinanceProjectionPoint {
  monthKey: string;
  label: string;
  projectedCumulative: number;
}

const MONTH_FORMATTER = new Intl.DateTimeFormat('nl-NL', {
  month: 'short',
  year: 'numeric',
});

export function roundEuro(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function normalizeFinanceEntry(raw: unknown): DeveloperFinanceEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;

  const id = String(item.id || '').trim() || crypto.randomUUID();
  const date = String(item.date || '').trim();
  const parsedDate = new Date(date);
  if (!date || Number.isNaN(parsedDate.getTime())) return null;

  const kind = item.kind === 'income' ? 'income' : item.kind === 'expense' ? 'expense' : null;
  if (!kind) return null;

  const scope = item.scope === 'personal' ? 'personal' : item.scope === 'business' ? 'business' : null;
  if (!scope) return null;

  const recurrence = item.recurrence === 'monthly' ? 'monthly' : 'one_time';
  const amount = roundEuro(Number(item.amount));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const createdAt = String(item.createdAt || new Date().toISOString());
  const updatedAt = String(item.updatedAt || new Date().toISOString());

  return {
    id,
    date,
    kind,
    scope,
    category: String(item.category || '').trim(),
    description: String(item.description || '').trim(),
    amount,
    recurrence,
    createdAt,
    updatedAt,
  };
}

export function getFinanceMonthlySummary(entries: DeveloperFinanceEntry[]): DeveloperFinanceMonthlySummary[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const byMonth = new Map<string, Omit<DeveloperFinanceMonthlySummary, 'cumulative'>>();

  for (const entry of sorted) {
    const monthKey = entry.date.slice(0, 7);
    const bucket = byMonth.get(monthKey) || {
      monthKey,
      label: formatMonthLabel(monthKey),
      incomeBusiness: 0,
      incomePersonal: 0,
      expenseBusiness: 0,
      expensePersonal: 0,
      net: 0,
    };

    if (entry.kind === 'income' && entry.scope === 'business') bucket.incomeBusiness += entry.amount;
    if (entry.kind === 'income' && entry.scope === 'personal') bucket.incomePersonal += entry.amount;
    if (entry.kind === 'expense' && entry.scope === 'business') bucket.expenseBusiness += entry.amount;
    if (entry.kind === 'expense' && entry.scope === 'personal') bucket.expensePersonal += entry.amount;

    bucket.net = roundEuro(
      bucket.incomeBusiness + bucket.incomePersonal - bucket.expenseBusiness - bucket.expensePersonal
    );

    byMonth.set(monthKey, bucket);
  }

  let cumulative = 0;
  return Array.from(byMonth.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((monthKey) => {
      const bucket = byMonth.get(monthKey)!;
      cumulative = roundEuro(cumulative + bucket.net);
      return {
        ...bucket,
        incomeBusiness: roundEuro(bucket.incomeBusiness),
        incomePersonal: roundEuro(bucket.incomePersonal),
        expenseBusiness: roundEuro(bucket.expenseBusiness),
        expensePersonal: roundEuro(bucket.expensePersonal),
        net: roundEuro(bucket.net),
        cumulative,
      };
    });
}

export function getAverageMonthlyNet(summaries: DeveloperFinanceMonthlySummary[]): number {
  if (summaries.length === 0) return 0;
  const window = summaries.slice(-3);
  const total = window.reduce((sum, item) => sum + item.net, 0);
  return roundEuro(total / window.length);
}

export function getProjectionPoints(
  startMonthKey: string,
  startingCumulative: number,
  monthlyNet: number,
  months: number
): DeveloperFinanceProjectionPoint[] {
  const points: DeveloperFinanceProjectionPoint[] = [];
  let cumulative = startingCumulative;

  for (let index = 1; index <= months; index += 1) {
    const month = addMonthsToMonthKey(startMonthKey, index);
    cumulative = roundEuro(cumulative + monthlyNet);
    points.push({
      monthKey: month,
      label: formatMonthLabel(month),
      projectedCumulative: cumulative,
    });
  }

  return points;
}

export function estimateTargetDate(
  currentCumulative: number,
  targetAmount: number,
  averageMonthlyNet: number,
  currentMonthKey: string
): string | null {
  if (targetAmount <= currentCumulative) return 'Doel al bereikt';
  if (averageMonthlyNet <= 0) return null;
  const missing = targetAmount - currentCumulative;
  const monthsNeeded = Math.ceil(missing / averageMonthlyNet);
  const targetMonthKey = addMonthsToMonthKey(currentMonthKey, monthsNeeded);
  return formatMonthLabel(targetMonthKey);
}

function addMonthsToMonthKey(monthKey: string, months: number): string {
  const [yearRaw, monthRaw] = monthKey.split('-');
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  const next = new Date(year, monthIndex + months, 1);
  const nextYear = next.getFullYear();
  const nextMonth = String(next.getMonth() + 1).padStart(2, '0');
  return `${nextYear}-${nextMonth}`;
}

function formatMonthLabel(monthKey: string): string {
  const [yearRaw, monthRaw] = monthKey.split('-');
  const date = new Date(Number(yearRaw), Number(monthRaw) - 1, 1);
  return MONTH_FORMATTER.format(date);
}
