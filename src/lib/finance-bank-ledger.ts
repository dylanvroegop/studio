import { isConfirmedCashCost } from '@/lib/finance-cost-visibility';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { inferProjectCostCategory, normalizeProjectCostCategory, roundEuro, type ProjectCostCategory, type ProjectCostRow } from '@/lib/project-costs';
import { categoryOverrideForTransaction, isCremanCounterparty, isFuelCounterparty } from '@/lib/confirmed-bank-categories';

export interface FinanceBankTransaction {
  id: string;
  amount: number;
  booking_date: string | null;
  counterparty_name: string | null;
  description: string | null;
  category?: string | null;
  reconciliation_group_id?: string | null;
  raw?: unknown;
  source_transaction_ids?: string[];
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
  category_override?: ProjectCostCategory;
  is_private: boolean;
  source_cost_ids: string[];
  source_amount: number;
  source_delta: number;
  match_status: 'matched' | 'unmatched' | 'private';
  notes: string | null;
}

interface SplitFinanceBankLedgerRowsByCategoryParams {
  rows: FinanceBankCostLedgerRow[];
  costs: ProjectCostRow[];
  categoryOverrides?: ReadonlyMap<string, ProjectCostCategory>;
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

function withinWindow(cost: ProjectCostRow, left: number, right: number): boolean {
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
    .map((item) => item === 'bouwmaten' ? 'bouwmaat' : item)
    .filter((item) => item.length >= 3 && !SUPPLIER_STOP_WORDS.has(item));
}

function supplierScore(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  // Supplier names are not consistent between imported costs and bank data.
  // For example, "Derkslease" and "Derks Lease B.V." describe the same
  // supplier after legal suffixes and whitespace are removed.
  if (left.join('') === right.join('')) {
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
  if (isCremanCounterparty(transaction.counterparty_name)) return 'schulden';
  if (matchedCosts.length > 0) {
    const categories = matchedCosts.map((cost) => normalizeProjectCostCategory(cost.category));
    const first = categories[0];
    if (first && categories.every((category) => category === first)) return first;
  }
  if (isFuelCounterparty(transaction.counterparty_name, transaction.description)) return 'brandstof';
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

  const transactionRows: Record<string, unknown>[] = [];
  for (;;) {
    const transactionsResult = await supabaseAdmin
      .from('bank_transactions')
      .select('id,amount,booking_date,counterparty_name,description,remittance_information,category,reconciliation_group_id,raw')
      .in('bank_account_id', accountIds)
      .order('booking_date', { ascending: false })
      .order('id', { ascending: true })
      .range(transactionRows.length, transactionRows.length + 499);
    if (transactionsResult.error) throw new Error(`Knab-transacties konden niet worden geladen: ${transactionsResult.error.message}`);
    const page = transactionsResult.data || [];
    transactionRows.push(...page);
    if (page.length < 500) break;
  }
  return transactionRows.map((row) => ({
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

interface KnabHistoryAccount {
  id: string;
  iban: string | null;
  name?: string | null;
  currency?: string | null;
  connection_id?: string;
}

export interface KnabTransactionHistoryMetadata {
  iban: string;
  name: string;
  currency: string;
  connected: boolean;
  lastSyncedAt: string | null;
  firstBookingDate: string | null;
  lastBookingDate: string | null;
  historicalAccountCount: number;
  sourceTransactionCount: number;
  transactionCount: number;
  duplicateTransactionCount: number;
  unidentifiedTransactionCount: number;
}

export interface KnabTransactionHistory {
  transactions: FinanceBankTransaction[];
  metadata: KnabTransactionHistoryMetadata;
}

function normalizedIban(value: unknown): string {
  return text(value).replace(/\s/g, '').toUpperCase();
}

/** Alleen bankidentiteiten ontdubbelen; gelijke bedragen op dezelfde dag blijven aparte betalingen. */
export function selectKnabTransactionHistory(params: {
  accounts: KnabHistoryAccount[];
  rows: Record<string, unknown>[];
  preferredAccountIds?: readonly string[];
  iban?: string;
}): KnabTransactionHistory {
  const accounts = params.accounts.filter((account) => /^NL\d{2}KNAB\d{10}$/.test(normalizedIban(account.iban)));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const availableRows = params.rows.filter((row) => accountById.has(text(row.bank_account_id)));
  const populatedIbans = new Set(availableRows.map((row) => normalizedIban(accountById.get(text(row.bank_account_id))?.iban)));
  const requestedIban = normalizedIban(params.iban);
  if (!requestedIban && populatedIbans.size > 1) {
    throw new Error('Er zijn transacties van meerdere Knab-rekeningen. Kies één rekening om de afschrijvingen te vergelijken.');
  }
  const iban = requestedIban || Array.from(populatedIbans)[0]
    || (new Set(accounts.map((account) => normalizedIban(account.iban))).size === 1 ? normalizedIban(accounts[0]?.iban) : '');
  const matchingAccounts = accounts.filter((account) => normalizedIban(account.iban) === iban);
  if (!iban || matchingAccounts.length === 0) {
    throw new Error('Er is geen opgeslagen Knab-rekening met transacties gevonden. Synchroniseer Knab eerst.');
  }

  const preferredRank = new Map((params.preferredAccountIds || []).map((id, index) => [id, index]));
  const rank = (id: string): number => preferredRank.get(id) ?? Number.MAX_SAFE_INTEGER;
  matchingAccounts.sort((left, right) => rank(left.id) - rank(right.id) || left.id.localeCompare(right.id));
  const accountIds = new Set(matchingAccounts.map((account) => account.id));
  const rows = availableRows.filter((row) => accountIds.has(text(row.bank_account_id))).sort((left, right) => (
    rank(text(left.bank_account_id)) - rank(text(right.bank_account_id)) || text(left.id).localeCompare(text(right.id))
  ));
  const seen = new Map<string, Record<string, unknown>>();
  const sourceIds = new Map<string, Set<string>>();
  let unidentifiedTransactionCount = 0;
  for (const row of rows) {
    const amount = Number(row.amount);
    if (!text(row.id) || !Number.isFinite(amount) || row.amount === null || row.amount === '') {
      throw new Error('Een opgeslagen Knab-transactie heeft geen geldig bedrag of kenmerk.');
    }
    const raw = row.raw && typeof row.raw === 'object' ? row.raw as Record<string, unknown> : {};
    const entryReference = text(raw.entry_reference);
    const transactionId = text(raw.transaction_id);
    // De importfallback is een hash van betalingsgegevens, geen uniek bankbewijs.
    // Zonder bankkenmerk bewaren we de rij; nooit twee echte gelijke betalingen samenvoegen.
    const identity = entryReference ? `entry:${entryReference}`
      : transactionId ? `transaction:${transactionId}` : `stored:${text(row.id)}`;
    const key = `${iban}:${identity}`;
    if (!sourceIds.has(key)) sourceIds.set(key, new Set());
    sourceIds.get(key)!.add(text(row.id));
    const existing = seen.get(key);
    if (existing) {
      const currency = text(row.currency) || text(matchingAccounts[0].currency) || 'EUR';
      const existingCurrency = text(existing.currency) || text(matchingAccounts[0].currency) || 'EUR';
      if (cents(Number(existing.amount)) !== cents(amount) || text(existing.booking_date) !== text(row.booking_date) || currency !== existingCurrency) {
        throw new Error('Hetzelfde Knab-bankkenmerk heeft afwijkende boekingsgegevens. Controleer de bankimport.');
      }
      continue;
    }
    if (!entryReference && !transactionId) unidentifiedTransactionCount += 1;
    seen.set(key, row);
  }
  const transactions = Array.from(seen.entries()).map(([key, row]): FinanceBankTransaction => ({
    id: text(row.id),
    amount: Number(row.amount),
    booking_date: text(row.booking_date) || null,
    counterparty_name: text(row.counterparty_name) || null,
    description: text(row.description) || text(row.remittance_information) || null,
    category: text(row.category) || null,
    reconciliation_group_id: text(row.reconciliation_group_id) || null,
    raw: row.raw,
    source_transaction_ids: Array.from(sourceIds.get(key) || []).sort(),
  })).sort((left, right) => (right.booking_date || '').localeCompare(left.booking_date || '') || left.id.localeCompare(right.id));
  const dates = transactions.map((row) => row.booking_date).filter((date): date is string => Boolean(date)).sort();
  return {
    transactions,
    metadata: {
      iban,
      name: text(matchingAccounts[0].name) || 'Knab',
      currency: text(matchingAccounts[0].currency) || 'EUR',
      connected: false,
      lastSyncedAt: null,
      firstBookingDate: dates[0] || null,
      lastBookingDate: dates[dates.length - 1] || null,
      historicalAccountCount: matchingAccounts.length,
      sourceTransactionCount: rows.length,
      transactionCount: transactions.length,
      duplicateTransactionCount: rows.length - transactions.length,
      unidentifiedTransactionCount,
    },
  };
}

/** Alle bewaarde koppelingen van dezelfde fysieke Knab-rekening, zonder facturen of andere banken. */
export async function loadKnabTransactionHistory(
  bankUserId: string,
  options: { iban?: string } = {},
): Promise<KnabTransactionHistory> {
  const connectionResult = await supabaseAdmin.from('bank_connections')
    .select('id,status,linked_account_ids,last_synced_at,updated_at')
    .eq('provider', 'enablebanking').eq('user_id', bankUserId)
    .order('updated_at', { ascending: false });
  if (connectionResult.error) throw new Error(`Knab-koppelingen konden niet worden geladen: ${connectionResult.error.message}`);
  const connections = connectionResult.data || [];
  if (connections.length === 0) throw new Error('Er is nog geen opgeslagen Knab-koppeling gevonden.');
  const accountResult = await supabaseAdmin.from('bank_accounts')
    .select('id,iban,name,currency,connection_id')
    .in('connection_id', connections.map((connection) => String(connection.id)));
  if (accountResult.error) throw new Error(`Knab-rekeningen konden niet worden geladen: ${accountResult.error.message}`);
  const accounts: KnabHistoryAccount[] = (accountResult.data || []).map((account) => ({
    id: text(account.id),
    iban: text(account.iban) || null,
    name: text(account.name) || null,
    currency: text(account.currency) || null,
    connection_id: text(account.connection_id),
  })).filter((account) => (
    /^NL\d{2}KNAB\d{10}$/.test(normalizedIban(account.iban))
    && (!options.iban || normalizedIban(account.iban) === normalizedIban(options.iban))
  ));
  if (accounts.length === 0) throw new Error('Er is geen opgeslagen Knab-rekening gevonden.');
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await supabaseAdmin.from('bank_transactions')
      .select('id,bank_account_id,amount,currency,booking_date,counterparty_name,description,remittance_information,category,reconciliation_group_id,raw')
      .eq('user_id', bankUserId).in('bank_account_id', accounts.map((account) => account.id))
      .order('booking_date', { ascending: false }).order('id', { ascending: true })
      .range(offset, offset + 499);
    if (result.error) throw new Error(`Knab-transacties konden niet worden geladen: ${result.error.message}`);
    rows.push(...(result.data || []));
    if ((result.data || []).length < 500) break;
  }
  // Een huidige rij behoudt zijn id voor bestaande koppelingen. Oudere periodes
  // komen uit de meest recente koppeling die ze nog bewaart.
  const preferredConnections = [...connections].sort((left, right) => Number(right.status === 'connected') - Number(left.status === 'connected'));
  const preferredAccountIds = preferredConnections.flatMap((connection) => accounts
    .filter((account) => account.connection_id === String(connection.id)).map((account) => account.id));
  const result = selectKnabTransactionHistory({ accounts, rows, preferredAccountIds, iban: options.iban });
  const selectedConnectionIds = new Set(accounts.filter((account) => normalizedIban(account.iban) === result.metadata.iban)
    .map((account) => account.connection_id));
  const selectedConnections = connections.filter((connection) => selectedConnectionIds.has(String(connection.id)));
  result.metadata.connected = selectedConnections.some((connection) => connection.status === 'connected');
  result.metadata.lastSyncedAt = selectedConnections.map((connection) => text(connection.last_synced_at)).filter(Boolean).sort().at(-1) || null;
  return result;
}

interface PreparedCost {
  cost: ProjectCostRow;
  amount: number;
  supplierTokens: string[];
  references: string[];
  documentKey: string | null;
  date: number;
}

function matchSources(
  transaction: FinanceBankTransaction,
  costs: PreparedCost[],
  usedCosts: Set<string>,
): ProjectCostRow[] {
  const target = cents(Math.abs(transaction.amount));
  if (target <= 0) return [];

  // A persisted payment link is stronger evidence than any rematching
  // heuristic. Reuse every category row belonging to that payment so mixed
  // invoices remain complete and cannot silently lose tool/material lines.
  const explicitlyLinkedCosts = costs.filter(({ cost }) =>
    !usedCosts.has(cost.id)
    && (cost.paid_bank_transaction_id === transaction.id
      || Boolean(cost.paid_bank_transaction_id && transaction.source_transaction_ids?.includes(cost.paid_bank_transaction_id)))
  ).map(({ cost }) => cost);
  if (explicitlyLinkedCosts.length > 0) {
    explicitlyLinkedCosts.forEach((cost) => usedCosts.add(cost.id));
    return explicitlyLinkedCosts;
  }

  // Supplier collections include their invoice/credit-note numbers in the
  // Knab description. Those identifiers are authoritative. Never replace an
  // identifier match with an unrelated combination that merely has the same
  // total amount.
  const transactionRefs = documentReferences(`${transaction.counterparty_name || ''} ${transaction.description || ''}`);
  const transactionTokens = tokens(`${transaction.counterparty_name || ''} ${transaction.description || ''}`);
  if (transactionRefs.length > 0) {
    const referencedCosts = costs.filter(({ cost, references, supplierTokens }) =>
      !usedCosts.has(cost.id)
      && references.some((reference) => transactionRefs.includes(reference))
      && supplierScore(supplierTokens, transactionTokens) > 0
    ).map(({ cost }) => cost);
    if (referencedCosts.length > 0) {
      referencedCosts.forEach((cost) => usedCosts.add(cost.id));
      return referencedCosts;
    }
    // A referenced document has not been imported yet. Keep the bank row
    // unmatched so the missing PDF is visible; guessing would corrupt links.
    return [];
  }

  const transactionDate = dateTime(transaction.booking_date);
  const scoredCosts = costs
    .filter(({ cost, amount }) => !usedCosts.has(cost.id) && amount > 0)
    .map((entry) => ({ ...entry, score: supplierScore(entry.supplierTokens, transactionTokens) }))
    .filter(({ score }) => score > 0);
  const candidates = scoredCosts
    .filter(({ cost, date }) => withinWindow(cost, date, transactionDate))
    .sort((left, right) => right.score - left.score || Math.abs(left.date - transactionDate) - Math.abs(right.date - transactionDate));

  const exactSingle = candidates.find((candidate) => candidate.amount === target);
  if (exactSingle) {
    usedCosts.add(exactSingle.cost.id);
    return [exactSingle.cost];
  }

  // Some historical invoice dates were entered after the actual card debit.
  // If there is exactly one unused cost with the same amount and supplier,
  // link it even when the normal date window cannot be applied. This is still
  // deterministic and prevents importing a duplicate cost row.
  const uniqueHistoricalExact = scoredCosts
    .filter(({ amount, score }) => amount === target && score >= 0.5);
  if (uniqueHistoricalExact.length === 1) {
    usedCosts.add(uniqueHistoricalExact[0].cost.id);
    return [uniqueHistoricalExact[0].cost];
  }

  // Split category rows may represent one receipt/PDF. Group only rows that
  // share that document identity; never combine unrelated costs by amount.
  const documentGroups = new Map<string, ProjectCostRow[]>();
  candidates.forEach(({ cost, documentKey: key }) => {
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
  // Normalize supplier/document/date metadata once, not for every possible
  // cost/payment pair. Matching order and authoritative payment links stay
  // unchanged, including mixed-category invoices and credit notes.
  const preparedCosts = params.costs.filter((cost) => !isConfirmedCashCost(cost)).map((cost): PreparedCost => ({
    cost,
    amount: sourceAmount(cost),
    supplierTokens: tokens(cost.supplier_name),
    references: costDocumentReferences(cost),
    documentKey: costDocumentKey(cost),
    date: dateTime(cost.date),
  }));
  return params.transactions
    .filter((transaction) => Number(transaction.amount) < 0 && !isInternalOwnAccountTransfer(transaction))
    .sort((left, right) => dateTime(right.booking_date) - dateTime(left.booking_date))
    .map((transaction) => {
      const privateTransaction = isPrivate(transaction);
      const amount = roundEuro(Math.abs(Number(transaction.amount) || 0));
      const matchedCosts = privateTransaction ? [] : matchSources(transaction, preparedCosts, usedCosts);
      const categoryOverride = categoryOverrideForTransaction(transaction, params.categoryOverrides);
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
        ...(categoryOverride ? { category_override: categoryOverride } : {}),
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

/**
 * A single Knab debit can pay one invoice that contains multiple cost
 * categories. Keep Knab as the amount truth, but expose proportional category
 * parts so material and tools do not disappear into one arbitrary category.
 * A manual bank-category override deliberately keeps the transaction whole.
 */
export function splitFinanceBankLedgerRowsByCategory(
  params: SplitFinanceBankLedgerRowsByCategoryParams,
): FinanceBankCostLedgerRow[] {
  const costById = new Map(params.costs.map((cost) => [cost.id, cost]));

  return params.rows.flatMap((row) => {
    if (
      row.is_private
      || row.match_status !== 'matched'
      || params.categoryOverrides?.has(row.bank_transaction_id)
    ) {
      return [row];
    }

    const groups = new Map<ProjectCostCategory, ProjectCostRow[]>();
    row.source_cost_ids.forEach((costId) => {
      const cost = costById.get(costId);
      if (!cost) return;
      const category = normalizeProjectCostCategory(cost.category);
      groups.set(category, [...(groups.get(category) || []), cost]);
    });
    if (groups.size <= 1) return [row];

    const orderedGroups = Array.from(groups.entries());
    const sourceTotalCents = orderedGroups.reduce(
      (sum, [, groupCosts]) => sum + groupCosts.reduce((groupSum, cost) => groupSum + sourceAmount(cost), 0),
      0,
    );
    const bankTotalCents = cents(row.amount);
    if (sourceTotalCents <= 0 || bankTotalCents <= 0) return [row];

    let allocatedBankCents = 0;
    return orderedGroups.map(([category, groupCosts], index) => {
      const groupSourceCents = groupCosts.reduce((sum, cost) => sum + sourceAmount(cost), 0);
      const isLast = index === orderedGroups.length - 1;
      const groupBankCents = isLast
        ? bankTotalCents - allocatedBankCents
        : Math.round((bankTotalCents * groupSourceCents) / sourceTotalCents);
      allocatedBankCents += groupBankCents;
      const amount = euroFromCents(groupBankCents);
      const groupSourceAmount = euroFromCents(groupSourceCents);

      return {
        ...row,
        amount,
        category,
        source_cost_ids: groupCosts.map((cost) => cost.id),
        source_amount: groupSourceAmount,
        source_delta: roundEuro(groupSourceAmount - amount),
        notes: `Knab-afschrijving verdeeld over ${groups.size} kostenregelcategorieën; dit deel is ${category}.`,
      } satisfies FinanceBankCostLedgerRow;
    });
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
