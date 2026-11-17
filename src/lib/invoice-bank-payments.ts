import 'server-only';

import { createHash } from 'crypto';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  findQuoteAdvanceCandidates, findInvoiceBankCandidates, invoiceBankCents, invoiceBankLinkedCents, isInvoiceBankVerified,
  validateInvoiceBankAllocation, type BankMatchInvoice, type InvoiceBankAllocation,
  type InvoiceBankCredit, type InvoiceBankView,
} from '@/lib/invoice-bank-matching';

export class InvoiceBankError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function dateOnly(value: unknown): string | null {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
  }
  const candidate = value && typeof value === 'object' && 'toDate' in value
    ? (value as { toDate(): Date }).toDate() : typeof value === 'string' ? new Date(value) : null;
  return candidate && Number.isFinite(candidate.getTime())
    ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(candidate)
    : null;
}
const INVOICE_PAYMENT_FIELDS = ['userId', 'invoiceNumberLabel', 'status', 'totalsSnapshot', 'paymentSummary',
  'issueDate', 'invoiceType', 'sourceQuote.offerteNummer', 'sourceQuote.datum', 'sourceQuote.klantSnapshot.naam', 'quoteId', 'combinedQuoteIds', 'combinedContext', 'paidAt'];
function toInvoice(id: string, data: Record<string, unknown>): BankMatchInvoice {
  const source = record(data.sourceQuote);
  const totalCents = Math.max(0, invoiceBankCents(record(data.totalsSnapshot).totaalInclBtw));
  const paid = record(data.paymentSummary).paidAmount;
  return {
    id, userId: text(data.userId), reference: text(data.invoiceNumberLabel), status: text(data.status),
    totalCents, paidCents: paid == null && data.status === 'betaald' ? totalCents : Math.max(0, invoiceBankCents(paid)),
    invoiceType: text(data.invoiceType), quoteNumber: String(source.offerteNummer || ''), quoteDate: dateOnly(source.datum),
    issueDate: dateOnly(data.issueDate), clientName: text(record(source.klantSnapshot).naam),
  };
}
function allocationRows(value: unknown, activeIds: Set<string>): InvoiceBankAllocation[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is InvoiceBankAllocation => Boolean(item && typeof item === 'object'
    && typeof item.invoiceId === 'string' && Number.isSafeInteger(item.amountCents) && item.amountCents > 0
    && (item.mode === 'add' || item.mode === 'link' || (item.mode === 'advance' && activeIds.has(item.invoiceId)))));
}
function allocationCollection(firestore: Firestore, uid: string) {
  // Geen clientregels voor deze subcollectie: uitsluitend server beheert toewijzingen.
  return firestore.collection('users').doc(uid).collection('invoiceBankAllocations');
}

function bankDescription(row: Record<string, unknown>): string {
  const raw = record(row.raw);
  const remittance = raw.remittance_information;
  const fields = [row.description, row.remittance_information, ...(Array.isArray(remittance) ? remittance : [remittance]),
    raw.note, raw.end_to_end_id, raw.creditor_reference, record(raw.debtor).name];
  return [...new Set(fields.map(text).filter(Boolean))].join(' · ');
}

interface BankContext {
  connected: boolean;
  lastSyncedAt: string | null;
  credits: InvoiceBankCredit[];
}

