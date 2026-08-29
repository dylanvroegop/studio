import { NextResponse } from 'next/server';

import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import { mapProjectCostRow } from '@/lib/project-costs';
import { loadConnectedKnabTransactions, reconcileFinanceBankLedger } from '@/lib/finance-bank-ledger';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const identity = await resolveBankIdentity(request);
    const costsResult = await supabaseAdmin.from('project_costs').select('*').eq('user_id', identity.firebaseUid);
    const transactions = await loadConnectedKnabTransactions(identity.bankUserId);
    /*
     * Never use bank_transactions.user_id here: that identifier is shared by
     * the old bunq import and the Knab connection. The connected Knab account
     * is the source of truth for this ledger.
     */
    const costs = (costsResult.data || []).map((row) => mapProjectCostRow(row));
    if (costsResult.error) throw new Error(`Kosten konden niet worden geladen: ${costsResult.error.message}`);
    const result = await reconcileFinanceBankLedger({ userId: identity.firebaseUid, costs, transactions });
    const business = result.rows.filter((row) => !row.is_private);
    const privateRows = result.rows.filter((row) => row.is_private);
    return NextResponse.json({
      ok: true,
      data: {
        rowCount: result.rows.length,
        businessCount: business.length,
        businessAmount: business.reduce((sum, row) => sum + row.amount, 0),
        privateCount: privateRows.length,
        privateAmount: privateRows.reduce((sum, row) => sum + row.amount, 0),
        matchedCount: business.filter((row) => row.match_status === 'matched').length,
        unmatchedCount: business.filter((row) => row.match_status === 'unmatched').length,
        matchedCostCount: result.matchedCostIds.length,
      },
    }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Knab-kasboek kon niet worden opgebouwd.';
    const status = /unauthorized/i.test(message) ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status, headers: noStoreHeaders() });
  }
}
