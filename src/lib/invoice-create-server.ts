import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { buildInvoiceDocument, type CreateInvoiceParams } from '@/lib/invoice-document';
import { invoiceBillingSignature, invoiceTouchesQuote, isSupplementaryInvoice, summarizeInvoiceBilling, type InvoiceBillingRow } from '@/lib/invoice-billing';
import { invoiceQuoteSignature } from '@/lib/invoice-quote-signature';
import { freezeInvoiceCalculation, resolveInvoiceTotal, resolveTotalFromQuote } from '@/lib/invoice-total';
import { DEFAULT_USER_SETTINGS } from '@/lib/types-settings';
import type { DataJson } from '@/lib/quote-calculations';

export class InvoiceCreationError extends Error {
  constructor(message: string, public readonly status = 409) { super(message); }
}

export const INVOICE_BILLING_FIELDS = [
  'userId', 'quoteId', 'invoiceType', 'status', 'invoiceNumberLabel',
  'totalsSnapshot', 'paymentSummary', 'combinedQuoteIds', 'combinedContext', 'linkedMeerwerkbonIds',
];

function amount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

/** Eén transactie controleert de controlekaart, hergebruikt concepten en reserveert het nummer. */
export async function createInvoiceAtomically(
  firestore: Firestore,
  uid: string,
  input: CreateInvoiceParams,
  calculation: DataJson | null,
): Promise<string> {
  if (!input.quoteId || input.quoteId.includes('/') || !['voorschot', 'eind'].includes(input.invoiceType)) {
    throw new InvoiceCreationError('Ongeldige factuurgegevens.', 400);
  }
  const combinedId = input.combinedContext?.meerwerkbonId || null;
  if (combinedId && (combinedId.includes('/') || input.invoiceType !== 'eind')) {
    throw new InvoiceCreationError('Ongeldige meerwerkbon.', 400);
  }
  const stageKey = createHash('sha256').update(JSON.stringify([uid, combinedId || input.quoteId, input.invoiceType, !!combinedId])).digest('hex');
  const stageRef = firestore.doc(`counters/invoiceStage_${stageKey}`);
  const counterRef = firestore.doc(`counters/invoiceNumber_${uid}`);
  const quoteRef = firestore.doc(`quotes/${input.quoteId}`);
  const userRef = firestore.doc(`users/${uid}`);
  const newInvoiceRef = firestore.collection('invoices').doc();
  // De projectie houdt deze controle klein en omvat ook oudere gecombineerde facturen.
  const invoicesQuery = firestore.collection('invoices').where('userId', '==', uid).select(...INVOICE_BILLING_FIELDS);

  return firestore.runTransaction(async (tx) => {
    const [stageSnap, counterSnap, quoteSnap, userSnap, invoiceSnap] = await Promise.all([
      tx.get(stageRef), tx.get(counterRef), tx.get(quoteRef), tx.get(userRef), tx.get(invoicesQuery),
    ]);
    if (!quoteSnap.exists || quoteSnap.data()?.userId !== uid) {
      throw new InvoiceCreationError('Offerte niet gevonden.', 404);
    }
    if (!userSnap.exists) throw new InvoiceCreationError('Instellingen ontbreken.', 400);
    const quote = quoteSnap.data()!;
    const settings = { ...DEFAULT_USER_SETTINGS, ...(userSnap.data()?.settings || {}) };
    const allInvoices = invoiceSnap.docs.map((snap) => ({ ...snap.data(), id: snap.id } as InvoiceBillingRow));
    let relevant = allInvoices.filter((row) => invoiceTouchesQuote(row, input.quoteId));
    let total = resolveInvoiceTotal(quote, calculation, Number(settings.planningSettings?.defaultWorkdayHours) || 8);
    let combinedContext = input.combinedContext;
    let combinedQuoteIds: string[] | null = null;
    let extraQuoteSnapshots: typeof quoteSnap[] = [];

    if (combinedId) {
      const meerwerkSnap = await tx.get(firestore.doc(`meerwerkbonnen/${combinedId}`));
      const meerwerk = meerwerkSnap.data();
      if (!meerwerk || meerwerk.userId !== uid || meerwerk.primaryQuoteId !== input.quoteId) {
        throw new InvoiceCreationError('Meerwerkbon niet gevonden.', 404);
      }
      const existingCombined = allInvoices.filter((row) => row.status !== 'geannuleerd'
        && (row.combinedContext as { meerwerkbonId?: string } | undefined)?.meerwerkbonId === combinedId);
      if (existingCombined.length > 1) throw new InvoiceCreationError('Er bestaan meerdere facturen voor deze meerwerkbon.');
      if (existingCombined.length === 1) return existingCombined[0].id;
      if (!['akkoord', 'gefactureerd'].includes(meerwerk.status)) {
        throw new InvoiceCreationError('Alleen geaccordeerde meerwerkbonnen kunnen worden gefactureerd.');
      }
      combinedQuoteIds = [...new Set<string>([input.quoteId, ...(meerwerk.linkedQuoteIds || [])])];
      extraQuoteSnapshots = await Promise.all(combinedQuoteIds.filter((id) => id !== input.quoteId).map((id) => tx.get(firestore.doc(`quotes/${id}`))));
      if (extraQuoteSnapshots.some((snap) => !snap.exists || snap.data()?.userId !== uid)) {
        throw new InvoiceCreationError('Geen toegang tot een gekoppelde offerte.', 403);
      }
      // Deze factuur bevat alleen de eigen meerwerkregels; hoofd-offertes worden apart afgerekend.
      relevant = [];
      total = amount(meerwerk.totals?.totaalInclBtw) || 0;
      combinedContext = { type: 'meerwerkbon_combined', primaryQuoteId: input.quoteId, quoteIds: combinedQuoteIds, meerwerkbonId: combinedId, meerwerkbonNumber: meerwerk.numbering?.label || '' };
    }

    const billing = summarizeInvoiceBilling(relevant);
    if (billing.ambiguity) throw new InvoiceCreationError(billing.ambiguity);
    const activeStage = relevant.filter((row) => !isSupplementaryInvoice(row) && row.status !== 'geannuleerd' && row.invoiceType === input.invoiceType);
    if (combinedId && activeStage.length > 0) {
      throw new InvoiceCreationError('Een gekoppelde offerte heeft al een eindfactuur. Controleer deze eerst.');
    }
    if (!combinedId && activeStage.length === 1) return activeStage[0].id;
    if (activeStage.length > 1) throw new InvoiceCreationError('Er bestaan meerdere facturen voor deze termijn. Controleer deze eerst.');
    if (input.invoiceType === 'voorschot' && billing.finalInvoices.length > 0) {
      throw new InvoiceCreationError('Deze offerte heeft al een eindfactuur.');
    }
    if (!combinedId && (!input.expectedQuoteSignature || input.expectedQuoteSignature !== invoiceQuoteSignature(quote))) {
      throw new InvoiceCreationError('De offerte is gewijzigd. Laad de factuurgegevens opnieuw.');
    }
    if (!combinedId && input.expectedBillingSignature !== invoiceBillingSignature(relevant)) {
      throw new InvoiceCreationError('De bestaande facturen zijn gewijzigd. Laad de factuurgegevens opnieuw.');
    }
    if (input.invoiceType === 'eind' && billing.draftAdvances.length > 0) {
      throw new InvoiceCreationError('Open of annuleer eerst het voorschotconcept voordat je een eindfactuur maakt.');
    }
    if (!(total > 0) || amount(input.originalTotalInclBtw) !== amount(total)) {
      throw new InvoiceCreationError('Het offertebedrag is gewijzigd. Laad de factuurgegevens opnieuw.');
    }
    const deduction = input.invoiceType === 'eind' ? billing.billedAdvanceAmount : 0;
    if (deduction > total + 0.005) throw new InvoiceCreationError('Het gefactureerde voorschot is hoger dan het offertebedrag. Controleer dit eerst.');
    const requested = amount(input.totalsInclBtw);
    if (requested === null || requested <= 0 || requested > total) throw new InvoiceCreationError('Vul een geldig factuurbedrag in.', 400);
    if (input.invoiceType === 'eind' && !input.handmatigEindbedrag && requested !== amount(total - deduction)) {
      throw new InvoiceCreationError('Het eindbedrag klopt niet met het al gefactureerde voorschot. Laad de gegevens opnieuw.');
    }
    if (input.handmatigEindbedrag && !input.opmerking?.trim()) {
      throw new InvoiceCreationError('Vul een reden voor het aangepaste eindbedrag in.', 400);
    }
    const snapshots = billing.issuedAdvances.map((row) => ({
      id: row.id, invoiceNumberLabel: row.invoiceNumberLabel || '', status: row.status || '',
      totaalInclBtw: row.totalsSnapshot?.totaalInclBtw || 0,
      paidAmount: row.paymentSummary?.paidAmount || 0,
    }));
    const currentNext = counterSnap.data()?.next;
    const configuredStart = Number(settings.factuurNummerStart);
    const invoiceNumber = typeof currentNext === 'number' ? currentNext : (Number.isFinite(configuredStart) ? configuredStart : 460001);
    if (!Number.isSafeInteger(invoiceNumber) || invoiceNumber < 0) throw new InvoiceCreationError('De factuurnummerteller is ongeldig. Controleer de instellingen.');
    const timestamp = FieldValue.serverTimestamp();
    const frozenCalculation = freezeInvoiceCalculation(calculation, quote, Number(settings.planningSettings?.defaultWorkdayHours) || 8);
    const payload = buildInvoiceDocument({
      ...input, userId: uid, quote, settings, calculationSnapshot: frozenCalculation || undefined,
      originalTotalInclBtw: total, totalsInclBtw: requested, voorschotAftrekInclBtw: deduction,
      voorschotFactuurSnapshot: snapshots.length === 1 ? snapshots[0] : null,
      combinedContext: combinedContext || null, combinedQuoteIds,
      linkedMeerwerkbonIds: combinedId ? [combinedId] : null,
    }, invoiceNumber, timestamp);
    if (frozenCalculation) payload.invoiceSnapshotVersion = 1;
    if (snapshots.length > 1) payload.financialAdjustments.voorschotFacturen = snapshots;

    tx.set(counterRef, { next: invoiceNumber + 1, userId: uid, updatedAt: timestamp }, { merge: true });
    tx.set(stageRef, { userId: uid, invoiceId: newInvoiceRef.id, previousInvoiceId: stageSnap.data()?.invoiceId || null, updatedAt: timestamp });
    tx.set(newInvoiceRef, payload);
    const updates: Record<string, unknown> = {};
    const original = quote.financieel?.oorspronkelijkePrijsInclBtw;
    if (!combinedId && (original == null || !Number.isFinite(Number(original)) || Number(original) < 0)) updates['financieel.oorspronkelijkePrijsInclBtw'] = total;
    if (!combinedId && Math.abs(resolveTotalFromQuote(quote) - total) > 0.01) {
      updates.amount = total;
      updates.totaalbedrag = total;
    }
    if (input.invoiceType === 'eind' && quote.status !== 'geaccepteerd') updates.status = 'verzonden';
    if (Object.keys(updates).length > 0) tx.update(quoteRef, { ...updates, updatedAt: timestamp });
    extraQuoteSnapshots.forEach((snap) => {
      if (snap.data()?.status !== 'geaccepteerd') tx.update(snap.ref, { status: 'verzonden', updatedAt: timestamp });
    });
    return newInvoiceRef.id;
  });
}
