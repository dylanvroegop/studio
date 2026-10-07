import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { noStoreHeaders, resolveUid } from '@/lib/bank-api-auth';
import { buildInvoiceStartRows, type InvoiceStartInvoice, type InvoiceStartQuote } from '@/lib/invoice-start';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  let uid: string;
  try { uid = await resolveUid(request); }
  catch { return NextResponse.json({ ok: false, message: 'Log opnieuw in.' }, { status: 401, headers: noStoreHeaders() }); }
  try {
    const { firestore } = initFirebaseAdmin();
    const [quotes, invoices, user] = await Promise.all([
      firestore.collection('quotes').where('userId', '==', uid).select(
        'titel', 'title', 'status', 'amount', 'totaalbedrag', 'offerteNummer', 'offerteVersie',
        'archived', 'isCalculationTest', 'updatedAt', 'createdAt', 'financieel.afgesprokenPrijsInclBtw',
        'facturatie', 'klantinformatie.voornaam', 'klantinformatie.achternaam', 'klantinformatie.bedrijfsnaam',
      ).get(),
      firestore.collection('invoices').where('userId', '==', uid).select(
        'quoteId', 'combinedQuoteIds', 'combinedContext', 'linkedMeerwerkbonIds', 'invoiceType', 'status', 'invoiceNumberLabel', 'totalsSnapshot', 'paymentSummary',
      ).get(),
      firestore.collection('users').doc(uid).get(),
    ]);
    const rows = buildInvoiceStartRows(
      quotes.docs.map((snapshot) => ({ ...snapshot.data(), id: snapshot.id } as InvoiceStartQuote)),
      invoices.docs.map((snapshot) => ({ ...snapshot.data(), id: snapshot.id } as InvoiceStartInvoice)),
      user.data()?.settings?.standaardVoorschotPercentage ?? 50,
    );
    return NextResponse.json({ ok: true, rows }, { headers: noStoreHeaders() });
  } catch (error) {
    console.error('Facturatielijst laden mislukt:', error);
    return NextResponse.json({ ok: false, message: 'Facturen konden niet worden geladen. Probeer opnieuw.' }, { status: 500, headers: noStoreHeaders() });
  }
}
