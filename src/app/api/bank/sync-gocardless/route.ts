import { NextResponse } from 'next/server';

import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { syncGoCardlessConnection } from '@/lib/gocardless-bank-data/sync';
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

    const connection = await supabaseAdmin
      .from('bank_connections')
      .select('requisition_id')
      .eq('provider', 'gocardless')
      .eq('user_id', identity.bankUserId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const requisitionId = typeof connection.data?.requisition_id === 'string' ? connection.data.requisition_id : '';
    if (connection.error || !requisitionId) {
      return NextResponse.json({ ok: false, error: 'Koppel eerst je Knab-rekening.' }, { status: 400, headers: noStoreHeaders() });
    }

    const result = await syncGoCardlessConnection({ bankUserId: identity.bankUserId, requisitionId });
    return NextResponse.json({ ok: true, ...result }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Synchroniseren met Knab is mislukt.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status, headers: noStoreHeaders() });
  }
}
