import type { User } from 'firebase/auth';
import { doc, getDoc, runTransaction, serverTimestamp, type DocumentSnapshot, type Firestore } from 'firebase/firestore';
import { loadQuoteInvoiceBilling } from '@/lib/invoice-actions';
import { summarizeInvoiceBilling, type InvoiceBillingRow } from '@/lib/invoice-billing';
import { invoiceQuoteSignature, readPath } from '@/lib/invoice-quote-signature';
import type { DataJson } from '@/lib/quote-calculations';

interface InvoicePreparation {
  userSnapshot: DocumentSnapshot;
  quoteSnapshot: DocumentSnapshot;
  calculationSnapshot: DataJson | null;
  existingVoorschotId: string | null;
  invoices: InvoiceBillingRow[];
}

export interface PreparedInvoiceQuoteUpdate {
  expectedQuote: Record<string, unknown>;
  updates: Record<string, unknown>;
}

export class InvoicePreparationConflictError extends Error {
  constructor() {
    super('De offerte is gewijzigd. Laad de factuurgegevens opnieuw voordat je de factuur aanmaakt.');
    this.name = 'InvoicePreparationConflictError';
  }
}

/** Controleer uitgestelde boekhouding atomair; overschrijf geen nieuwere offerte. */
export async function saveInvoicePreparation(
  firestore: Firestore,
  quoteId: string,
  prepared: PreparedInvoiceQuoteUpdate | null,
): Promise<void> {
  if (!prepared || Object.keys(prepared.updates).length === 0) return;
  await runTransaction(firestore, async (transaction) => {
    const quoteRef = doc(firestore, 'quotes', quoteId);
    const snapshot = await transaction.get(quoteRef);
    if (!snapshot.exists()) throw new InvoicePreparationConflictError();
    const current = snapshot.data();
    if (invoiceQuoteSignature(current) !== invoiceQuoteSignature(prepared.expectedQuote)) {
      throw new InvoicePreparationConflictError();
    }

    const updates = { ...prepared.updates };
    const originalPrice = readPath(current, 'financieel.oorspronkelijkePrijsInclBtw');
    if (originalPrice !== null && originalPrice !== undefined
      && Number.isFinite(Number(originalPrice)) && Number(originalPrice) >= 0) {
      delete updates['financieel.oorspronkelijkePrijsInclBtw'];
    }
    if (Object.keys(updates).length > 0) {
      transaction.update(quoteRef, { ...updates, updatedAt: serverTimestamp() });
    }
  });
}

/** Onafhankelijke bronnen tegelijk ophalen; geen writes tijdens het openen. */
export async function loadInvoicePreparation(
  firestore: Firestore,
  user: Pick<User, 'uid' | 'getIdToken'>,
  quoteId: string,
  signal?: AbortSignal,
): Promise<InvoicePreparation> {
  const calculationPromise = (async (): Promise<DataJson | null> => {
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/quotes/get-calculations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ quoteId, latestOnly: true, preferCompletedFallback: true }),
        signal,
      });
      const payload = await response.json();
      if (!response.ok || payload?.ok !== true) throw new Error('Kon calculatie niet ophalen');
      return payload?.row?.data_json ?? null;
    } catch (error) {
      if (!signal?.aborted) console.warn('Kon calculatie niet ophalen voor factuurtotaal:', error);
      // Bestaande offertes kunnen uitsluitend een Firestore-totaal bevatten.
      return null;
    }
  })();

  const [userSnapshot, quoteSnapshot, calculationSnapshot, invoices] = await Promise.all([
    getDoc(doc(firestore, 'users', user.uid)),
    getDoc(doc(firestore, 'quotes', quoteId)),
    calculationPromise,
    loadQuoteInvoiceBilling(firestore, { userId: user.uid, quoteId }),
  ]);

  return { userSnapshot, quoteSnapshot, calculationSnapshot, invoices, existingVoorschotId: summarizeInvoiceBilling(invoices).existingAdvanceId };
}
