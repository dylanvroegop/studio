import { deleteField, doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import type { Invoice } from './types';

export interface InvoiceAmountOverride {
  originalTotalInclBtw: number;
  voorschotAftrekInclBtw: number;
  voorschotPaidAmount: number;
  finalTotalInclBtw: number;
  reason: string;
}

/** Pas bedragen aan zonder een inmiddels bijgeboekte (bank)betaling te overschrijven. */
export async function saveInvoiceAmountOverride(
  firestore: Firestore,
  invoiceId: string,
  userId: string,
  values: InvoiceAmountOverride,
): Promise<void> {
  if (![values.originalTotalInclBtw, values.voorschotAftrekInclBtw, values.voorschotPaidAmount, values.finalTotalInclBtw]
    .every((value) => Number.isFinite(value) && value >= 0)) throw new Error('Ongeldig factuurbedrag.');
  await runTransaction(firestore, async (transaction) => {
    const reference = doc(firestore, 'invoices', invoiceId);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error('Factuur niet gevonden.');
    const current = snapshot.data() as Invoice;
    if (current.userId !== userId) throw new Error('Factuur niet gevonden.');
    const paidAmount = Math.max(0, Number(current.paymentSummary?.paidAmount) || 0);
    const openAmount = Math.max(0, Math.round((values.finalTotalInclBtw - paidAmount) * 100) / 100);
    const existingAdvance = current.financialAdjustments?.voorschotFactuur;
    const status = current.status === 'geannuleerd' || paidAmount === 0 ? current.status
      : openAmount === 0 ? 'betaald' : 'gedeeltelijk_betaald';

    transaction.update(reference, {
      'totalsSnapshot.totaalInclBtw': values.finalTotalInclBtw,
      'paymentSummary.openAmount': openAmount,
      'financialAdjustments.originalTotalInclBtw': values.originalTotalInclBtw,
      'financialAdjustments.voorschotAftrekInclBtw': values.voorschotAftrekInclBtw,
      'financialAdjustments.voorschotFactuur': existingAdvance
        ? { ...existingAdvance, paidAmount: values.voorschotPaidAmount }
        : { id: '', invoiceNumberLabel: '', totaalInclBtw: values.voorschotAftrekInclBtw, paidAmount: values.voorschotPaidAmount },
      'financialAdjustments.handmatigEindbedrag': false,
      'financialAdjustments.opmerking': values.reason,
      status,
      ...(status === 'betaald'
        ? { paidAt: current.paidAt ?? current.paymentSummary?.lastPaymentAt ?? serverTimestamp() }
        : status === 'gedeeltelijk_betaald' ? { paidAt: deleteField() } : {}),
      updatedAt: serverTimestamp(),
    });
  });
}
