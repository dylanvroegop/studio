import { doc, serverTimestamp, type Firestore, type Transaction } from 'firebase/firestore';

import type { InvoiceStatus, Quote } from '@/lib/types';

export function invoiceImpliesAccepted(status: InvoiceStatus | string | undefined | null): boolean {
  return status === 'gedeeltelijk_betaald' || status === 'betaald';
}

export function getEffectiveQuoteStatus(
  quoteStatus: Quote['status'] | undefined,
  hasAcceptedInvoice: boolean
): Quote['status'] {
  if (hasAcceptedInvoice) return 'geaccepteerd';
  return quoteStatus || 'concept';
}

export async function promoteQuoteToAcceptedInTransaction(
  tx: Transaction,
  firestore: Firestore,
  quoteId: string | null | undefined
): Promise<void> {
  if (!quoteId) return;

  const quoteRef = doc(firestore, 'quotes', quoteId);
  const quoteSnap = await tx.get(quoteRef);
  if (!quoteSnap.exists()) return;

  const quoteData = quoteSnap.data() as { status?: Quote['status'] };
  if (quoteData?.status === 'geaccepteerd') return;

  tx.update(quoteRef, {
    status: 'geaccepteerd',
    updatedAt: serverTimestamp(),
  } as any);
}
