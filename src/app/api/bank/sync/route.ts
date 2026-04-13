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

function buildMockRows(uid: string): Array<Record<string, unknown>> {
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  return [
    {
      user_id: uid,
      external_id: `mock-${now.getTime()}-1`,
      description: 'Tankbeurt bedrijfsbus',
      counterparty_name: 'Shell Express',
      amount: 102.45,
      currency: 'EUR',
      direction: 'debit',
      booked_at: new Date(now.getTime() - day).toISOString(),
      category: 'brandstof',
      linked_cost_id: null,
      status: 'new',
    },
    {
      user_id: uid,
      external_id: `mock-${now.getTime()}-2`,
      description: 'Materialen bestelling',
      counterparty_name: 'Bouwmaat',
      amount: 389.12,
      currency: 'EUR',
      direction: 'debit',
      booked_at: new Date(now.getTime() - day * 2).toISOString(),
      category: 'materiaal',
      linked_cost_id: null,
      status: 'new',
    },
    {
      user_id: uid,
      external_id: `mock-${now.getTime()}-3`,
      description: 'Aanschaf gereedschap',
      counterparty_name: 'Toolstation',
      amount: 74.99,
      currency: 'EUR',
      direction: 'debit',
      booked_at: new Date(now.getTime() - day * 3).toISOString(),
      category: 'gereedschap',
      linked_cost_id: null,
      status: 'new',
    },
  ];
}

export async function POST(request: Request) {
  try {
    const uid = await resolveUid(request);
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const insertRows = buildMockRows(uid);
    const inserted = await supabaseAdmin
      .from('bank_transactions')
      .insert(insertRows)
      .select('*');

    if (inserted.error && !isMissingRelationError(inserted.error.message)) {
      return NextResponse.json(
        { ok: false, message: inserted.error.message },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    if (!inserted.error && Array.isArray(inserted.data)) {
      return NextResponse.json(
        {
          ok: true,
          mode: 'bank_transactions',
          inserted_count: inserted.data.length,
          data: inserted.data.map((row) => mapBankTransactionRow(row)),
          message: 'Testtransacties zijn toegevoegd aan bank_overzicht.',
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
      .limit(80);

    if (fallbackCosts.error) {
      return NextResponse.json(
        { ok: false, message: fallbackCosts.error.message },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        mode: 'project_costs_fallback',
        inserted_count: 0,
        data: (fallbackCosts.data || []).map((row) => mapProjectCostToBankFallback(row)),
        message: 'Testmodus actief: fallback op bestaande kosten omdat bank_transactions tabel nog ontbreekt.',
      },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon banksync niet uitvoeren.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status, headers: noStoreHeaders() });
  }
}
