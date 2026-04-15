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

    const connection = await supabaseAdmin
      .from('bank_connections')
      .select('id')
      .eq('user_id', identity.bankUserId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (connection.error || !connection.data) {
      return NextResponse.json(
        { ok: true, data: [] },
        { headers: noStoreHeaders() }
      );
    }

    const connectionId = typeof connection.data.id === 'string' ? connection.data.id : '';
    if (!connectionId) {
      return NextResponse.json(
        { ok: true, data: [] },
        { headers: noStoreHeaders() }
      );
    }

    const accounts = await supabaseAdmin
      .from('bank_accounts')
      .select('id')
      .eq('connection_id', connectionId);

    if (accounts.error) {
      return NextResponse.json(
        { ok: false, message: 'Kon bankrekeningen niet laden.' },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    const ids = (accounts.data || []).map((item) => item.id).filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json(
        { ok: true, data: [] },
        { headers: noStoreHeaders() }
      );
    }

    const transactions = await supabaseAdmin
      .from('bank_transactions')
      .select('*')
      .in('bank_account_id', ids)
      .order('booking_date', { ascending: false })
      .limit(50);

    if (transactions.error) {
      return NextResponse.json(
        { ok: false, message: 'Kon transacties niet laden.' },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    return NextResponse.json(
      { ok: true, data: transactions.data || [] },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon transacties niet laden.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { ok: false, message },
      { status, headers: noStoreHeaders() }
    );
  }
}
