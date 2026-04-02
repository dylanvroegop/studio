import { supabaseAdmin } from '@/lib/supabase-admin';

interface LaborCostBucket {
  costExcl: number;
  hours: number;
}

const TABLE_CANDIDATES = ['time_entries', 'urenregistratie'] as const;

function safeNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundEuro(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getFirstString(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = safeString(row[key]);
    if (value) return value;
  }
  return '';
}

function getFirstNumber(row: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = row[key];
    const numeric = safeNumber(value);
    if (Number.isFinite(numeric) && numeric !== 0) return numeric;
  }
  return 0;
}

function getLaborHours(row: Record<string, unknown>): number {
  return Math.max(
    0,
    getFirstNumber(row, [
      'hours',
      'total_hours',
      'duration_hours',
      'uren',
      'aantal_uren',
      'quantity_hours',
    ])
  );
}

function getLaborRate(row: Record<string, unknown>): number {
  return Math.max(
    0,
    getFirstNumber(row, [
      'hour_rate_excl',
      'hour_rate',
      'hourly_rate',
      'rate_per_hour',
      'uurtarief',
      'uur_tarief',
      'hourRateExcl',
      'hourRate',
    ])
  );
}

function getLaborCost(row: Record<string, unknown>): number {
  const direct = Math.max(
    0,
    getFirstNumber(row, [
      'labor_cost_excl',
      'labor_cost',
      'total_cost_excl',
      'total_cost',
      'cost_excl',
      'cost',
      'amount_excl_btw',
      'total_excl',
      'total',
      'bedrag_excl',
      'bedrag',
    ])
  );

  if (direct > 0) return direct;
  const hours = getLaborHours(row);
  const rate = getLaborRate(row);
  return Math.max(0, hours * rate);
}

function isMissingRelationError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('does not exist') ||
    lower.includes('relation') ||
    lower.includes('not found')
  );
}

export async function fetchLaborCostsByQuoteId(params: {
  uid: string;
  quoteIds?: string[];
}): Promise<Map<string, LaborCostBucket>> {
  const uid = params.uid.trim();
  if (!uid) return new Map();

  const quoteFilter = new Set((params.quoteIds || []).map((item) => item.trim()).filter(Boolean));
  const merged = new Map<string, LaborCostBucket>();

  for (const table of TABLE_CANDIDATES) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('*')
      .limit(5000);

    if (error) {
      if (isMissingRelationError(error.message)) continue;
      console.warn(`[labor-costs] Kon ${table} niet laden:`, error.message);
      continue;
    }

    if (!Array.isArray(data)) continue;

    data.forEach((rawRow) => {
      if (!rawRow || typeof rawRow !== 'object') return;
      const row = rawRow as Record<string, unknown>;

      const rowUserId = getFirstString(row, [
        'user_id',
        'gebruikerid',
        'uid',
        'userId',
        'owner_id',
      ]);
      if (!rowUserId || rowUserId !== uid) return;

      const quoteId = getFirstString(row, [
        'quote_id',
        'offerte_id',
        'project_id',
        'quoteId',
        'offerteId',
      ]);
      if (!quoteId) return;
      if (quoteFilter.size > 0 && !quoteFilter.has(quoteId)) return;

      const costExcl = roundEuro(getLaborCost(row));
      const hours = roundEuro(getLaborHours(row));
      if (costExcl <= 0 && hours <= 0) return;

      const bucket = merged.get(quoteId) || { costExcl: 0, hours: 0 };
      merged.set(quoteId, {
        costExcl: roundEuro(bucket.costExcl + costExcl),
        hours: roundEuro(bucket.hours + hours),
      });
    });
  }

  return merged;
}
