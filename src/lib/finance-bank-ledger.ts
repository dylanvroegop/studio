import { supabaseAdmin } from '@/lib/supabase-admin';
import { inferProjectCostCategory, normalizeProjectCostCategory, roundEuro, type ProjectCostCategory, type ProjectCostRow } from '@/lib/project-costs';

export interface FinanceBankTransaction {
  id: string;
  amount: number;
  booking_date: string | null;
  counterparty_name: string | null;
  description: string | null;
  category?: string | null;
  reconciliation_group_id?: string | null;
  raw?: unknown;
}

export interface FinanceBankCostLedgerRow {
  [key: string]: unknown;
  user_id: string;
  bank_transaction_id: string;
  booking_date: string | null;
  supplier_name: string;
  description: string;
  amount: number;
  category: ProjectCostCategory;
  is_private: boolean;
  source_cost_ids: string[];
  source_amount: number;
  source_delta: number;
  match_status: 'matched' | 'unmatched' | 'private';
  notes: string | null;
}

const PRIVATE_RE = /top-?up\s+via\s+bunq|paypal\s+top-?up/i;
const SUPPLIER_STOP_WORDS = new Set(['bck', 'via', 'europ', 'europe', 'bv', 'b', 'v', 'stichting', 'derden', 'gelden', 'payment', 'payments', 'online']);

function cents(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100);
}

