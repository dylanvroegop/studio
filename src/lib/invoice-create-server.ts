import { compareSharedQuoteAmount, isQuoteAmountConfirmed } from '@/lib/quote-shared-amount';
import type { InvoiceBankCredit, InvoiceBankAllocation } from '@/lib/invoice-bank-matching';
import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { buildInvoiceDocument, type CreateInvoiceParams } from '@/lib/invoice-document';
import { invoiceBillingSignature, invoiceTouchesQuote, isSupplementaryInvoice, summarizeInvoiceBilling, type InvoiceBillingRow } from '@/lib/invoice-billing';
import { invoiceQuoteSignature } from '@/lib/invoice-quote-signature';
import { freezeInvoiceCalculation, resolveInvoiceTotal, resolveTotalFromQuote } from '@/lib/invoice-total';
import { DEFAULT_USER_SETTINGS } from '@/lib/types-settings';
import { calculateMeerwerkbonTotals, recalcMeerwerkbonLineItems } from '@/lib/meerwerkbon-utils';
import { removeEmptyFields } from '@/lib/utils';
import type { MeerwerkbonClientSnapshot, MeerwerkbonLineItem } from '@/lib/types';
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
  bankCredits: InvoiceBankCredit[] = [],
): Promise<string> {
  if (!input.quoteId || input.quoteId.includes('/') || !['voorschot', 'eind'].includes(input.invoiceType)) {
    throw new InvoiceCreationError('Ongeldige factuurgegevens.', 400);
  }
  const combinedId = input.combinedContext?.meerwerkbonId || null;
  if (combinedId && (combinedId.includes('/') || input.invoiceType !== 'eind')) {
    throw new InvoiceCreationError('Ongeldige meerwerkbon.', 400);
  }
  const standalone = input.combinedContext?.type === 'meerwerkbon_only';
  const meerwerkRef = combinedId ? firestore.doc(`meerwerkbonnen/${combinedId}`) : null;
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

    let invoiceLines: MeerwerkbonLineItem[] | undefined;
    let meerwerkDescription = '';
    let meerwerkClient: MeerwerkbonClientSnapshot | undefined;
    if (meerwerkRef && combinedId) {
      const meerwerkSnap = await tx.get(meerwerkRef);
      const meerwerk = meerwerkSnap.data();
      if (!meerwerk || meerwerk.userId !== uid || meerwerk.primaryQuoteId !== input.quoteId) {
        throw new InvoiceCreationError('Meerwerkbon niet gevonden.', 404);
      }
      const existingCombined = allInvoices.filter((row) => row.status !== 'geannuleerd'
        && (row.combinedContext?.meerwerkbonId === combinedId || row.id === meerwerk.invoiceLink?.invoiceId
          || row.linkedMeerwerkbonIds?.includes(combinedId)));
      if (existingCombined.length > 1) throw new InvoiceCreationError('Er bestaan meerdere facturen voor deze meerwerkbon.');
      if (existingCombined.length === 1) {
        const existing = existingCombined[0];
        if (meerwerk.invoiceLink?.invoiceId !== existing.id) {
          tx.update(meerwerkRef, {
            status: 'gefactureerd', updatedAt: FieldValue.serverTimestamp(),
            invoiceLink: { invoiceId: existing.id, invoiceNumberLabel: existing.invoiceNumberLabel || '', createdAt: FieldValue.serverTimestamp() },
          });
        }
        return existing.id;
      }
      if (!['akkoord', 'gefactureerd'].includes(meerwerk.status)) {
        throw new InvoiceCreationError('Alleen geaccordeerde meerwerkbonnen kunnen worden gefactureerd.');
      }
      combinedQuoteIds = standalone ? [input.quoteId] : [...new Set<string>([input.quoteId, ...(meerwerk.linkedQuoteIds || [])])];
      extraQuoteSnapshots = await Promise.all(combinedQuoteIds.filter((id) => id !== input.quoteId).map((id) => tx.get(firestore.doc(`quotes/${id}`))));
      if (extraQuoteSnapshots.some((snap) => !snap.exists || snap.data()?.userId !== uid)) {
        throw new InvoiceCreationError('Geen toegang tot een gekoppelde offerte.', 403);
      }
      // Deze factuur bevat alleen de eigen meerwerkregels; hoofd-offertes worden apart afgerekend.
      relevant = [];
      total = amount(meerwerk.totals?.totaalInclBtw) || 0;
      if (standalone) {
        const pricingMode = meerwerk.pricingMode || 'begroot';
        if (input.meerwerkbonPricingMode !== pricingMode) {
          throw new InvoiceCreationError('De prijswijze is gewijzigd. Open de meerwerkbon opnieuw.');
        }
        const rows = pricingMode === 'begroot' ? meerwerk.lineItems : input.actualLineItems;
        if (!Array.isArray(rows) || !rows.length || rows.some((row) =>
          !row || typeof row.omschrijving !== 'string' || !row.omschrijving.trim()
          || typeof row.eenheid !== 'string' || !row.eenheid.trim()
          || !Number.isFinite(row.aantal) || row.aantal <= 0
          || !Number.isFinite(row.prijsPerEenheidExclBtw) || row.prijsPerEenheidExclBtw < 0
          || !Number.isFinite(row.btwTarief) || row.btwTarief < 0 || row.btwTarief > 100)) {
          throw new InvoiceCreationError('Controleer de omschrijving, aantallen, prijzen en btw van de factuurregels.', 400);
        }
        invoiceLines = recalcMeerwerkbonLineItems(rows);
        total = calculateMeerwerkbonTotals(invoiceLines).totaalInclBtw;
        meerwerkClient = meerwerk.clientSnapshot;
        meerwerkDescription = meerwerk.opmerking?.trim() || `Meerwerkbon ${meerwerk.numbering?.label || combinedId}`;
        if (amount(input.totalsInclBtw) !== total || !Number.isSafeInteger(Math.round(total * 100))) {
          throw new InvoiceCreationError('Het meerwerkbedrag is gewijzigd. Controleer de factuurregels opnieuw.');
        }
      }
      combinedContext = { type: standalone ? 'meerwerkbon_only' : 'meerwerkbon_combined', primaryQuoteId: input.quoteId, quoteIds: combinedQuoteIds, meerwerkbonId: combinedId, meerwerkbonNumber: meerwerk.numbering?.label || '' };
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
    const selected = input.bankAdvanceSelection || [];
    if (selected.length && (combinedId || input.invoiceType !== 'eind' || billing.issuedAdvances.length)) {
      throw new InvoiceCreationError('Koppel deze betalingen aan de bestaande voorschotfactuur.');
    }
    const credits = selected.map((row) => {
      const credit = bankCredits.find((item) => item.id === row.transactionId);
      if (!credit || credit.amountCents !== row.amountCents || credit.currency !== 'EUR' || !credit.bookingDate) {
        throw new InvoiceCreationError('Een gekozen Knab-betaling is gewijzigd. Controleer de betalingen opnieuw.');
      }
      return credit;
    });
    if (new Set(credits.map((credit) => credit.key)).size !== credits.length) {
      throw new InvoiceCreationError('Een voorschotbetaling is meermaals geselecteerd.');
    }
    const claims = await Promise.all(credits.map((credit) => tx.get(firestore.doc(`users/${uid}/invoiceBankAllocations/${credit.key}`))));
    const activeIds = new Set(allInvoices.filter((row) => row.status !== 'geannuleerd').map((row) => row.id));
    if (claims.some((claim) => claim.data()?.allocations?.some((item: InvoiceBankAllocation) =>
      item.mode !== 'advance' || activeIds.has(item.invoiceId)))) {
      throw new InvoiceCreationError('Een gekozen Knab-betaling is inmiddels gekoppeld. Controleer de betalingen opnieuw.');
    }
    const receivedCents = credits.reduce((sum, credit) => sum + credit.amountCents, 0);
    const deduction = input.invoiceType === 'eind' ? billing.billedAdvanceAmount + receivedCents / 100 : 0;
    if (deduction > total + 0.005) throw new InvoiceCreationError('Het gefactureerde voorschot is hoger dan het offertebedrag. Controleer dit eerst.');
    const requested = amount(input.totalsInclBtw);
    if (requested === null || requested <= 0 || requested > total) throw new InvoiceCreationError('Vul een geldig factuurbedrag in.', 400);
    if (input.invoiceType === 'eind' && !input.handmatigEindbedrag && requested !== amount(total - deduction)) {
      throw new InvoiceCreationError('Het eindbedrag klopt niet met het al gefactureerde voorschot. Laad de gegevens opnieuw.');
    }
    if (input.handmatigEindbedrag && !input.opmerking?.trim()) {
      throw new InvoiceCreationError('Vul een reden voor het aangepaste eindbedrag in.', 400);
    }
    const sharedAmountCheck = !combinedId && input.invoiceType === 'eind'
      ? compareSharedQuoteAmount(quote.whatsappQuoteSnapshot, requested, deduction) : null;
    if (sharedAmountCheck?.differenceCents && !isQuoteAmountConfirmed(sharedAmountCheck, input.sharedQuoteAmountConfirmation)) {
      throw new InvoiceCreationError('Het bedrag wijkt af van de via WhatsApp gedeelde offerte. Bevestig het verschil of pas het eindbedrag aan.');
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
    const frozenCalculation = standalone ? null : freezeInvoiceCalculation(calculation, quote, Number(settings.planningSettings?.defaultWorkdayHours) || 8);
    const payload = buildInvoiceDocument({
      ...input, userId: uid, quote, settings, calculationSnapshot: frozenCalculation || undefined,
      originalTotalInclBtw: total, totalsInclBtw: requested, voorschotAftrekInclBtw: deduction,
      voorschotFactuurSnapshot: snapshots.length === 1 ? snapshots[0] : null,
      combinedContext: combinedContext || null, combinedQuoteIds,
      linkedMeerwerkbonIds: combinedId ? [combinedId] : null,
    }, invoiceNumber, timestamp);
    if (sharedAmountCheck) payload.sharedQuoteAmountCheck = {
      ...sharedAmountCheck,
      confirmedDifference: sharedAmountCheck.differenceCents !== 0,
      checkedAt: timestamp,
      checkedBy: uid,
    };
    if (invoiceLines) {
      const totals = calculateMeerwerkbonTotals(invoiceLines);
      payload.meerwerkbonRegels = removeEmptyFields(invoiceLines);
      payload.sourceQuote.titel = meerwerkDescription;
      if (meerwerkClient) {
        for (const field of ['naam', 'adres', 'postcode', 'plaats', 'telefoon', 'email'] as const) {
          if (meerwerkClient[field]?.trim()) payload.sourceQuote.klantSnapshot[field] = meerwerkClient[field].trim();
        }
      }
      payload.totalsSnapshot = { totaalInclBtw: total, totaalExclBtw: totals.subtotaalExclBtw, btw: totals.btwTotaal };
    }
    if (frozenCalculation) payload.invoiceSnapshotVersion = 1;
    if (snapshots.length > 1) payload.financialAdjustments.voorschotFacturen = snapshots;

    if (credits.length) {
      payload.financialAdjustments.bankVoorschotten = credits.map((credit) => ({
        transactionId: credit.id, amountCents: credit.amountCents, date: credit.bookingDate,
        name: credit.name, description: credit.description,
      }));
      credits.forEach((credit, index) => tx.set(claims[index].ref, {
        userId: uid, bankTransactionId: credit.id, amountCents: credit.amountCents,
        currency: credit.currency, bookingDate: credit.bookingDate, counterpartyName: credit.name,
        description: credit.description, updatedAt: timestamp,
        allocations: [{ invoiceId: newInvoiceRef.id, amountCents: credit.amountCents, mode: 'advance' }],
      }));
    }
    tx.set(counterRef, { next: invoiceNumber + 1, userId: uid, updatedAt: timestamp }, { merge: true });
    tx.set(stageRef, { userId: uid, invoiceId: newInvoiceRef.id, previousInvoiceId: stageSnap.data()?.invoiceId || null, updatedAt: timestamp });
    tx.set(newInvoiceRef, payload);
    if (meerwerkRef) {
      tx.update(meerwerkRef, {
        status: 'gefactureerd', updatedAt: timestamp,
        invoiceLink: { invoiceId: newInvoiceRef.id, invoiceNumberLabel: payload.invoiceNumberLabel, createdAt: timestamp },
      });
    }
    if (standalone) return newInvoiceRef.id;
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
