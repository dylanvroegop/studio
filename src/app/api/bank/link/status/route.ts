import { NextResponse } from 'next/server';

import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { noStoreHeaders, resolveUid } from '@/lib/bank-api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const uid = await resolveUid(request);
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const connection = await supabaseAdmin
      .from('bank_connections')
      .select('id,status,institution_id,institution_name,requisition_id,last_error,last_synced_at,accounts,created_at,updated_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (connection.error) {
      return NextResponse.json(
        { ok: false, message: connection.error.message },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        data: connection.data || null,
      },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon bankstatus niet laden.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { ok: false, message },
      { status, headers: noStoreHeaders() }
    );
  }
}

