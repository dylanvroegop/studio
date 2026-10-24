import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import {
  buildFinanceBankLedger,
  isInternalOwnAccountTransfer,
  loadKnabTransactionHistory,
} from '@/lib/finance-bank-ledger';
import { mapProjectCostRow, normalizeProjectCostCategory } from '@/lib/project-costs';
import { buildKnabCostList } from '@/lib/knab-cost-list';
import { deriveBankUserId } from '@/lib/bank-user-id';
import { fetchWithSupabaseClockSkewRetry, supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function noStoreHeaders(): HeadersInit {
  return {
    'Cache-Control': 'no-store',
  };
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function fetchProjectCostsPage(uid: string, offset: number): Promise<unknown[]> {
  const supabaseUrl = safeString(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceKey = safeString(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  const url = new URL('/rest/v1/project_costs', supabaseUrl);
  url.searchParams.set('select', '*');
  url.searchParams.set('user_id', `eq.${uid}`);
  url.searchParams.set('order', 'date.desc,created_at.desc,id.asc');
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', '500');

  const response = await fetchWithSupabaseClockSkewRetry(url.toString(), {
    method: 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Cache-Control': 'no-store',
    },
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = safeString(
      (payload as { message?: unknown; error?: unknown } | null)?.message
      || (payload as { error?: unknown } | null)?.error
    );
    throw new Error(message || `Supabase REST HTTP ${response.status}`);
  }

  if (!Array.isArray(payload)) {
    throw new Error('Supabase REST gaf geen geldige array terug.');
  }

  return payload;
}

async function fetchProjectCostsViaRest(uid: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (;;) {
    const page = await fetchProjectCostsPage(uid, rows.length);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

export const maxDuration = 120;

export async function GET(request: Request) { return handleList(request); }
export async function POST(request: Request) { return handleList(request); }

async function handleList(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json(
        { ok: false, message: 'Unauthorized' },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid || '';
    if (!uid) {
      return NextResponse.json(
        { ok: false, message: 'Unauthorized' },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const [rows, knabHistory, categoryOverridesResult] = await Promise.all([
      fetchProjectCostsViaRest(uid),
      loadKnabTransactionHistory(deriveBankUserId(uid)),
      supabaseAdmin
        .from('bank_transaction_category_overrides')
        .select('bank_transaction_id,category')
        .eq('user_id', uid),
    ]);
    if (categoryOverridesResult.error) throw new Error(categoryOverridesResult.error.message);
    const knabTransactions = knabHistory.transactions;
    const projectCosts = rows.map((row) => ({
      ...mapProjectCostRow(row),
      document_type: safeString((row as Record<string, unknown>)?.document_type) || null,
    }));
    const categoryOverrides = new Map(
      (categoryOverridesResult.data || []).map((row) => [
        String(row.bank_transaction_id),
        normalizeProjectCostCategory(row.category),
      ])
    );
    const bankLedgerRows = buildFinanceBankLedger({
      userId: uid,
      transactions: knabTransactions,
      costs: projectCosts,
      categoryOverrides,
    });
    const { data, privateCredits, bankReconciliation } = buildKnabCostList({
      userId: uid,
      transactions: knabTransactions,
      ledgerRows: bankLedgerRows,
      costs: projectCosts,
      internalTransferIds: new Set(knabTransactions.filter(isInternalOwnAccountTransfer).map((row) => row.id)),
      categoryOverrides,
    });

    return NextResponse.json({
      ok: true,
      data,
      privateCredits,
      sourceCosts: projectCosts,
      bankReconciliation,
      bankHistory: knabHistory.metadata,
      ai: { pending: false, changed: 0 },
      aiError: null,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon kosten niet laden.';
    return NextResponse.json(
      { ok: false, message },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}
