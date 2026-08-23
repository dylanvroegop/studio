import { NextResponse } from 'next/server';

import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { syncEnableBankingConnection } from '@/lib/enable-banking/sync';
import { supabaseAdmin } from '@/lib/supabase-admin';

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
    const connection = await supabaseAdmin.from('bank_connections')
      .select('requisition_id')
      .eq('provider', 'enablebanking')
      .eq('user_id', identity.bankUserId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const sessionId = typeof connection.data?.requisition_id === 'string' ? connection.data.requisition_id : '';
    if (connection.error || !sessionId || sessionId.startsWith('pending:')) {
      return NextResponse.json({ ok: false, error: 'Koppel eerst je Knab-rekening.' }, { status: 400, headers: noStoreHeaders() });
    }
    const result = await syncEnableBankingConnection({ bankUserId: identity.bankUserId, sessionId });
    return NextResponse.json({ ok: true, ...result }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Synchroniseren met Knab is mislukt.';
    return NextResponse.json({ ok: false, error: message }, { status: message === 'Unauthorized' ? 401 : 500, headers: noStoreHeaders() });
  }
}