async function loadBankContext(bankUserId: string): Promise<BankContext> {
  const connections = await supabaseAdmin.from('bank_connections')
    .select('id,status,last_synced_at,provider,institution_name').eq('user_id', bankUserId)
    .order('updated_at', { ascending: false });
  if (connections.error) throw new InvoiceBankError('Knab-koppeling kon niet worden gelezen.', 503);
  const knab = (connections.data || []).filter((item) => item.provider === 'enablebanking' && /\bknab\b/i.test(text(item.institution_name)));
  const connection = knab.find((item) => item.status === 'connected');
  if (!connection) return { connected: false, lastSyncedAt: null, credits: [] };
  const accounts = await supabaseAdmin.from('bank_accounts').select('id,iban,connection_id')
    .in('connection_id', (connections.data || []).map((item) => String(item.id)));
  if (accounts.error) throw new InvoiceBankError('Knab-rekeningen konden niet worden gelezen.', 503);
  const accountIds = (accounts.data || []).filter((item) => item.connection_id === connection.id).map((item) => String(item.id));
  const ownIbans = new Set((accounts.data || []).map((item) => text(item.iban).replace(/\s/g, '').toUpperCase()).filter(Boolean));
  if (!accountIds.length) return { connected: true, lastSyncedAt: text(connection.last_synced_at) || null, credits: [] };
  const rows: Record<string, unknown>[] = [];
  // Geen stille Supabase-limiet van 1000: ook oudere voorschotten blijven vindbaar.
  for (let offset = 0; ; offset += 500) {
    const response = await supabaseAdmin.from('bank_transactions')
      .select('id,external_id,amount,currency,booking_date,counterparty_name,counterparty_iban,description,remittance_information,raw,category')
      .in('bank_account_id', accountIds).gt('amount', 0).eq('currency', 'EUR')
      .order('booking_date', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 499);
    if (response.error) throw new InvoiceBankError('Knab-betalingen konden niet worden gelezen.', 503);
    rows.push(...(response.data || []));
    if ((response.data || []).length < 500) break;
  }
  const credits = rows.filter((row) => !['private', 'internal'].includes(text(row.category))
    && !ownIbans.has(text(row.counterparty_iban).replace(/\s/g, '').toUpperCase()))
    .map((row): InvoiceBankCredit => ({
      id: text(row.id),
      key: createHash('sha256').update(text(row.external_id) || `stored:${text(row.id)}`).digest('hex'),
      amountCents: invoiceBankCents(row.amount), currency: text(row.currency), bookingDate: dateOnly(row.booking_date),
      name: text(row.counterparty_name),
      description: bankDescription(row),
    }));
  return { connected: true, lastSyncedAt: text(connection.last_synced_at) || null, credits };
}

interface InvoiceBankOwnerContext {
  invoices: BankMatchInvoice[];
  allocations: Map<string, InvoiceBankAllocation[]>;
  bank: BankContext;
}
export interface InvoiceBankContext extends InvoiceBankOwnerContext {
  invoice: BankMatchInvoice;
}

async function loadOwnerInvoiceBankContext(options: {
  firestore: Firestore; uid: string; bankUserId: string; invoiceId?: string;
}): Promise<InvoiceBankOwnerContext> {
  const { firestore, uid, bankUserId, invoiceId } = options;
  const invoiceSnapshot = await firestore.collection('invoices').where('userId', '==', uid)
    .select(...INVOICE_PAYMENT_FIELDS).get();
  const invoices = invoiceSnapshot.docs.map((item) => toInvoice(item.id, item.data()));
  if (invoiceId && !invoices.some((item) => item.id === invoiceId)) throw new InvoiceBankError('Factuur niet gevonden.', 404);
  const [allocationSnapshot, bank] = await Promise.all([
    allocationCollection(firestore, uid).get(),
    loadBankContext(bankUserId),
  ]);
  const activeIds = new Set(invoices.filter((item) => item.status !== 'geannuleerd').map((item) => item.id));
  const allocations = new Map(allocationSnapshot.docs.map((item) => [item.id, allocationRows(item.data().allocations, activeIds)]));
  return { invoices, allocations, bank };
}

export async function loadQuoteAdvanceBankView(options: {
  firestore: Firestore; uid: string; bankUserId: string; quoteId: string;
}) {
  const snap = await options.firestore.doc(`quotes/${options.quoteId}`).get();
  const quote = snap.data();
  if (!quote || quote.userId !== options.uid) throw new InvoiceBankError('Offerte niet gevonden.', 404);
  const { bank, invoices, allocations } = await loadOwnerInvoiceBankContext(options);
  const client = record(quote.klantinformatie);
  const candidates = findQuoteAdvanceCandidates({
    quoteNumber: String(quote.offerteNummer || ''), names: [text(client.bedrijfsnaam), text(client.achternaam) || text(client.voornaam)],
    quoteDate: dateOnly(quote.createdAt), credits: bank.credits, invoices, allocations,
  });
  return { connected: bank.connected, lastSyncedAt: bank.lastSyncedAt, candidates, credits: bank.credits };
}

export async function loadInvoiceBankContext(options: {
  firestore: Firestore; uid: string; bankUserId: string; invoiceId: string;
}): Promise<InvoiceBankContext> {
  const context = await loadOwnerInvoiceBankContext(options);
  return { ...context, invoice: context.invoices.find((item) => item.id === options.invoiceId)! };
}

