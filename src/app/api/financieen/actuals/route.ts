import { NextResponse } from 'next/server';

import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import {
  buildFinanceBankLedger,
  isInternalOwnAccountTransfer,
  loadConnectedKnabTransactions,
  splitFinanceBankLedgerRowsByCategory,
  type FinanceBankCostLedgerRow,
  type FinanceBankTransaction,
} from '@/lib/finance-bank-ledger';
import { mapProjectCostRow, normalizeProjectCostCategory, PROJECT_COST_CATEGORY_LABELS, type ProjectCostRow } from '@/lib/project-costs';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Timeline = 'month' | 'since-bank-start';

function roundEuro(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function isInPeriod(value: string | null, start: string, end: string): boolean {
  const date = dateOnly(value);
  return Boolean(date && date >= start && date < end);
}

function todayParts(): { today: string; monthStart: string; nextMonthStart: string; tomorrow: string } {
  const now = new Date();
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return {
    today: iso(now),
    monthStart: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    nextMonthStart: iso(new Date(now.getFullYear(), now.getMonth() + 1, 1)),
    tomorrow: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)),
  };
}

function isInternalIncoming(transaction: FinanceBankTransaction): boolean {
  return /bunq|paypal|top[- ]?up|dylan\s+vroegop|vroegop\s+timmerwerken|eigen\s+rekening|interne\s+overboeking/i.test(
    `${transaction.counterparty_name || ''} ${transaction.description || ''}`,
  );
}

function isNonOperatingIncoming(transaction: FinanceBankTransaction): boolean {
  return /\b(borg|waarborg|deposit|terugbetaling|restitutie|refund|creditnota)\b/i.test(
    `${transaction.counterparty_name || ''} ${transaction.description || ''}`,
  );
}

function transactionDateSort(left: FinanceBankTransaction, right: FinanceBankTransaction): number {
  return String(right.booking_date || '').localeCompare(String(left.booking_date || ''));
}

function rowView(row: FinanceBankCostLedgerRow) {
  return {
    id: row.bank_transaction_id,
    date: row.booking_date,
    name: row.supplier_name,
    description: row.description,
    amount: row.amount,
    category: row.category,
    categoryLabel: PROJECT_COST_CATEGORY_LABELS[row.category],
    status: row.match_status,
    sourceCostIds: row.source_cost_ids,
    sourceAmount: row.source_amount,
    sourceDelta: row.source_delta,
    notes: row.notes,
  };
}

function calculateActuals(params: {
  timeline: Timeline;
  firstTransactionDate: string | null;
  transactions: FinanceBankTransaction[];
  rows: FinanceBankCostLedgerRow[];
  costs: ProjectCostRow[];
  matchedCostIds: string[];
}) {
  const { monthStart, nextMonthStart, tomorrow } = todayParts();
  const start = params.timeline === 'since-bank-start'
    ? dateOnly(params.firstTransactionDate) || monthStart
    : monthStart;
  const end = params.timeline === 'since-bank-start' ? tomorrow : nextMonthStart;
  const transactions = params.transactions.filter((transaction) => isInPeriod(transaction.booking_date, start, end));
  const rows = params.rows.filter((row) => isInPeriod(row.booking_date, start, end));
  const incoming = transactions.filter((transaction) => Number(transaction.amount) > 0);
  const outgoing = transactions.filter((transaction) => Number(transaction.amount) < 0 && !isInternalOwnAccountTransfer(transaction));
  const businessRows = rows.filter((row) => !row.is_private);
  const privateRows = rows.filter((row) => row.is_private);
  const externalIncoming = incoming.filter((transaction) => !isInternalIncoming(transaction));
  const operatingIncoming = externalIncoming.filter((transaction) => !isNonOperatingIncoming(transaction));
  const categoryMap = new Map<string, number>();
  businessRows.forEach((row) => {
    categoryMap.set(row.category, roundEuro((categoryMap.get(row.category) || 0) + row.amount));
  });
  const matchedCostIdSet = new Set(params.matchedCostIds);
  const unmatchedSourceCosts = params.costs
    .filter((cost) => isInPeriod(cost.date, start, end))
    .filter((cost) => !matchedCostIdSet.has(cost.id))
    .map((cost) => ({
      id: cost.id,
      date: cost.date,
      name: cost.supplier_name,
      amount: roundEuro(Number(cost.amount_incl_btw) || 0),
      category: normalizeProjectCostCategory(cost.category),
      categoryLabel: PROJECT_COST_CATEGORY_LABELS[normalizeProjectCostCategory(cost.category)],
    }))
    .sort((left, right) => String(right.date).localeCompare(String(left.date)));
  const unmatchedBank = businessRows.filter((row) => row.match_status === 'unmatched');
  const matchedBank = businessRows.filter((row) => row.match_status === 'matched');
  const uniqueBankCount = (ledgerRows: FinanceBankCostLedgerRow[]) => (
    new Set(ledgerRows.map((row) => row.bank_transaction_id)).size
  );
  const outgoingTotal = roundEuro(outgoing.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount) || 0), 0));
  const businessExpenses = roundEuro(businessRows.reduce((sum, row) => sum + row.amount, 0));
  const privateExpenses = roundEuro(privateRows.reduce((sum, row) => sum + row.amount, 0));
  const incomingTotal = roundEuro(incoming.reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0));
  const externalIncomingTotal = roundEuro(externalIncoming.reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0));
  const operatingIncomingTotal = roundEuro(operatingIncoming.reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0));
  const nonOperatingIncomingTotal = roundEuro(externalIncomingTotal - operatingIncomingTotal);

  return {
    timeline: params.timeline,
    periodStart: start,
    periodEnd: end,
    periodLabel: `${start} → ${end}`,
    firstTransactionDate: params.firstTransactionDate,
    lastTransactionDate: [...params.transactions].sort(transactionDateSort)[0]?.booking_date || null,
    transactionCount: transactions.length,
    incomingCount: incoming.length,
    outgoingCount: outgoing.length,
    businessExpenseCount: uniqueBankCount(businessRows),
    privateExpenseCount: uniqueBankCount(privateRows),
    incomingTotal,
    externalIncomingTotal,
    operatingIncomingTotal,
    nonOperatingIncomingTotal,
    outgoingTotal,
    businessExpenses,
    privateExpenses,
    cashProfit: roundEuro(operatingIncomingTotal - businessExpenses),
    categoryTotals: Array.from(categoryMap.entries())
      .map(([category, amount]) => ({ category, label: PROJECT_COST_CATEGORY_LABELS[category as keyof typeof PROJECT_COST_CATEGORY_LABELS], amount }))
      .sort((left, right) => right.amount - left.amount),
    matchedBankCount: uniqueBankCount(matchedBank),
    unmatchedBankCount: uniqueBankCount(unmatchedBank),
    unmatchedBankAmount: roundEuro(unmatchedBank.reduce((sum, row) => sum + row.amount, 0)),
    matchedSourceCount: params.matchedCostIds.length,
    unmatchedSourceCount: unmatchedSourceCosts.length,
    unmatchedSourceAmount: roundEuro(unmatchedSourceCosts.reduce((sum, cost) => sum + cost.amount, 0)),
    unmatchedBankTransactions: unmatchedBank.map(rowView),
    unmatchedSourceCosts: unmatchedSourceCosts.slice(0, 100),
    privateTransactions: privateRows.map(rowView),
    reconciliationNote: 'Knab is leidend. Een bankafschrijving telt één keer mee; facturen en bonnen zijn alleen bronkoppelingen. Interne transfers en borgsommen tellen niet als omzet.',
  };
}

