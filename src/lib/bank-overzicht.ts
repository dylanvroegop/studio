export interface BankConnectionView {
  id: string;
  institutionName: string | null;
  status: string;
  lastSyncedAt: string | null;
  accountCount: number;
}

export interface BankAccountView {
  id: string;
  externalAccountId: string;
  ibanMasked: string;
  name: string;
  currency: string;
  latestBalanceAmount: number | null;
  latestBalanceDate: string | null;
}

export interface BankTransactionView {
  id: string;
  bookingDate: string;
  description: string;
  counterpartyName: string;
  amount: number;
  currency: string;
  direction: 'incoming' | 'outgoing';
  accountName: string;
  category: string;
  status: string;
}

export interface BankOverviewSummary {
  incomeThisMonth: number;
  expensesThisMonth: number;
  privateWithdrawalsThisMonth: number;
  privateWithdrawalsTotal: number;
  firstTransactionDate: string | null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeIsoDate(value: unknown): string | null {
  const str = safeString(value);
  if (!str) return null;
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function maskIban(value: unknown): string {
  const raw = safeString(value).replace(/\s+/g, '');
  if (raw.length < 8) return raw || 'Onbekend';
  return `${raw.slice(0, 4)}••••••${raw.slice(-4)}`;
}

export function toDateOnly(value: unknown): string {
  const iso = normalizeIsoDate(value);
  if (!iso) return new Date().toISOString().slice(0, 10);
  return iso.slice(0, 10);
}

export function mapConnectionView(input: unknown): BankConnectionView | null {
  const row = input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
  if (!row) return null;
  const id = safeString(row.id);
  if (!id) return null;
  const linkedAccountIds = Array.isArray(row.linked_account_ids) ? row.linked_account_ids : [];
  return {
    id,
    institutionName: safeString(row.institution_name) || null,
    status: safeString(row.status) || 'pending',
    lastSyncedAt: normalizeIsoDate(row.last_synced_at),
    accountCount: linkedAccountIds.length,
  };
}

export function mapAccountView(input: unknown, latestBalanceByAccount: Map<string, { amount: number | null; referenceDate: string | null }>): BankAccountView | null {
  const row = input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
  if (!row) return null;
  const id = safeString(row.id);
  const externalAccountId = safeString(row.external_account_id);
  if (!id || !externalAccountId) return null;
  const latest = latestBalanceByAccount.get(id) || { amount: null, referenceDate: null };
  return {
    id,
    externalAccountId,
    ibanMasked: maskIban(row.iban),
    name: safeString(row.name) || 'Rekening',
    currency: safeString(row.currency) || 'EUR',
    latestBalanceAmount: latest.amount,
    latestBalanceDate: latest.referenceDate,
  };
}

export function mapTransactionView(
  input: unknown,
  accountNameById: Map<string, string>
): BankTransactionView | null {
  const row = input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
  if (!row) return null;
  const id = safeString(row.id);
  const bankAccountId = safeString(row.bank_account_id);
  if (!id || !bankAccountId) return null;
  const amount = safeNumber(row.amount);
  const direction: 'incoming' | 'outgoing' = amount < 0 ? 'outgoing' : 'incoming';
  return {
    id,
    bookingDate: toDateOnly(row.booking_date || row.value_date),
    description: safeString(row.remittance_information) || 'Transactie',
    counterpartyName: safeString(row.counterparty_name) || '-',
    amount,
    currency: safeString(row.currency) || 'EUR',
    direction,
    accountName: accountNameById.get(bankAccountId) || 'Rekening',
    category: safeString(row.category) || 'business',
    status: safeString(row.status) || '-',
  };
}

export function summarizeThisMonth(transactions: BankTransactionView[]): BankOverviewSummary {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  let income = 0;
  let expenses = 0;
  let privateWithdrawals = 0;
  for (const tx of transactions) {
    const date = new Date(tx.bookingDate);
    if (Number.isNaN(date.getTime())) continue;
    if (date.getMonth() !== month || date.getFullYear() !== year) continue;
    if (tx.amount >= 0) income += tx.amount;
    if (tx.amount < 0 && tx.category === 'private') privateWithdrawals += tx.amount;
    if (tx.amount < 0 && tx.category !== 'private') expenses += tx.amount;
  }
  return {
    incomeThisMonth: income,
    expensesThisMonth: expenses,
    privateWithdrawalsThisMonth: privateWithdrawals,
    privateWithdrawalsTotal: 0,
    firstTransactionDate: null,
  };
}
