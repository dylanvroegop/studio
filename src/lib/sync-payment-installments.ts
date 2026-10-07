import 'server-only';
import { createHash, randomUUID } from 'crypto';
import type { CollectionReference, Firestore } from 'firebase-admin/firestore';
import { mollieRequest, type MolliePaymentLink } from '@/lib/mollie-client';
import { paymentInstallmentAmounts, type PaymentRequestView } from '@/lib/payment-request';

export class PaymentRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

interface Installment extends PaymentRequestView {
  mollieId?: string | null;
  revision?: number;
  updating?: boolean;
  suppressed?: boolean;
  retired?: Array<{ mollieId: string; url: string; amountCents: number; archivedAt: string }>;
}
interface LinkPayments {
  _embedded: { payments: Array<{ id: string; status: string; paidAt?: string }> };
  _links?: { next?: { href: string } | null };
}

// Eén schrijver per offerte, ook bij twee tabs of een dubbel verzoek.
export async function syncPaymentInstallments(options: {
  firestore: Firestore; collection: CollectionReference; quoteId: string;
  mode: 'test' | 'live'; totalCents: number; description: string; createKind?: 'upfront' | 'final';
}): Promise<PaymentRequestView[]> {
  const { firestore, collection, quoteId, mode, totalCents, description, createKind } = options;
  const lock = collection.doc(`_sync_${mode}`);
  const token = randomUUID();
  await firestore.runTransaction(async transaction => {
    const saved = (await transaction.get(lock)).data();
    if (saved?.until > Date.now()) throw new PaymentRequestError('Betaalverzoeken worden bijgewerkt. Probeer zo opnieuw.', 423);
    transaction.set(lock, { token, until: Date.now() + 240000 });
  });
  try {
    const records: Installment[] = [];
    for (const kind of ['upfront', 'final'] as const) {
      const data = (await collection.doc(`${mode}_${kind}`).get()).data();
      if (data) records.push(data as Installment);
    }
    async function save(item: Installment): Promise<void> { await collection.doc(item.id).set(item); }
    async function complete(item: Installment): Promise<void> {
      if (item.url || item.suppressed) return;
      // Een gereserveerde revisie eerst afronden, ook als de prijs intussen opnieuw wijzigt.
      // Zo raakt een bij Mollie geslaagde maar lokaal mislukte aanmaak nooit verweesd.
      const suffix = item.revision ? `:${item.revision}` : '';
      const key = createHash('sha256').update(`${quoteId}:${mode}:${item.kind}${suffix}`).digest('hex');
      const link = await mollieRequest<MolliePaymentLink>('/payment-links', {
        amount: { currency: 'EUR', value: (item.amountCents / 100).toFixed(2) },
        description: item.description, reusable: false, allowedMethods: ['ideal'],
      }, key);
      const url = link._links?.paymentLink?.href;
      if (!url?.startsWith('https://') || !link.id?.startsWith('pl_')) throw new Error('Ongeldige Mollie-response.');
      Object.assign(item, { url, mollieId: link.id, paidAt: link.paidAt || null, expiresAt: link.expiresAt || null, updating: false });
      await save(item);
    }
    async function refresh(item: Installment): Promise<void> {
      if (!item.mollieId || item.paidAt) return;
      const link = await mollieRequest<MolliePaymentLink>(`/payment-links/${encodeURIComponent(item.mollieId)}`);
      Object.assign(item, { paidAt: link.paidAt || null, expiresAt: link.expiresAt || null });
      if (item.paidAt) item.updating = false;
      await save(item);
    }
    async function checkPayments(item: Installment): Promise<void> {
      let from = '';
      do {
        const page = await mollieRequest<LinkPayments>(`/payment-links/${encodeURIComponent(item.mollieId!)}/payments?limit=250${from ? `&from=${encodeURIComponent(from)}` : ''}`);
        for (const payment of page._embedded.payments) {
          if (payment.status === 'paid') {
            item.paidAt = payment.paidAt || new Date().toISOString();
            item.updating = false;
            await save(item);
            return;
          }
          if (['open', 'pending', 'authorized'].includes(payment.status)) {
            throw new PaymentRequestError('Mollie heeft nog een open betaling via de oude link. Probeer opnieuw zodra die is betaald, geannuleerd of verlopen.', 409);
          }
        }
        from = page._links?.next?.href ? new URL(page._links.next.href).searchParams.get('from') || '' : '';
      } while (from);
    }
    for (const item of records) { await complete(item); await refresh(item); }
    for (const kind of ['upfront', 'final'] as const) {
      let item = records.find(entry => entry.kind === kind);
      if (item?.paidAt) continue;
      let amountCents = paymentInstallmentAmounts(totalCents, records)[kind];
      if (!item && createKind !== kind) continue;
      if (item && item.amountCents === amountCents && !item.updating) continue;
      if (item?.mollieId) {
        // Eerst delen blokkeren, daarna de oude link sluiten. Een reeds gestarte
        // betaling moet definitief zijn voordat er een vervangende link komt.
        item.updating = true;
        await save(item);
        await mollieRequest(`/payment-links/${encodeURIComponent(item.mollieId)}`, { archived: true }, undefined, 'PATCH');
        await checkPayments(item);
        await refresh(item);
        if (item.paidAt) continue;
        amountCents = paymentInstallmentAmounts(totalCents, records)[kind];
      }
      const retired = [...(item?.retired || [])];
      if (item?.mollieId) retired.push({ mollieId: item.mollieId, url: item.url, amountCents: item.amountCents, archivedAt: new Date().toISOString() });
      const otherPaid = records.some(entry => entry.kind !== kind && entry.paidAt);
      const replacement: Installment = {
        id: `${mode}_${kind}`, kind, mode, amountCents, quoteTotalCents: totalCents,
        description: `${description} - ${otherPaid ? 'Restant' : kind === 'upfront' ? '50% vooraf' : '50% achteraf'}`,
        createdAt: new Date().toISOString(), url: '', mollieId: null, paidAt: null, expiresAt: null,
        revision: item ? (item.revision || 0) + 1 : 0, retired, suppressed: amountCents === 0,
      };
      // Voor de externe aanroep opslaan: elke retry gebruikt dezelfde revisie/key.
      await save(replacement);
      if (item) records.splice(records.indexOf(item), 1, replacement); else records.push(replacement);
      item = replacement;
      await complete(item);
    }
    return records;
  } finally {
    await firestore.runTransaction(async transaction => {
      if ((await transaction.get(lock)).data()?.token === token) transaction.delete(lock);
    });
  }
}