export async function POST(request: Request) {
  try {
    const identity = await resolveBankIdentity(request);
    const body = await request.json().catch(() => ({})) as { timeline?: Timeline };
    const timeline: Timeline = body.timeline === 'month' ? 'month' : 'since-bank-start';
    const [costsResult, transactions, categoryOverridesResult] = await Promise.all([
      supabaseAdmin.from('project_costs').select('*').eq('user_id', identity.firebaseUid),
      loadConnectedKnabTransactions(identity.bankUserId),
      supabaseAdmin
        .from('bank_transaction_category_overrides')
        .select('bank_transaction_id,category')
        .eq('user_id', identity.firebaseUid),
    ]);
    if (costsResult.error) throw new Error(`Kosten konden niet worden geladen: ${costsResult.error.message}`);
    if (categoryOverridesResult.error) throw new Error(`Handmatige categorieën konden niet worden geladen: ${categoryOverridesResult.error.message}`);
    const costs = (costsResult.data || []).map((row) => mapProjectCostRow(row));
    const categoryOverrides = new Map(
      (categoryOverridesResult.data || []).map((row) => [
        String(row.bank_transaction_id),
        normalizeProjectCostCategory(row.category),
      ]),
    );
    const firstTransactionDate = transactions
      .map((transaction) => dateOnly(transaction.booking_date))
      .filter((date): date is string => Boolean(date))
      .sort()[0] || null;
    // Rendering the dashboard is read-only. Rebuilding the ledger in memory is
    // cheap; persisting every row and updating every matched cost on each page
    // view caused hundreds of unnecessary writes and multi-second load times.
    const rows = splitFinanceBankLedgerRowsByCategory({
      rows: buildFinanceBankLedger({
        userId: identity.firebaseUid,
        costs,
        transactions,
        categoryOverrides,
      }),
      costs,
      categoryOverrides,
    });
    const matchedCostIds = Array.from(new Set(rows.flatMap((row) => row.source_cost_ids)));
    const month = calculateActuals({
      timeline: 'month',
      firstTransactionDate,
      transactions,
      rows,
      costs,
      matchedCostIds,
    });
    const sinceBankStart = calculateActuals({
      timeline: 'since-bank-start',
      firstTransactionDate,
      transactions,
      rows,
      costs,
      matchedCostIds,
    });
    return NextResponse.json({
      ok: true,
      data: calculateActuals({
        timeline,
        firstTransactionDate,
        transactions,
        rows,
        costs,
        matchedCostIds,
      }),
      periods: { month, sinceBankStart },
    }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'De echte Knab-cijfers konden niet worden berekend.';
    const status = /unauthorized/i.test(message) ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status, headers: noStoreHeaders() });
  }
}