export function invoiceBankView(context: InvoiceBankContext): InvoiceBankView {
  const linkedCents = invoiceBankLinkedCents(context.invoice.id, context.allocations);
  return {
    status: context.invoice.status, paidCents: context.invoice.paidCents,
    receipts: context.bank.credits.flatMap((credit) => {
      const cents = (context.allocations.get(credit.key) || []).filter((item) => item.invoiceId === context.invoice.id && item.mode !== 'advance')
        .reduce((sum, item) => sum + item.amountCents, 0);
      return cents ? [{ id: credit.id, name: credit.name, description: credit.description, date: credit.bookingDate, amountCents: cents }] : [];
    }),
    connected: context.bank.connected, lastSyncedAt: context.bank.lastSyncedAt, linkedCents,
    openCents: Math.max(0, context.invoice.totalCents - context.invoice.paidCents),
    unlinkedPaidCents: Math.max(0, context.invoice.paidCents - linkedCents),
    candidates: findInvoiceBankCandidates({ ...context, credits: context.bank.credits }),
  };
}

export async function applyInvoiceBankPayment(options: {
  firestore: Firestore; uid: string; invoiceId: string; credit: InvoiceBankCredit;
  credits: InvoiceBankCredit[]; amountCents: number; mode: 'add' | 'link'; automatic: boolean;
}): Promise<boolean> {
  const { firestore, uid, invoiceId, credit, credits, amountCents, mode, automatic } = options;
  return firestore.runTransaction(async (transaction) => {
    // De gehele eigenaarquery toetst ook dubbele factuurnummers en gelijktijdige boekingen.
    const [invoiceSnapshot, allocationSnapshot] = await Promise.all([
      transaction.get(firestore.collection('invoices').where('userId', '==', uid).select(...INVOICE_PAYMENT_FIELDS)),
      transaction.get(allocationCollection(firestore, uid)),
    ]);
    const invoices = invoiceSnapshot.docs.map((item) => toInvoice(item.id, item.data()));
    const invoice = invoices.find((item) => item.id === invoiceId);
    if (!invoice || invoice.userId !== uid) throw new InvoiceBankError('Factuur niet gevonden.', 404);
    const activeIds = new Set(invoices.filter((item) => item.status !== 'geannuleerd').map((item) => item.id));
    const allocations = new Map(allocationSnapshot.docs.map((item) => [item.id, allocationRows(item.data().allocations, activeIds)]));
    const existing = allocations.get(credit.key) || [];
    if (existing.some((item) => item.invoiceId === invoiceId && item.mode === mode)) return false;
    const candidates = findInvoiceBankCandidates({ invoice, invoices, credits, allocations });
    const candidate = candidates.find((item) => item.transactionId === credit.id);
    if (!candidate || (automatic && (!candidate.automatic || mode !== 'add' || amountCents !== candidate.suggestedCents))) {
      throw new InvoiceBankError('De betaling past niet meer bij deze factuur. Vernieuw de betaalgegevens.');
    }
    validateInvoiceBankAllocation({ invoice, credit, existing,
      linkedCents: invoiceBankLinkedCents(invoiceId, allocations), amountCents, mode });
    const invoiceDoc = invoiceSnapshot.docs.find((item) => item.id === invoiceId)!;
    const saved = invoiceDoc.data();
    const quoteIds = new Set([text(saved.quoteId), ...(Array.isArray(saved.combinedQuoteIds) ? saved.combinedQuoteIds : []),
      ...(Array.isArray(record(saved.combinedContext).quoteIds) ? record(saved.combinedContext).quoteIds as unknown[] : [])]
      .filter((value): value is string => typeof value === 'string' && Boolean(value) && !value.includes('/')));
    const quotes = mode === 'add' && record(saved.combinedContext).type !== 'meerwerkbon_only'
      ? await Promise.all(Array.from(quoteIds).map((id) => transaction.get(firestore.collection('quotes').doc(id)))) : [];
    const now = FieldValue.serverTimestamp();
    const paidCents = invoice.paidCents + (mode === 'add' ? amountCents : 0);
    const openCents = Math.max(0, invoice.totalCents - paidCents);
    const date = Timestamp.fromDate(new Date(`${credit.bookingDate}T12:00:00Z`));
    const previousPaymentAt = record(saved.paymentSummary).lastPaymentAt;
    const lastPaymentAt = (dateOnly(previousPaymentAt) || '') > credit.bookingDate! ? previousPaymentAt : date;
    transaction.set(allocationCollection(firestore, uid).doc(credit.key), {
      userId: uid, bankTransactionId: credit.id, amountCents: credit.amountCents,
      currency: credit.currency, bookingDate: credit.bookingDate, counterpartyName: credit.name,
      description: credit.description, updatedAt: now,
      allocations: [...existing, { invoiceId, amountCents, mode }],
    });
    if (mode === 'add') {
      transaction.create(invoiceDoc.ref.collection('payments').doc(`bank_${credit.key}`), {
        amount: amountCents / 100, date, method: 'bank', reference: credit.description,
        note: automatic ? 'Automatisch gekoppeld via Knab. ' + candidate.reason : 'Bankbetaling bevestigd.',
        source: 'knab', bankTransactionId: credit.id, bankAllocationKey: credit.key, createdAt: now,
      });
      transaction.update(invoiceDoc.ref, {
        status: openCents === 0 ? 'betaald' : 'gedeeltelijk_betaald',
        'paymentSummary.paidAmount': paidCents / 100, 'paymentSummary.openAmount': openCents / 100,
        'paymentSummary.lastPaymentAt': lastPaymentAt, ...(openCents === 0 ? { paidAt: saved.paidAt || lastPaymentAt } : {}), updatedAt: now,
      });
      quotes.filter((quote) => quote.exists && quote.data()?.userId === uid && quote.data()?.status !== 'geaccepteerd')
        .forEach((quote) => transaction.update(quote.ref, { status: 'geaccepteerd', updatedAt: now }));
    } else {
      // Alleen bewijs koppelen: een eerder handmatig geboekt bedrag telt niet opnieuw.
      transaction.update(invoiceDoc.ref, { updatedAt: now });
    }
    return true;
  });
}

