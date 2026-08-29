import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { deriveBankUserId } from '@/lib/bank-user-id';
import { loadConnectedKnabTransactions } from '@/lib/finance-bank-ledger';
import { PROJECT_COST_CATEGORIES, type ProjectCostCategory } from '@/lib/project-costs';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}

function isProjectCostCategory(value: string): value is ProjectCostCategory {
  return value !== 'profit' && (PROJECT_COST_CATEGORIES as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid || '';
    if (!uid) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const bankTransactionId = safeString(body?.bank_transaction_id);
    const category = safeString(body?.category).toLowerCase();
    if (!bankTransactionId || !isProjectCostCategory(category)) {
      return NextResponse.json({ ok: false, message: 'Banktransactie of categorie is ongeldig.' }, { status: 400 });
    }

    const transactions = await loadConnectedKnabTransactions(deriveBankUserId(uid));
    if (!transactions.some((transaction) => transaction.id === bankTransactionId)) {
      return NextResponse.json({ ok: false, message: 'Banktransactie niet gevonden.' }, { status: 404 });
    }

    const result = await supabaseAdmin
      .from('bank_transaction_category_overrides')
      .upsert({
        user_id: uid,
        bank_transaction_id: bankTransactionId,
        category,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,bank_transaction_id' })
      .select('bank_transaction_id,category')
      .single();
    if (result.error) throw new Error(result.error.message);

    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon categorie niet opslaan.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
