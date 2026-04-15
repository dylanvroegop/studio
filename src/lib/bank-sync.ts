import { createHash } from 'crypto';
export interface BankBalance {
  balanceType: string | null;
  amount: number | null;
  currency: string | null;
  referenceDate: string | null;
  raw: Record<string, unknown>;
}

export interface BankTransaction {
  externalTransactionId: string | null;
  internalTransactionId: string | null;
  bookingDate: string | null;
  valueDate: string | null;
  amount: number;
  currency: string;
  direction: 'incoming' | 'outgoing';
  counterpartyName: string | null;
  counterpartyIban: string | null;
  remittanceInformation: string | null;
  status: string | null;
  raw: Record<string, unknown>;
}

export interface BankAccountUpsertRow {
  connection_id: string;
  external_account_id: string;
  iban: string | null;
  name: string | null;
  currency: string | null;
  owner_name: string | null;
  product: string | null;
  cash_account_type: string | null;
  status: 'active';
  updated_at: string;
}

export interface BankBalanceInsertRow {
  bank_account_id: string;
  balance_type: string | null;
  amount: number | null;
  currency: string | null;
  reference_date: string | null;
  raw: Record<string, unknown>;
}

export interface BankTransactionUpsertRow {
  bank_account_id: string;
  external_transaction_id: string | null;
  booking_date: string | null;
  value_date: string | null;
  amount: number;
  currency: string;
  direction: 'incoming' | 'outgoing';
  counterparty_name: string | null;
  counterparty_iban: string | null;
  remittance_information: string | null;
  internal_transaction_id: string | null;
  status: string | null;
  raw: Record<string, unknown>;
  hash: string;
  updated_at: string;
}

function safeString(value: string | null): string {
  return (value || '').trim();
}

function normalizeDateOnly(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function buildTransactionHash(input: {
  bankAccountId: string;
  bookingDate: string | null;
  amount: number;
  remittanceInformation: string | null;
  counterpartyName: string | null;
}): string {
  const raw = [
    input.bankAccountId,
    input.bookingDate || '',
    input.amount.toFixed(2),
    safeString(input.remittanceInformation),
    safeString(input.counterpartyName),
  ].join('|');
  return createHash('sha256').update(raw).digest('hex');
}

export function mapAccountUpsert(params: {
  connectionId: string;
  externalAccountId: string;
  iban: string | null;
  name: string | null;
  currency: string | null;
  ownerName: string | null;
  product: string | null;
  cashAccountType: string | null;
}): BankAccountUpsertRow {
  return {
    connection_id: params.connectionId,
    external_account_id: params.externalAccountId,
    iban: params.iban,
    name: params.name,
    currency: params.currency,
    owner_name: params.ownerName,
    product: params.product,
    cash_account_type: params.cashAccountType,
    status: 'active',
    updated_at: new Date().toISOString(),
  };
}

export function mapBalancesInsert(bankAccountId: string, balances: BankBalance[]): BankBalanceInsertRow[] {
  return balances.map((item) => ({
    bank_account_id: bankAccountId,
    balance_type: item.balanceType,
    amount: item.amount,
    currency: item.currency,
    reference_date: normalizeDateOnly(item.referenceDate),
    raw: item.raw,
  }));
}

export function mapTransactionsUpsert(bankAccountId: string, transactions: BankTransaction[]): BankTransactionUpsertRow[] {
  return transactions.map((tx) => {
    const bookingDate = normalizeDateOnly(tx.bookingDate);
    const valueDate = normalizeDateOnly(tx.valueDate);
    const hash = buildTransactionHash({
      bankAccountId,
      bookingDate,
      amount: tx.amount,
      remittanceInformation: tx.remittanceInformation,
      counterpartyName: tx.counterpartyName,
    });
    return {
      bank_account_id: bankAccountId,
      external_transaction_id: tx.externalTransactionId,
      booking_date: bookingDate,
      value_date: valueDate,
      amount: tx.amount,
      currency: tx.currency,
      direction: tx.direction,
      counterparty_name: tx.counterpartyName,
      counterparty_iban: tx.counterpartyIban,
      remittance_information: tx.remittanceInformation,
      internal_transaction_id: tx.internalTransactionId,
      status: tx.status,
      raw: tx.raw,
      hash,
      updated_at: new Date().toISOString(),
    };
  });
}