function euroFromCents(value: number): number {
  return roundEuro(value / 100);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedText(value: unknown): string {
  return text(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function dateTime(value: string | null): number {
  if (!value) return Number.NaN;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function withinWindow(cost: ProjectCostRow, transactionDate: string | null): boolean {
  if (!transactionDate) return true;
  const left = dateTime(cost.date);
  const right = dateTime(transactionDate);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return true;
  // An invoice is normally collected after its invoice date. Do not let a
  // later-imported invoice attach to an older, unrelated bank payment.
  if (cost.payment_type === 'factuur') {
    return right >= left - 1 * 86400000 && right <= left + 90 * 86400000;
  }
  // Receipts can be entered a few days after the card payment, while a
  // manually entered cost may be dated shortly before the payment.
  return right >= left - 3 * 86400000 && right <= left + 14 * 86400000;
}

function tokens(value: string): string[] {
  return normalizedText(value)
    .split(' ')
    .filter((item) => item.length >= 3 && !SUPPLIER_STOP_WORDS.has(item));
}

function compactSupplier(value: string): string {
  return tokens(value).join('');
}

function supplierScore(cost: ProjectCostRow, transaction: FinanceBankTransaction): number {
  const left = tokens(cost.supplier_name);
  const right = tokens(`${transaction.counterparty_name || ''} ${transaction.description || ''}`);
  if (left.length === 0 || right.length === 0) return 0;
  // Supplier names are not consistent between imported costs and bank data.
  // For example, "Derkslease" and "Derks Lease B.V." describe the same
  // supplier after legal suffixes and whitespace are removed.
  if (compactSupplier(cost.supplier_name) === compactSupplier(`${transaction.counterparty_name || ''} ${transaction.description || ''}`)) {
    return 1;
  }
  const matches = left.filter((token) => right.some((candidate) => candidate.includes(token) || token.includes(candidate)));
  if (matches.length === 0) return 0;
  return matches.length / Math.max(1, Math.min(left.length, 3));
}

function isPrivate(transaction: FinanceBankTransaction): boolean {
  return Boolean(transaction.category === 'private' || PRIVATE_RE.test(`${transaction.counterparty_name || ''} ${transaction.description || ''}`));
}

export function isInternalOwnAccountTransfer(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const transaction = input as Record<string, unknown>;
  if (Number(transaction.amount) >= 0) return false;
  const raw = transaction.raw && typeof transaction.raw === 'object'
    ? transaction.raw as Record<string, unknown>
    : null;
  const codeRecord = raw?.bank_transaction_code && typeof raw.bank_transaction_code === 'object'
    ? raw.bank_transaction_code as Record<string, unknown>
    : null;
  const creditorAccount = raw?.creditor_account && typeof raw.creditor_account === 'object'
    ? raw.creditor_account as Record<string, unknown>
    : null;
  const creditorOther = creditorAccount?.other && typeof creditorAccount.other === 'object'
    ? creditorAccount.other as Record<string, unknown>
    : null;
  const destinationIdentifier = text(creditorAccount?.iban) || text(creditorOther?.identification);
  const counterpartyName = text(transaction.counterparty_name)
    || (raw?.creditor && typeof raw.creditor === 'object' ? text((raw.creditor as Record<string, unknown>).name) : '');

  return /outgoing transfer/i.test(text(codeRecord?.code))
    && /vroegop\s+timmerwerken/i.test(counterpartyName)
    && destinationIdentifier.length > 0;
}

export function isProfitAccountTransfer(input: unknown): boolean {
  if (!isInternalOwnAccountTransfer(input) || !input || typeof input !== 'object') return false;
  const transaction = input as Record<string, unknown>;
  const raw = transaction.raw && typeof transaction.raw === 'object'
    ? transaction.raw as Record<string, unknown>
    : null;
  const creditorAccount = raw?.creditor_account && typeof raw.creditor_account === 'object'
    ? raw.creditor_account as Record<string, unknown>
    : null;
  const creditorOther = creditorAccount?.other && typeof creditorAccount.other === 'object'
    ? creditorAccount.other as Record<string, unknown>
    : null;
  const destinationIdentifier = (text(creditorAccount?.iban) || text(creditorOther?.identification))
    .replace(/\s+/g, '')
    .toUpperCase();

  // The user's Knab profit account is supplied as a BBAN by Enable Banking.
  return destinationIdentifier.endsWith('38946794');
}

function classify(transaction: FinanceBankTransaction, matchedCosts: ProjectCostRow[]): ProjectCostCategory {
  if (matchedCosts.length > 0) {
    const categories = matchedCosts.map((cost) => normalizeProjectCostCategory(cost.category));
    const first = categories[0];
    if (first && categories.every((category) => category === first)) return first;
  }
  return inferProjectCostCategory({
    supplierName: transaction.counterparty_name || '',
    description: transaction.description || '',
  });
}

function sourceAmount(cost: ProjectCostRow): number {
  return cents(Number(cost.amount_incl_btw) || Number((cost as unknown as Record<string, unknown>).material_cost_incl_btw) || 0);
}

function documentReferences(value: string): string[] {
  return Array.from(new Set(
    normalizedText(value)
      .match(/\b\d{4}\s*vf\s*\d+\b/g)
      ?.map((item) => item.replace(/\s+/g, '')) || [],
  ));
}

function costDocumentReferences(cost: ProjectCostRow): string[] {
  return documentReferences([
    cost.supplier_order_number,
    cost.supplier_invoice_number,
    cost.reconciliation_group_id,
    cost.source_filename,
    cost.description,
    ...cost.receipt_files.map((file) => file.filename),
  ].filter(Boolean).join(' '));
}

function costDocumentKey(cost: ProjectCostRow): string | null {
  const reference = costDocumentReferences(cost)[0];
  if (reference) return `reference:${reference}`;
  const filename = cost.source_filename || cost.receipt_files[0]?.filename || '';
  if (filename) return `file:${normalizedText(filename)}`;
  if (cost.supplier_invoice_number) return `invoice:${normalizedText(cost.supplier_invoice_number)}`;
  if (cost.supplier_order_number && !cost.supplier_order_number.startsWith('kost-')) {
    return `order:${normalizedText(cost.supplier_order_number)}`;
  }
  return null;
}

function sourceDocumentCount(costs: ProjectCostRow[]): number {
  return new Set(costs.map((cost) => costDocumentKey(cost) || `cost:${cost.id}`)).size;
}

/**
 * Load only the currently connected Enable Banking account(s). The derived
 * bank user id is shared with legacy bunq imports, so filtering transactions
 * by bank_transactions.user_id would silently mix private and Knab data.
 */
export async function loadConnectedKnabTransactions(bankUserId: string): Promise<FinanceBankTransaction[]> {
  const connectionResult = await supabaseAdmin
    .from('bank_connections')
    .select('id,linked_account_ids')
    .eq('provider', 'enablebanking')
    .eq('user_id', bankUserId)
    .eq('status', 'connected')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (connectionResult.error) throw new Error(`Knab-koppeling kon niet worden geladen: ${connectionResult.error.message}`);
  if (!connectionResult.data?.id) throw new Error('Er is nog geen actieve Knab-koppeling gevonden. Koppel Knab eerst opnieuw.');

  const linkedAccountIds = Array.isArray(connectionResult.data.linked_account_ids)
    ? connectionResult.data.linked_account_ids.map((id) => String(id)).filter(Boolean)
    : [];
  const accountsResult = linkedAccountIds.length > 0
    ? await supabaseAdmin.from('bank_accounts').select('id').in('id', linkedAccountIds)
    : await supabaseAdmin.from('bank_accounts').select('id').eq('connection_id', connectionResult.data.id);
  if (accountsResult.error) throw new Error(`Knab-rekening kon niet worden geladen: ${accountsResult.error.message}`);
  const accountIds = (accountsResult.data || []).map((row) => String(row.id)).filter(Boolean);
  if (accountIds.length === 0) throw new Error('De actieve Knab-koppeling heeft nog geen rekening. Synchroniseer Knab eerst.');

  const transactionsResult = await supabaseAdmin
    .from('bank_transactions')
    .select('id,amount,booking_date,counterparty_name,description,remittance_information,category,reconciliation_group_id,raw')
    .in('bank_account_id', accountIds)
    .order('booking_date', { ascending: false });
  if (transactionsResult.error) throw new Error(`Knab-transacties konden niet worden geladen: ${transactionsResult.error.message}`);
  return (transactionsResult.data || []).map((row) => ({
    id: String(row.id),
    amount: Number(row.amount) || 0,
    booking_date: typeof row.booking_date === 'string' ? row.booking_date : null,
    counterparty_name: typeof row.counterparty_name === 'string' ? row.counterparty_name : null,
    description: (typeof row.description === 'string' && row.description.trim())
      ? row.description
      : typeof row.remittance_information === 'string' ? row.remittance_information : null,
    category: typeof row.category === 'string' ? row.category : null,
    reconciliation_group_id: typeof row.reconciliation_group_id === 'string' ? row.reconciliation_group_id : null,
    raw: row.raw,
  }));
}

function matchSources(
  transaction: FinanceBankTransaction,
  costs: ProjectCostRow[],
  usedCosts: Set<string>,
): ProjectCostRow[] {
  const target = cents(Math.abs(transaction.amount));
  if (target <= 0) return [];

  // Supplier collections include their invoice/credit-note numbers in the
  // Knab description. Those identifiers are authoritative. Never replace an
  // identifier match with an unrelated combination that merely has the same
  // total amount.
  const transactionRefs = documentReferences(`${transaction.counterparty_name || ''} ${transaction.description || ''}`);
  if (transactionRefs.length > 0) {
    const referencedCosts = costs.filter((cost) =>
      !usedCosts.has(cost.id)
      && supplierScore(cost, transaction) > 0
      && costDocumentReferences(cost).some((reference) => transactionRefs.includes(reference))
    );
    if (referencedCosts.length > 0) {
      referencedCosts.forEach((cost) => usedCosts.add(cost.id));
      return referencedCosts;
    }
    // A referenced document has not been imported yet. Keep the bank row
    // unmatched so the missing PDF is visible; guessing would corrupt links.
    return [];
  }

  const candidates = costs
    .map((cost, index) => ({ cost, index, amount: sourceAmount(cost), score: supplierScore(cost, transaction) }))
    .filter(({ cost, amount, score }) => !usedCosts.has(cost.id) && amount > 0 && score > 0 && withinWindow(cost, transaction.booking_date))
    .sort((left, right) => right.score - left.score || Math.abs(dateTime(left.cost.date) - dateTime(transaction.booking_date)) - Math.abs(dateTime(right.cost.date) - dateTime(transaction.booking_date)));

  const exactSingle = candidates.find((candidate) => candidate.amount === target);
  if (exactSingle) {
    usedCosts.add(exactSingle.cost.id);
    return [exactSingle.cost];
  }

  // Some historical invoice dates were entered after the actual card debit.
  // If there is exactly one unused cost with the same amount and supplier,
  // link it even when the normal date window cannot be applied. This is still
  // deterministic and prevents importing a duplicate cost row.
  const uniqueHistoricalExact = costs
    .map((cost) => ({ cost, amount: sourceAmount(cost), score: supplierScore(cost, transaction) }))
    .filter(({ cost, amount, score }) => !usedCosts.has(cost.id) && amount === target && score >= 0.5);
  if (uniqueHistoricalExact.length === 1) {
    usedCosts.add(uniqueHistoricalExact[0].cost.id);
    return [uniqueHistoricalExact[0].cost];
  }

  // Split category rows may represent one receipt/PDF. Group only rows that
  // share that document identity; never combine unrelated costs by amount.
  const documentGroups = new Map<string, ProjectCostRow[]>();
  candidates.forEach(({ cost }) => {
    const key = costDocumentKey(cost);
    if (!key) return;
    documentGroups.set(key, [...(documentGroups.get(key) || []), cost]);
  });
  const exactGroups = Array.from(documentGroups.values()).filter((group) =>
    Math.abs(group.reduce((sum, cost) => sum + sourceAmount(cost), 0) - target) <= 1
  );
  if (exactGroups.length !== 1) return [];
  exactGroups[0].forEach((cost) => usedCosts.add(cost.id));
  return exactGroups[0];
}

export function buildFinanceBankLedger(params: {
  userId: string;
  transactions: FinanceBankTransaction[];
  costs: ProjectCostRow[];
  categoryOverrides?: ReadonlyMap<string, ProjectCostCategory>;
}): FinanceBankCostLedgerRow[] {
  const usedCosts = new Set<string>();
  return params.transactions
    .filter((transaction) => Number(transaction.amount) < 0 && !isInternalOwnAccountTransfer(transaction))
    .sort((left, right) => dateTime(right.booking_date) - dateTime(left.booking_date))
    .map((transaction) => {
      const privateTransaction = isPrivate(transaction);
      const amount = roundEuro(Math.abs(Number(transaction.amount) || 0));
      const matchedCosts = privateTransaction ? [] : matchSources(transaction, params.costs, usedCosts);
      const categoryOverride = params.categoryOverrides?.get(transaction.id);
      const sourceAmountTotal = roundEuro(matchedCosts.reduce((sum, cost) => sum + Number(cost.amount_incl_btw || 0), 0));
      const documentCount = sourceDocumentCount(matchedCosts);
      const supplierName = text(transaction.counterparty_name) || 'Onbekende tegenpartij';
      return {
        user_id: params.userId,
        bank_transaction_id: transaction.id,
        booking_date: transaction.booking_date,
        supplier_name: supplierName,
        description: text(transaction.description) || 'Bankafschrijving',
        amount,
        category: privateTransaction ? 'overig' : categoryOverride || classify(transaction, matchedCosts),
        is_private: privateTransaction,
        source_cost_ids: matchedCosts.map((cost) => cost.id),
        source_amount: sourceAmountTotal,
        source_delta: roundEuro(sourceAmountTotal - amount),
        match_status: privateTransaction ? 'private' : matchedCosts.length > 0 ? 'matched' : 'unmatched',
        notes: matchedCosts.length > 0
          ? `${documentCount} brondocument${documentCount === 1 ? '' : 'en'} gekoppeld${matchedCosts.length === documentCount ? '' : ` (${matchedCosts.length} kostenregels)`}; Knab-bedrag is leidend.`
          : privateTransaction ? 'Privé-top-up uitgesloten van zakelijke kosten.' : 'Geen exact bronbedrag gevonden; Knab-bedrag blijft leidend.',
      } satisfies FinanceBankCostLedgerRow;
    });
}

export async function persistFinanceBankLedger(rows: FinanceBankCostLedgerRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabaseAdmin
    .from('finance_bank_costs')
    .upsert(rows, { onConflict: 'user_id,bank_transaction_id' });
  if (error) throw new Error(`Knab-kasboek kon niet worden opgeslagen: ${error.message}`);
}

async function persistProjectCostMatches(userId: string, rows: FinanceBankCostLedgerRow[]): Promise<void> {
  const resetResult = await supabaseAdmin
    .from('project_costs')
    .update({
      reconciliation_status: 'unmatched',
      paid_bank_transaction_id: null,
      paid_at: null,
    })
    .eq('user_id', userId);
  if (resetResult.error) throw new Error(`Kosten-koppelingen konden niet worden ververst: ${resetResult.error.message}`);

  const matchedByCost = new Map<string, FinanceBankCostLedgerRow>();
  rows.forEach((row) => row.source_cost_ids.forEach((costId) => matchedByCost.set(costId, row)));
  const entries = Array.from(matchedByCost.entries());
  for (let offset = 0; offset < entries.length; offset += 100) {
    const chunk = entries.slice(offset, offset + 100);
    for (const [costId, row] of chunk) {
      const updateResult = await supabaseAdmin
        .from('project_costs')
        .update({
          reconciliation_status: 'matched',
          paid_bank_transaction_id: row.bank_transaction_id,
          paid_at: row.booking_date,
          payment_status: 'paid',
        })
        .eq('user_id', userId)
        .eq('id', costId);
      if (updateResult.error) throw new Error(`Kosten-koppeling kon niet worden opgeslagen: ${updateResult.error.message}`);
    }
  }
}

export async function reconcileFinanceBankLedger(params: {
  userId: string;
  costs: ProjectCostRow[];
  transactions: FinanceBankTransaction[];
}): Promise<{ rows: FinanceBankCostLedgerRow[]; matchedCostIds: string[] }> {
  const rows = buildFinanceBankLedger(params);
  await persistFinanceBankLedger(rows);
  await persistProjectCostMatches(params.userId, rows);
  const matched = rows.flatMap((row) => row.source_cost_ids);
  return { rows, matchedCostIds: matched };
}
