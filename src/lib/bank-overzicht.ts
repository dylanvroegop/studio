import { normalizeProjectCostCategory, roundEuro } from '@/lib/project-costs';

export type BankTransactionSource = 'bank_transactions' | 'project_costs_fallback';

export interface BankTransactionRow {
  id: string;
  user_id: string;
  external_id: string | null;
  source: BankTransactionSource;
  description: string;
  counterparty_name: string;
  amount: number;
  currency: string;
  direction: 'debit' | 'credit';
  booked_at: string;
  category: string;
  linked_cost_id: string | null;
  status: 'new' | 'processed' | 'ignored';
  created_at: string;
  updated_at: string;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function mapBankTransactionRow(input: unknown): BankTransactionRow {
  const row = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const direction = safeString(row.direction).toLowerCase() === 'credit' ? 'credit' : 'debit';
  const statusRaw = safeString(row.status).toLowerCase();
  const status = statusRaw === 'processed' || statusRaw === 'ignored' ? statusRaw : 'new';

  return {
    id: safeString(row.id),
    user_id: safeString(row.user_id),
    external_id: safeString(row.external_id) || null,
    source: 'bank_transactions',
    description: safeString(row.description) || 'Transactie',
    counterparty_name: safeString(row.counterparty_name) || 'Onbekend',
    amount: roundEuro(Math.abs(safeNumber(row.amount))),
    currency: safeString(row.currency) || 'EUR',
    direction,
    booked_at: safeString(row.booked_at) || new Date().toISOString(),
    category: safeString(row.category) || 'overig',
    linked_cost_id: safeString(row.linked_cost_id) || null,
    status,
    created_at: safeString(row.created_at) || new Date().toISOString(),
    updated_at: safeString(row.updated_at) || new Date().toISOString(),
  };
}

export function mapProjectCostToBankFallback(input: unknown): BankTransactionRow {
  const row = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const amountIncl = roundEuro(Math.abs(safeNumber(row.amount_incl_btw)));
  const category = normalizeProjectCostCategory(row.category);
  const id = safeString(row.id);
  const bookedAt = safeString(row.date) || safeString(row.created_at) || new Date().toISOString();

  return {
    id: `fallback-${id || crypto.randomUUID()}`,
    user_id: safeString(row.user_id),
    external_id: id || null,
    source: 'project_costs_fallback',
    description: safeString(row.description) || safeString(row.supplier_name) || 'Kost',
    counterparty_name: safeString(row.supplier_name) || 'Onbekend',
    amount: amountIncl,
    currency: 'EUR',
    direction: 'debit',
    booked_at: bookedAt,
    category,
    linked_cost_id: id || null,
    status: 'processed',
    created_at: safeString(row.created_at) || new Date().toISOString(),
    updated_at: safeString(row.updated_at) || new Date().toISOString(),
  };
}
