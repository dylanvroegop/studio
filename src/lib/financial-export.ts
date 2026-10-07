/** Export bewaart bronwaarden; onbekende gegevens worden nooit nul. */
export type FinancialRow = Record<string, unknown>;

export function financialNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function financialDate(value: unknown): string | null {
  if (!value) return null;
  const date = typeof (value as { toDate?: unknown }).toDate === 'function'
    ? (value as { toDate(): Date }).toDate() : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function financialCsv(rows: FinancialRow[], columns: string[]): string {
  const escape = (value: unknown): string => {
    let text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    // Geen uitvoerbare spreadsheetformules in namen of bankomschrijvingen.
    if (typeof value !== 'number' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + [columns.map(escape).join(','), ...rows.map(row => columns.map(key => escape(row[key])).join(','))].join('\r\n');
}

export function normalizeFinancialTransactions(rows: FinancialRow[], accounts: FinancialRow[]): FinancialRow[] {
  const byId = new Map(accounts.map(row => [String(row.id), row]));
  const ownIbans = new Set(accounts.map(row => String(row.iban || '').replace(/\s/g, '').toUpperCase()).filter(Boolean));
  const seen = new Map<string, FinancialRow>();
  return rows.map(row => {
    const account = byId.get(String(row.bank_account_id));
    if (!account) throw new Error('Transactie zonder eigen rekening.');
    const key = `${row.bank_account_id}:${row.external_transaction_id || row.internal_transaction_id || row.id}`;
    const previous = seen.get(key);
    const duplicate = previous ? (previous.amount === row.amount && previous.booking_date === row.booking_date ? 'duplicate' : 'conflict') : '';
    seen.set(key, row);
    const internal = row.category === 'internal' || ownIbans.has(String(row.counterparty_iban || '').replace(/\s/g, '').toUpperCase());
    const amount = financialNumber(row.amount);
    return {
      id: row.id, stable_key: key, transaction_date: row.value_date || null, booking_date: row.booking_date || null,
      amount, currency: row.currency || null, account_id: row.bank_account_id, account_name: account.name,
      account_type: account.account_type || 'unknown', counterparty: row.counterparty_name, description: row.remittance_information,
      source_category: row.category || 'unknown', category: '', subcategory: '', vat_treatment: 'unknown',
      classification: internal ? 'internal' : row.category === 'private' && account.account_type === 'business' ? 'owner_transfer' : row.category || account.account_type || 'unknown',
      recurring: 'unknown', direction: amount === null ? 'unknown' : amount < 0 ? 'expense' : 'income',
      internal_transfer: internal, reconciliation: row.status || 'unknown', notes: '', duplicate_status: duplicate,
      source_hash: row.hash || '', source_updated_at: row.updated_at || null,
    };
  });
}
