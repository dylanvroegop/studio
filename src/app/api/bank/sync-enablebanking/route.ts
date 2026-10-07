import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { syncEnableBankingConnection } from '@/lib/enable-banking/sync';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { reconcileInvoiceBankPaymentsAfterSync, type InvoiceBankSyncResult } from '@/lib/invoice-bank-payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const identity = await resolveBankIdentity(request);
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(identity.firebaseUid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }
    let connection = await supabaseAdmin.from('bank_connections')
      .select('requisition_id')
      .eq('provider', 'enablebanking')
      .eq('user_id', identity.bankUserId)
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!connection.error && !connection.data) {
      connection = await supabaseAdmin.from('bank_connections')
        .select('requisition_id')
        .eq('provider', 'enablebanking')
        .eq('user_id', identity.bankUserId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    }
    const sessionId = typeof connection.data?.requisition_id === 'string' ? connection.data.requisition_id : '';
    if (connection.error || !sessionId || sessionId.startsWith('pending:')) {
      return NextResponse.json({ ok: false, error: 'Koppel eerst je Knab-rekening.' }, { status: 400, headers: noStoreHeaders() });
    }
    const result = await syncEnableBankingConnection({ bankUserId: identity.bankUserId, sessionId });
    if (result.status !== 'connected') {
      return NextResponse.json(
        { ok: false, ...result, error: `Enable Banking status: ${result.status}` },
        { status: 409, headers: noStoreHeaders() },
      );
    }
    let invoiceMatching: InvoiceBankSyncResult;
    try {
      invoiceMatching = await reconcileInvoiceBankPaymentsAfterSync({
        firestore: initFirebaseAdmin().firestore, uid: identity.firebaseUid, bankUserId: identity.bankUserId,
      });
    } catch (error) {
      // Een factuurconflict mag een geslaagde bankimport niet ongedaan verklaren.
      invoiceMatching = { applied: 0, remaining: 0, warnings: [
        error instanceof Error ? error.message : 'Bank bijgewerkt; factuurbetalingen konden niet worden gekoppeld.',
      ] };
    }
    return NextResponse.json({ ok: true, ...result, invoiceMatching }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Synchroniseren met Knab is mislukt.';
    return NextResponse.json({ ok: false, error: message }, { status: message === 'Unauthorized' ? 401 : 500, headers: noStoreHeaders() });
  }
}
