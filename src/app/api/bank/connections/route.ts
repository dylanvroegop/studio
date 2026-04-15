import { NextResponse } from 'next/server';

import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const identity = await resolveBankIdentity(request);
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(identity.firebaseUid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const result = await supabaseAdmin
      .from('bank_connections')
      .select('id,institution_name,status,last_synced_at,created_at')
      .eq('user_id', identity.bankUserId)
      .order('created_at', { ascending: false });

    if (result.error) {
      return NextResponse.json(
        { ok: false, message: 'Kon bankkoppelingen niet laden.' },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    return NextResponse.json(
      { ok: true, data: result.data || [] },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon bankkoppelingen niet laden.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { ok: false, message },
      { status, headers: noStoreHeaders() }
    );
  }
}

