import { NextResponse } from 'next/server';

import { noStoreHeaders, resolveUid } from '@/lib/bank-api-auth';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { mapBankTransactionRow } from '@/lib/bank-overzicht';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isMissingBankRelationError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('bank_transactions')
    || lower.includes('bank_connections')
    || lower.includes('does not exist')
    || lower.includes('schema cache');
}

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
      .select('id,status,institution_id,institution_name,last_error,last_synced_at,accounts,created_at,updated_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (connection.error) {
      if (isMissingBankRelationError(connection.error.message)) {
        return NextResponse.json(
          {
            ok: true,
            mode: 'project_costs_fallback',
            data: [],
            connection: null,
            message: 'Banktabellen ontbreken nog in Supabase. Draai eerst de bank-migratie.',
          },
          { headers: noStoreHeaders() }
        );
      }
      return NextResponse.json(
        { ok: false, message: connection.error.message },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    const transactionsResult = await supabaseAdmin
      .from('bank_transactions')
      .select('*')
      .eq('user_id', uid)
      .order('booked_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300);

    if (transactionsResult.error) {
      if (isMissingBankRelationError(transactionsResult.error.message)) {
        return NextResponse.json(
          {
            ok: true,
            mode: 'project_costs_fallback',
            data: [],
            connection: connection.data || null,
            message: 'Banktransacties tabel ontbreekt nog in Supabase. Draai eerst de bank-migratie.',
          },
          { headers: noStoreHeaders() }
        );
      }
      return NextResponse.json(
        { ok: false, message: transactionsResult.error.message },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        mode: 'bank_transactions',
        data: (transactionsResult.data || []).map((row) => mapBankTransactionRow(row)),
        connection: connection.data || null,
      },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon banktransacties niet laden.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status, headers: noStoreHeaders() });
  }
}
