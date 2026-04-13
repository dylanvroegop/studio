import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { mapBankTransactionRow, mapProjectCostToBankFallback } from '@/lib/bank-overzicht';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function noStoreHeaders(): HeadersInit {
  return {
    'Cache-Control': 'no-store',
  };
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function isMissingRelationError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('does not exist') || (lower.includes('relation') && lower.includes('bank_transactions'));
}

async function resolveUid(request: Request): Promise<string> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) throw new Error('Unauthorized');
  const { auth } = initFirebaseAdmin();
  const decoded = await auth.verifyIdToken(token);
  const uid = decoded?.uid || '';
  if (!uid) throw new Error('Unauthorized');
  return uid;
}

export async function GET(request: Request) {
  try {
    const uid = await resolveUid(request);
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const transactionsResult = await supabaseAdmin
      .from('bank_transactions')
      .select('*')
      .eq('user_id', uid)
      .order('booked_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300);

    if (transactionsResult.error && !isMissingRelationError(transactionsResult.error.message)) {
      return NextResponse.json(
        { ok: false, message: transactionsResult.error.message },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    if (!transactionsResult.error && Array.isArray(transactionsResult.data)) {
      return NextResponse.json(
        {
          ok: true,
          mode: 'bank_transactions',
          data: transactionsResult.data.map((row) => mapBankTransactionRow(row)),
        },
        { headers: noStoreHeaders() }
      );
    }

    const fallbackCosts = await supabaseAdmin
      .from('project_costs')
      .select('id,user_id,category,supplier_name,description,amount_incl_btw,date,created_at,updated_at')
      .eq('user_id', uid)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300);

    if (fallbackCosts.error) {
      return NextResponse.json(
        { ok: false, message: fallbackCosts.error.message },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    const rows = (fallbackCosts.data || []).map((row) => mapProjectCostToBankFallback(row));
    return NextResponse.json(
      {
        ok: true,
        mode: 'project_costs_fallback',
        data: rows,
      },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon banktransacties niet laden.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status, headers: noStoreHeaders() });
  }
}
