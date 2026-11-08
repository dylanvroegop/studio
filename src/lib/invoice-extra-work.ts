import { deleteField, doc, runTransaction, serverTimestamp, Timestamp, type Firestore } from 'firebase/firestore';
import type { Invoice, InvoiceExtraWork } from './types';

export interface AddInvoiceExtraWork {
  id: string;
  amountInclBtw: number;
  description: string;
  vatRate: number;
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** Meerwerk verhoogt de factuur; ontvangen betalingen blijven onaangetast. */
export async function addInvoiceExtraWork(
  firestore: Firestore,
  invoiceId: string,
  userId: string,
  input: AddInvoiceExtraWork,
): Promise<void> {
  const amountInclBtw = roundMoney(input.amountInclBtw);
  const description = input.description.trim();
  if (!input.id || !Number.isFinite(amountInclBtw) || amountInclBtw <= 0) throw new Error('Vul een geldig bedrag groter dan nul in.');
  if (!description || description.length > 2000) throw new Error('Vul een uitleg van maximaal 2000 tekens in.');
  if (![0, 9, 21].includes(input.vatRate)) throw new Error('Kies een geldig BTW-tarief.');
  const amountExclBtw = roundMoney(amountInclBtw / (1 + input.vatRate / 100));
  const entry: InvoiceExtraWork = {
    id: input.id, description, amountInclBtw, amountExclBtw,
    vatRate: input.vatRate, vatAmount: roundMoney(amountInclBtw - amountExclBtw),
    createdAt: Timestamp.now(),
  };

  await runTransaction(firestore, async (transaction) => {
    const reference = doc(firestore, 'invoices', invoiceId);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error('Factuur niet gevonden.');
    const current = snapshot.data() as Invoice;
    if (current.userId !== userId) throw new Error('Factuur niet gevonden.');
    const existing = current.extraWork ?? [];
    // Een herhaalde poging na een onzekere netwerkresponse telt niet dubbel.
    if (existing.some((item) => item.id === input.id)) return;
    if (current.status === 'geannuleerd') throw new Error('Deze factuur is geannuleerd.');
    const total = Number(current.totalsSnapshot?.totaalInclBtw);
    if (!Number.isFinite(total) || total < 0) throw new Error('Controleer eerst het factuurbedrag.');
    const newTotal = roundMoney(total + amountInclBtw);
    const paid = Math.max(0, Number(current.paymentSummary?.paidAmount) || 0);
    const open = roundMoney(Math.max(0, newTotal - paid));
    const status = paid > 0 ? (open === 0 ? 'betaald' : 'gedeeltelijk_betaald')
      : current.status === 'betaald' ? 'verzonden' : current.status;

    transaction.update(reference, {
      extraWork: [...existing, entry],
      'totalsSnapshot.totaalInclBtw': newTotal,
      ...(typeof current.totalsSnapshot.totaalExclBtw === 'number'
        ? { 'totalsSnapshot.totaalExclBtw': roundMoney(current.totalsSnapshot.totaalExclBtw + entry.amountExclBtw) } : {}),
      ...(typeof current.totalsSnapshot.btw === 'number'
        ? { 'totalsSnapshot.btw': roundMoney(current.totalsSnapshot.btw + entry.vatAmount) } : {}),
      'paymentSummary.openAmount': open,
      status,
      ...(status !== 'betaald' ? { paidAt: deleteField() } : {}),
      updatedAt: serverTimestamp(),
    });
  });
}
