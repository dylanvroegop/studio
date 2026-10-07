import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { applyInvoiceBankPayment, InvoiceBankError, invoiceBankView, loadInvoiceBankContext } from '@/lib/invoice-bank-payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function invoiceId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('/') || value.length > 160) {
    throw new InvoiceBankError('Factuur ontbreekt.', 400);
  }
  return value.trim();
}

function failure(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : 'Bankbetalingen konden niet worden gecontroleerd.';
  const status = error instanceof InvoiceBankError ? error.status
    : /unauthorized|id token|auth\//i.test(message) ? 401 : 500;
  return NextResponse.json({ ok: false, message }, { status, headers: noStoreHeaders() });
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const identity = await resolveBankIdentity(request);
    const id = invoiceId(new URL(request.url).searchParams.get('invoiceId'));
    const { firestore } = initFirebaseAdmin();
    const context = await loadInvoiceBankContext({ firestore, uid: identity.firebaseUid, bankUserId: identity.bankUserId, invoiceId: id });
    return NextResponse.json({ ok: true, data: invoiceBankView(context) }, { headers: noStoreHeaders() });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const identity = await resolveBankIdentity(request);
    const blocked = await ensureDemoTrialActiveByUid(identity.firebaseUid);
    if (blocked) return blocked;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const id = invoiceId(body?.invoiceId);
    const action = body?.action;
    if (action !== 'reconcile' && action !== 'confirm') throw new InvoiceBankError('Ongeldige actie.', 400);
    const { firestore } = initFirebaseAdmin();
    const options = { firestore, uid: identity.firebaseUid, bankUserId: identity.bankUserId, invoiceId: id };
    let context = await loadInvoiceBankContext(options);
    let applied = 0;
    const candidates = invoiceBankView(context).candidates;
    if (action === 'confirm') {
      const candidate = candidates.find((item) => item.transactionId === body?.transactionId);
      const credit = context.bank.credits.find((item) => item.id === body?.transactionId);
      const mode = body?.mode;
      if (!candidate || !credit || (mode !== 'add' && mode !== 'link')) throw new InvoiceBankError('Betaalvoorstel is gewijzigd. Vernieuw de betaalgegevens.');
      const amountCents = mode === 'add' ? candidate.suggestedCents : candidate.linkExistingCents;
      if (body?.amountCents !== amountCents || amountCents <= 0) throw new InvoiceBankError('Het bedrag is gewijzigd. Controleer het nieuwe voorstel.');
      applied = Number(await applyInvoiceBankPayment({ ...options, credit, credits: context.bank.credits, amountCents, mode, automatic: false }));
    } else {
      for (const candidate of candidates.filter((item) => item.automatic)) {
        const credit = context.bank.credits.find((item) => item.id === candidate.transactionId)!;
        applied += Number(await applyInvoiceBankPayment({ ...options, credit, credits: context.bank.credits,
          amountCents: candidate.suggestedCents, mode: 'add', automatic: true }));
      }
    }
    if (applied) context = await loadInvoiceBankContext(options);
    return NextResponse.json({ ok: true, applied, data: invoiceBankView(context) }, { headers: noStoreHeaders() });
  } catch (error) { return failure(error); }
}
