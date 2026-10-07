import type { Firestore } from 'firebase/firestore';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import type { CreateInvoiceParams } from '@/lib/invoice-document';
import { type InvoiceBillingRow } from '@/lib/invoice-billing';

function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function createInvoiceFromQuote(firestore: Firestore, params: CreateInvoiceParams): Promise<string> {
  const user = getAuth(firestore.app).currentUser;
  if (!user || user.uid !== params.userId) throw new Error('Log opnieuw in om een factuur te maken.');
  const token = await user.getIdToken();
  const response = await fetch('/api/facturen/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    // Offerte, calculatie en instellingen worden op de server opnieuw gelezen.
    body: JSON.stringify({ ...params, quote: undefined, settings: undefined, calculationSnapshot: undefined }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.invoiceId) {
    throw new Error(payload.message || 'Kon factuur niet aanmaken.');
  }
  return payload.invoiceId;
}

export async function loadQuoteInvoiceBilling(firestore: Firestore, params: { userId: string; quoteId: string }): Promise<InvoiceBillingRow[]> {
  const user = getAuth(firestore.app).currentUser;
  if (!user || user.uid !== params.userId) throw new Error('Log opnieuw in om facturen te laden.');
  const response = await fetch(`/api/facturen/billing?quoteId=${encodeURIComponent(params.quoteId)}`, {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  const payload = await response.json();
  if (!response.ok || !Array.isArray(payload.invoices)) throw new Error(payload.message || 'Facturen konden niet worden geladen.');
  return payload.invoices;
}

export async function findExistingVoorschotInvoiceId(
  firestore: Firestore,
  params: { userId: string; quoteId: string }
): Promise<string | null> {
  const ref = collection(firestore, 'invoices');
  const q = query(
    ref,
    where('userId', '==', params.userId),
    where('quoteId', '==', params.quoteId),
    where('invoiceType', '==', 'voorschot')
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const candidates = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((d) => d?.quoteId === params.quoteId)
    .filter((d) => (d?.invoiceType ?? 'eind') === 'voorschot')
    .filter((d) => d?.status !== 'geannuleerd');

  if (candidates.length > 1) throw new Error('Meerdere voorschotfacturen gevonden. Controleer de facturen.');
  return candidates[0]?.id ?? null;
}

export async function getInvoiceSnapshotForAdjustments(
  firestore: Firestore,
  invoiceId: string
): Promise<{
  id: string;
  invoiceNumberLabel: string;
  status: string;
  totaalInclBtw: number;
  paidAmount: number;
} | null> {
  const ref = doc(firestore, 'invoices', invoiceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as any;

  const status = (data?.status ?? 'concept').toString();
  const paidAmount = status !== 'concept' ? (safeNumber(data?.paymentSummary?.paidAmount) ?? 0) : 0;

  return {
    id: snap.id,
    invoiceNumberLabel: (data?.invoiceNumberLabel ?? '').toString(),
    status,
    totaalInclBtw: safeNumber(data?.totalsSnapshot?.totaalInclBtw) ?? 0,
    paidAmount,
  };
}
