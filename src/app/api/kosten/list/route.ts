import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import {
  buildFinanceBankLedger,
  isProfitAccountTransfer,
  loadConnectedKnabTransactions,
  splitFinanceBankLedgerRowsByCategory,
} from '@/lib/finance-bank-ledger';
import { mapProjectCostRow, normalizeProjectCostCategory, roundEuro, type ProjectCostRow } from '@/lib/project-costs';
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

async function fetchProjectCostsViaRest(uid: string): Promise<unknown[]> {
  const supabaseUrl = safeString(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceKey = safeString(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  const url = new URL('/rest/v1/project_costs', supabaseUrl);
  url.searchParams.set('select', '*');
  url.searchParams.set('user_id', `eq.${uid}`);
  url.searchParams.append('order', 'date.desc');
  url.searchParams.append('order', 'created_at.desc');

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

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function isProjectCostsSchemaMismatchError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('project_costs.') && lower.includes('does not exist');
}

export async function GET(request: Request) {
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

    const [rows, knabTransactions, categoryOverridesResult] = await Promise.all([
      fetchProjectCostsViaRest(uid),
      loadConnectedKnabTransactions(deriveBankUserId(uid)),
      supabaseAdmin
        .from('bank_transaction_category_overrides')
        .select('bank_transaction_id,category')
        .eq('user_id', uid),
    ]);
    if (categoryOverridesResult.error) throw new Error(categoryOverridesResult.error.message);
    const projectCosts = rows.map((row) => mapProjectCostRow(row));
    const projectCostById = new Map(projectCosts.map((cost) => [cost.id, cost]));
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
    const ledgerRows = splitFinanceBankLedgerRowsByCategory({
      rows: bankLedgerRows,
      costs: projectCosts,
      categoryOverrides,
    });

    // Knab is the cost ledger. The amount of each debit is counted exactly
    // once, but a mixed invoice can produce multiple category parts. Imported
    // invoices and receipts provide the split, VAT, quote and attachments.
    const mappedRows = ledgerRows.map((ledgerRow) => {
      const sources = ledgerRow.source_cost_ids
        .map((costId) => projectCostById.get(costId))
        .filter((cost): cost is ProjectCostRow => Boolean(cost));
      const sourceIncl = roundEuro(sources.reduce((sum, cost) => sum + cost.amount_incl_btw, 0));
      const sourceExcl = roundEuro(sources.reduce((sum, cost) => sum + cost.amount_excl_btw, 0));
      const sourceBtw = roundEuro(sources.reduce((sum, cost) => sum + cost.btw_amount, 0));
      const sourceRatio = sourceIncl > 0 ? ledgerRow.amount / sourceIncl : 0;
      const amountExcl = sources.length > 0
        ? roundEuro(sourceExcl * sourceRatio)
        : ledgerRow.amount;
      const btwAmount = sources.length > 0
        ? roundEuro(ledgerRow.amount - amountExcl)
        : 0;
      const receiptFiles = Array.from(
        new Map(
          sources
            .flatMap((cost) => cost.receipt_files || [])
            .map((file) => [file.url || file.path || file.filename, file] as const)
        ).values()
      );
      const offerteIds = uniqueStrings(sources.map((cost) => cost.offerte_id || ''));
      const sourceDates = uniqueStrings(sources.map((cost) => safeString(cost.date).slice(0, 10)));
      const sourceLineItems = sources.flatMap((cost) => cost.line_items || []);
      const sourceLineDescriptions = uniqueStrings(sourceLineItems.map((item) => safeString(item.description)));
      const sourceSummary = sourceLineDescriptions.length > 0
        ? `${sourceDates.length === 1 ? `Aankoop ${sourceDates[0]}` : `${sourceDates.length} aankoopdatums`} · ${sourceLineDescriptions.length} productregels: ${sourceLineDescriptions.join(' · ')}`
        : ledgerRow.description;
      const date = safeString(ledgerRow.booking_date);
      const createdAt = date ? `${date}T00:00:00.000Z` : new Date(0).toISOString();
      const category = ledgerRow.is_private ? 'eigen_verbruik' : ledgerRow.category;
      const btwPercentage = amountExcl !== 0 ? roundEuro((btwAmount / amountExcl) * 100) : 0;

      return mapProjectCostRow({
        id: `bank-knab-${ledgerRow.bank_transaction_id}-${category}`,
        user_id: uid,
        offerte_id: offerteIds.length === 1 ? offerteIds[0] : null,
        category,
        supplier_name: ledgerRow.supplier_name,
        description: sourceSummary,
        line_items: sourceLineItems,
        amount_excl_btw: amountExcl,
        btw_percentage: btwPercentage,
        btw_amount: btwAmount,
        amount_incl_btw: ledgerRow.amount,
        date,
        receipt_url: receiptFiles[0]?.url || sources.find((cost) => cost.receipt_url)?.receipt_url || null,
        receipt_files: receiptFiles,
        status: 'bank_transaction',
        payment_type: ledgerRow.is_private ? 'private' : 'unknown',
        payment_status: ledgerRow.is_private ? 'private' : 'paid',
        reconciliation_status: ledgerRow.is_private
          ? 'not_applicable'
          : ledgerRow.match_status === 'matched' ? 'matched' : 'unmatched',
        paid_bank_transaction_id: ledgerRow.bank_transaction_id,
        paid_at: date || null,
        source_email: uniqueStrings(sources.map((cost) => cost.source_email || '')).join(', ') || null,
        source_filename: uniqueStrings(sources.map((cost) => cost.source_filename || '')).join(', ') || null,
        created_at: createdAt,
        updated_at: createdAt,
      });
    });

    // Transfers to the user's own profit account remain visible for cashflow
    // tracking, but are deliberately not part of the expense ledger above.
    // They use a reserved category so the UI can show them on their own tab
    // without changing business costs, VAT, or profit calculations.
    const internalTransferRows = knabTransactions
      .filter((transaction) => isProfitAccountTransfer(transaction))
      .map((transaction) => {
        const date = safeString(transaction.booking_date);
        const createdAt = date ? `${date}T00:00:00.000Z` : new Date(0).toISOString();
        const amount = roundEuro(Math.abs(Number(transaction.amount) || 0));
        return mapProjectCostRow({
          id: `bank-knab-profit-${transaction.id}`,
          user_id: uid,
          offerte_id: null,
          category: 'profit',
          supplier_name: safeString(transaction.counterparty_name) || 'Eigen winstrekening',
          description: safeString(transaction.description) || 'Interne overboeking naar winstrekening',
          line_items: [],
          amount_excl_btw: amount,
          btw_percentage: 0,
          btw_amount: 0,
          amount_incl_btw: amount,
          date,
          receipt_url: null,
          receipt_files: [],
          status: 'internal_profit_transfer',
          payment_type: 'unknown',
          payment_status: 'paid',
          reconciliation_status: 'not_applicable',
          paid_bank_transaction_id: transaction.id,
          paid_at: date || null,
          source_email: null,
          source_filename: null,
          created_at: createdAt,
          updated_at: createdAt,
        });
      });

    mappedRows.push(...internalTransferRows);

    // Knab is authoritative from the first available connected transaction.
    // Older imported costs cannot be verified against this bank history, but
    // they are still real documented costs and must not disappear from the
    // category lists. Costs already matched to a later debit remain excluded
    // here so they can never be counted twice.
    const firstKnabDate = knabTransactions
      .map((transaction) => safeString(transaction.booking_date).slice(0, 10))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      .sort()[0] || null;
    const matchedCostIds = new Set(bankLedgerRows.flatMap((row) => row.source_cost_ids));
    const historicalSourceRows = firstKnabDate
      ? projectCosts
        .filter((cost) => safeString(cost.date).slice(0, 10) < firstKnabDate)
        .filter((cost) => !matchedCostIds.has(cost.id))
        .map((cost) => ({ ...cost, status: 'historical_source_cost' }))
      : [];
    mappedRows.push(...historicalSourceRows);

    mappedRows.sort((left, right) => {
      const leftTime = new Date(left.date || left.created_at).getTime();
      const rightTime = new Date(right.date || right.created_at).getTime();
      return rightTime - leftTime;
    });
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        '[kosten/list]',
        JSON.stringify({
          uid,
          source: 'knab-ledger',
          rowCount: mappedRows.length,
          historicalSourceCount: historicalSourceRows.length,
          firstKnabDate,
        })
      );
    }
    return NextResponse.json({ ok: true, data: mappedRows }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon kosten niet laden.';
    return NextResponse.json(
      { ok: false, message },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}
