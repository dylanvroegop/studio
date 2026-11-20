import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { extractBearerToken, noStoreHeaders } from '@/lib/bank-api-auth';
import { bankCategoryReviewTargets } from '@/lib/bank-category-review-targets';
import { deriveBankUserId } from '@/lib/bank-user-id';
import { applyBankCategoryAi } from '@/lib/finance-bank-category-ai';
import { buildFinanceBankLedger, isInternalOwnAccountTransfer, loadKnabTransactionHistory } from '@/lib/finance-bank-ledger';
import { buildKnabCostList } from '@/lib/knab-cost-list';
import { mapProjectCostRow, normalizeProjectCostCategory } from '@/lib/project-costs';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const businessAccount = /\b(?:zakelijk\w*|business|vroegop timmerwerken)\b/i;

async function loadReviewAccount() {
  const connections = await supabaseAdmin.from('bank_connections').select('id,user_id')
    .eq('provider', 'enablebanking').eq('status', 'connected');
  if (connections.error) throw connections.error;
  const ids = new Map((connections.data || []).map((row) => [String(row.id), String(row.user_id)]));
  if (!ids.size) return null;
  const accounts = await supabaseAdmin.from('bank_accounts').select('iban,name,connection_id')
    .in('connection_id', [...ids.keys()]);
  if (accounts.error) throw accounts.error;
  const candidates = new Map<string, { bankUserId: string; iban: string }>();
  for (const account of accounts.data || []) {
    const iban = String(account.iban).replace(/\s/g, '').toUpperCase();
    const bankUserId = ids.get(String(account.connection_id));
    if (bankUserId && /^NL\d{2}KNAB\d{10}$/.test(iban) && businessAccount.test(String(account.name))) {
      candidates.set(`${bankUserId}:${iban}`, { bankUserId, iban });
    }
  }
  // Deze taak hoort bij de ene zakelijke rekening van deze Calvora-installatie.
  if (candidates.size !== 1) return null;
  return [...candidates.values()][0];
}

async function ownerUid(bankUserId: string): Promise<string | null> {
  const { auth } = initFirebaseAdmin();
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(250, pageToken);
    const user = page.users.find(({ uid, disabled }) => !disabled && deriveBankUserId(uid) === bankUserId);
    if (user) return user.uid;
    pageToken = page.pageToken;
  } while (pageToken);
  return null;
}

async function readOwnedRows(uid: string, table: 'project_costs' | 'bank_transaction_category_overrides') {
  const rows: Record<string, unknown>[] = [];
  const order = table === 'project_costs' ? 'id' : 'bank_transaction_id';
  for (let offset = 0; ; offset += 500) {
    const result = await supabaseAdmin.from(table).select('*').eq('user_id', uid).order(order).range(offset, offset + 499);
    if (result.error) throw result.error;
    const page = result.data || [];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const respond = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: noStoreHeaders() });
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return respond({ ok: false }, 401);
  try {
    const authorization = await supabaseAdmin.rpc('authorize_daily_bank_category_review', { provided_token: token });
    if (authorization.error) throw authorization.error;
    if (authorization.data !== true) return respond({ ok: false }, 401);

    const account = await loadReviewAccount();
    if (!account) return respond({ ok: false, reason: 'Geen eenduidige zakelijke Knab-rekening.' }, 409);
    const uid = await ownerUid(account.bankUserId);
    if (!uid) return respond({ ok: false, reason: 'Geen actieve Studio-eigenaar voor de zakelijke Knab-rekening.' }, 409);

    const [history, rawCosts, overrides] = await Promise.all([
      loadKnabTransactionHistory(account.bankUserId, { iban: account.iban }),
      readOwnedRows(uid, 'project_costs'),
      readOwnedRows(uid, 'bank_transaction_category_overrides'),
    ]);
    const costs = rawCosts.map(mapProjectCostRow);
    const categoryOverrides = new Map(overrides.map((row) => [String(row.bank_transaction_id), normalizeProjectCostCategory(row.category)]));
    const transactions = history.transactions;
    const ledger = buildFinanceBankLedger({ userId: uid, transactions, costs, categoryOverrides });
    const { data } = buildKnabCostList({
      userId: uid, transactions, costs, ledgerRows: ledger, categoryOverrides,
      internalTransferIds: new Set(transactions.filter(isInternalOwnAccountTransfer).map((row) => row.id)),
    });
    const targets = bankCategoryReviewTargets(data, ledger);
    const result = await applyBankCategoryAi(uid, targets, categoryOverrides, true);
    return respond({ ok: true, ...result, candidates: targets.length });
  } catch (error) {
    console.error('[kosten/review-overig]', error);
    return respond({ ok: false, reason: 'De indeling van Overig is niet afgerond.' }, 503);
  }
}
