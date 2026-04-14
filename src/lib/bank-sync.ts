import { createHash } from 'crypto';

import { listAccountTransactions, type BankAccountTransaction } from '@/lib/bank-provider-gocardless';

export interface BankConnectionRow {
  id: string;
  user_id: string;
  requisition_id: string;
  institution_id: string;
  institution_name: string | null;
  status: string;
  accounts: unknown;
}

export interface BankTransactionUpsertRow {
  user_id: string;
  external_id: string;
  source: 'bank_transactions';
  connection_id: string;
  account_id: string;
  description: string;
  counterparty_name: string;
  amount: number;
  currency: string;
  direction: 'debit' | 'credit';
  booked_at: string;
  category: string;
  linked_cost_id: null;
  status: 'new' | 'processed' | 'ignored';
  raw: Record<string, unknown>;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeArrayStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => safeString(entry)).filter(Boolean) : [];
}

function normalizeDate(value: string | null): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function detectCategory(description: string, counterparty: string): string {
  const source = `${description} ${counterparty}`.toLowerCase();
  if (source.includes('shell') || source.includes('tank') || source.includes('brandstof')) return 'brandstof';
  if (source.includes('bouwmaat') || source.includes('hornbach') || source.includes('gamma') || source.includes('materiaal')) return 'materiaal';
  if (source.includes('tool') || source.includes('gereedschap')) return 'gereedschap';
  if (source.includes('belasting') || source.includes('btw') || source.includes('belastingdienst')) return 'belasting';
  return 'overig';
}

function buildExternalId(
  accountId: string,
  tx: BankAccountTransaction
): string {
  const fallbackKey = [
    accountId,
    tx.booking_date || '',
    tx.amount.toString(),
    tx.currency,
    tx.creditor_name,
    tx.debtor_name,
    tx.description,
  ].join('|');

  const explicitId = safeString(tx.transaction_id);
  if (explicitId) return `${accountId}:${explicitId}`;

  const digest = createHash('sha256').update(fallbackKey).digest('hex');
  return `${accountId}:hash:${digest}`;
}

function mapBankTransactionToUpsert(params: {
  uid: string;
  connectionId: string;
  accountId: string;
  tx: BankAccountTransaction;
}): BankTransactionUpsertRow {
  const amountRaw = Number(params.tx.amount);
  const direction: 'debit' | 'credit' = amountRaw < 0 ? 'debit' : 'credit';
  const amount = Math.abs(Number.isFinite(amountRaw) ? amountRaw : 0);
  const counterparty = safeString(params.tx.creditor_name) || safeString(params.tx.debtor_name) || 'Onbekend';
  const description = safeString(params.tx.description) || 'Banktransactie';

  return {
    user_id: params.uid,
    external_id: buildExternalId(params.accountId, params.tx),
    source: 'bank_transactions',
    connection_id: params.connectionId,
    account_id: params.accountId,
    description,
    counterparty_name: counterparty,
    amount,
    currency: safeString(params.tx.currency) || 'EUR',
    direction,
    booked_at: normalizeDate(params.tx.booking_date),
    category: detectCategory(description, counterparty),
    linked_cost_id: null,
    status: 'new',
    raw: params.tx.raw,
  };
}

export async function pullConnectionTransactions(
  connection: BankConnectionRow
): Promise<BankTransactionUpsertRow[]> {
  const accountIds = safeArrayStrings(connection.accounts);
  const rows: BankTransactionUpsertRow[] = [];

  for (const accountId of accountIds) {
    const transactions = await listAccountTransactions(accountId);
    for (const tx of transactions) {
      rows.push(
        mapBankTransactionToUpsert({
          uid: connection.user_id,
          connectionId: connection.id,
          accountId,
          tx,
        })
      );
    }
  }

  return rows;
}

