import { randomUUID } from 'crypto';
import type { Firestore } from 'firebase-admin/firestore';

/** Een onduidelijke Telegram-uitkomst blijft gereserveerd; automatisch opnieuw sturen kan dupliceren. */
export async function claimJobReportPart(firestore: Firestore, uid: string, invoiceId: string, part: number) {
  const reportRef = firestore.collection('users').doc(uid).collection('jobFinanceReports').doc(invoiceId);
  const partRef = reportRef.collection('deliveries').doc(String(part));
  return firestore.runTransaction(async transaction => {
    const [report, delivery, invoice] = await Promise.all([
      transaction.get(reportRef), transaction.get(partRef), transaction.get(firestore.collection('invoices').doc(invoiceId)),
    ]);
    if (!invoice.exists || invoice.data()?.userId !== uid || !['verzonden', 'gedeeltelijk_betaald', 'betaald'].includes(invoice.data()?.status)) {
      return { claimed: false, invoiceId, part, state: 'cancelled' };
    }
    const messages = report.data()?.messages;
    if (!report.exists || !Array.isArray(messages) || typeof messages[part] !== 'string') throw new Error('Rapportdeel niet gevonden');
    if (delivery.exists) return { claimed: false, invoiceId, part, state: delivery.data()?.state };
    const token = randomUUID();
    transaction.create(partRef, { state: 'sending', token, reservedAt: new Date().toISOString() });
    return { claimed: true, invoiceId, part, token, text: messages[part] as string };
  });
}

export async function acknowledgeJobReportPart(firestore: Firestore, uid: string, invoiceId: string, part: number, token: string, telegramMessageId: number) {
  const ref = firestore.collection('users').doc(uid).collection('jobFinanceReports').doc(invoiceId).collection('deliveries').doc(String(part));
  return firestore.runTransaction(async transaction => {
    const delivery = await transaction.get(ref);
    if (!delivery.exists || delivery.data()?.token !== token) throw new Error('Ongeldige reservering');
    if (delivery.data()?.state === 'sent') return;
    transaction.update(ref, { state: 'sent', telegramMessageId, deliveredAt: new Date().toISOString() });
  });
}
