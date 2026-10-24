import type { Firestore } from 'firebase-admin/firestore';
import { buildKlantSnapshot, buildProjectAdresSnapshot } from '@/lib/invoice-document';

/** Werk uitsluitend concepten bij, met de actuele offerte binnen dezelfde transactie. */
export async function syncInvoiceDraftClients(firestore: Firestore, quoteId: string, userId: string): Promise<void> {
  await firestore.runTransaction(async (tx) => {
    const [quoteSnap, invoices] = await Promise.all([
      tx.get(firestore.doc(`quotes/${quoteId}`)),
      tx.get(firestore.collection('invoices').where('quoteId', '==', quoteId)),
    ]);
    const quote = quoteSnap.data();
    if (!quote || quote.userId !== userId) throw new Error('Geen toegang tot deze offerte.');
    for (const invoice of invoices.docs) {
      const data = invoice.data();
      if (data.userId !== userId || data.status !== 'concept') continue;
      tx.update(invoice.ref, {
        'sourceQuote.klantSnapshot': buildKlantSnapshot(quote),
        'sourceQuote.projectAdresSnapshot': buildProjectAdresSnapshot(quote),
      });
    }
  });
}
