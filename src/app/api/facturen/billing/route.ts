import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { INVOICE_BILLING_FIELDS } from '@/lib/invoice-create-server';
import { invoiceTouchesQuote, type InvoiceBillingRow } from '@/lib/invoice-billing';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const quoteId = new URL(request.url).searchParams.get('quoteId');
  if (!quoteId || quoteId.includes('/')) return NextResponse.json({ message: 'Ongeldige offerte.' }, { status: 400 });
  try {
    const { auth, firestore } = initFirebaseAdmin();
    let uid: string;
    try { uid = (await auth.verifyIdToken(token)).uid; }
    catch { return NextResponse.json({ message: 'Unauthorized' }, { status: 401 }); }
    const trialBlocked = await ensureDemoTrialActiveByUid(uid);
    if (trialBlocked) return trialBlocked;
    const [quote, snapshot] = await Promise.all([
      firestore.doc(`quotes/${quoteId}`).get(),
      firestore.collection('invoices').where('userId', '==', uid).select(...INVOICE_BILLING_FIELDS).get(),
    ]);
    if (!quote.exists || quote.data()?.userId !== uid) return NextResponse.json({ message: 'Offerte niet gevonden.' }, { status: 404 });
    const invoices = snapshot.docs.map((row) => ({ ...row.data(), id: row.id } as InvoiceBillingRow))
      .filter((row) => invoiceTouchesQuote(row, quoteId));
    return NextResponse.json({ invoices }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[facturen/billing]', error);
    return NextResponse.json({ message: 'Bestaande facturen konden niet worden gecontroleerd.' }, { status: 500 });
  }
}
