import { NextResponse } from 'next/server';

import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import { buildBouwmaatReconciliation, type BouwmaatBankTransaction } from '@/lib/bouwmaat-reconciliation';
import { loadConnectedKnabTransactions } from '@/lib/finance-bank-ledger';
import { mapProjectCostRow } from '@/lib/project-costs';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isSchemaMismatch(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('could not find the') || lower.includes('does not exist');
}

export async function GET(request: Request) {
  try {
    const identity = await resolveBankIdentity(request);
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(identity.firebaseUid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const [costsResult, transactions] = await Promise.all([
      supabaseAdmin
        .from('project_costs')
        .select('*')
        .eq('user_id', identity.firebaseUid)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      loadConnectedKnabTransactions(identity.bankUserId),
    ]);

    if (costsResult.error) {
      return NextResponse.json(
        { ok: false, message: `Bouwmaat-kosten konden niet worden geladen: ${costsResult.error.message}` },
        { status: isSchemaMismatch(costsResult.error.message) ? 503 : 500, headers: noStoreHeaders() },
      );
    }
    const costs = (costsResult.data || []).map((row) => mapProjectCostRow(row));
    const bankTransactions: BouwmaatBankTransaction[] = transactions.map((row) => ({
      id: safeString(row.id),
      amount: Number(row.amount) || 0,
      booking_date: safeString(row.booking_date) || null,
      counterparty_name: safeString(row.counterparty_name) || null,
      description: safeString(row.description) || null,
      reconciliation_group_id: safeString(row.reconciliation_group_id) || null,
    })).filter((row) => row.id);

    return NextResponse.json(
      { ok: true, data: buildBouwmaatReconciliation({ costs, bankTransactions }) },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bouwmaat-reconciliatie kon niet worden geladen.';
    const status = /unauthorized/i.test(message) ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status, headers: noStoreHeaders() });
  }
}