export interface InvoiceBankSyncResult {
  applied: number;
  remaining: number;
  warnings: string[];
}

export async function reconcileInvoiceBankContext(options: {
  firestore: Firestore; uid: string; context: InvoiceBankOwnerContext;
}): Promise<InvoiceBankSyncResult> {
  const { firestore, uid, context } = options;
  const matches = context.invoices.flatMap((invoice) => findInvoiceBankCandidates({
    ...context, invoice, credits: context.bank.credits,
  }).filter((candidate) => candidate.automatic).map((candidate) => ({ invoice, candidate })));
  const result: InvoiceBankSyncResult = { applied: 0, remaining: Math.max(0, matches.length - 25), warnings: [] };
  matches.sort((a, b) => a.candidate.date.localeCompare(b.candidate.date));
  for (const { invoice, candidate } of matches.slice(0, 25)) {
    try {
      const credit = context.bank.credits.find((item) => item.id === candidate.transactionId)!;
      result.applied += Number(await applyInvoiceBankPayment({ firestore, uid, invoiceId: invoice.id,
        credit, credits: context.bank.credits, amountCents: candidate.suggestedCents, mode: 'add', automatic: true }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Koppeling mislukt.';
      result.warnings.push(`Factuur ${invoice.reference}: ${reason}`);
    }
  }
  return result;
}

/** Aansluitend op een geslaagde bestaande Knab-sync; geen eigen timer of bankaanroep. */
export async function reconcileInvoiceBankPaymentsAfterSync(options: {
  firestore: Firestore; uid: string; bankUserId: string;
}): Promise<InvoiceBankSyncResult> {
  const context = await loadOwnerInvoiceBankContext(options);
  return reconcileInvoiceBankContext({ ...options, context });
}

export async function loadInvoiceBankVerification(options: {
  firestore: Firestore; uid: string; bankUserId: string;
}): Promise<Array<{ invoiceId: string; totalCents: number }>> {
  const context = await loadOwnerInvoiceBankContext(options);
  return context.invoices.filter((invoice) => isInvoiceBankVerified({
    ...context, invoice, credits: context.bank.credits,
  })).map((invoice) => ({ invoiceId: invoice.id, totalCents: invoice.totalCents }));
}
