import { NextResponse } from 'next/server';

import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import {
  mapAccountView,
  mapConnectionView,
  mapTransactionView,
} from '@/lib/bank-overzicht';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { isInternalOwnAccountTransfer } from '@/lib/finance-bank-ledger';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeBunqProfile } from '@/lib/bunq/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE_TRANSACTION_RE = /top-?up\s+via\s+bunq|paypal\s+top-?up/i;

function isPrivateTransactionRow(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const record = row as Record<string, unknown>;
  if (record.category === 'private') return true;
  return PRIVATE_TRANSACTION_RE.test([
    record.counterparty_name,
    record.description,
    record.remittance_information,
  ].filter((value): value is string => typeof value === 'string').join(' '));
}

function currentMonthBounds(): { start: string; nextStart: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = new Date(year, month, 1);
  const nextStart = new Date(year, month + 1, 1);
  return {
    start: start.toISOString().slice(0, 10),
    nextStart: nextStart.toISOString().slice(0, 10),
  };
}

function latestBalanceMap(rows: unknown[]): Map<string, { amount: number | null; referenceDate: string | null }> {
  const byAccount = new Map<string, { amount: number | null; referenceDate: string | null }>();
  for (const row of rows) {
    const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
    if (!record) continue;
    const accountId = typeof record.bank_account_id === 'string' ? record.bank_account_id : '';
    if (!accountId) continue;
    if (byAccount.has(accountId)) continue; // already have the newest (ordered by created_at desc)
    const referenceDate = typeof record.reference_date === 'string' ? record.reference_date : null;
    const amountRaw = Number(record.amount);
    const amount = Number.isFinite(amountRaw) ? amountRaw : null;
    byAccount.set(accountId, { amount, referenceDate });
  }
  return byAccount;
}

export async function GET(request: Request) {
  try {
    const identity = await resolveBankIdentity(request);
    const url = new URL(request.url);
    const requestedProvider = url.searchParams.get('provider');
    const provider = requestedProvider === 'enablebanking' || requestedProvider === 'gocardless' ? requestedProvider : 'bunq';
    const profile = normalizeBunqProfile(url.searchParams.get('profile'));
    const linkRef = `bunq:${profile}:${identity.bankUserId}`;
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(identity.firebaseUid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const contextResult = provider === 'bunq'
      ? await supabaseAdmin
        .from('bunq_context')
        .select('id')
        .eq('profile', profile)
        .maybeSingle()
      : { data: null, error: null };

    if (contextResult.error) {
      return NextResponse.json(
        { ok: false, message: `Kon bunq-context niet laden: ${contextResult.error.message}` },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    let connectionResult = provider !== 'bunq'
      ? await supabaseAdmin
        .from('bank_connections')
        .select('id,institution_name,status,last_synced_at,linked_account_ids')
        .eq('provider', provider)
        .eq('user_id', identity.bankUserId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      : await supabaseAdmin
        .from('bank_connections')
        .select('id,institution_name,status,last_synced_at,linked_account_ids')
        .eq('provider', 'bunq')
        .eq('link_ref', linkRef)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (provider === 'bunq' && !connectionResult.error && !connectionResult.data && profile === 'personal') {
      // Backward compatibility for pre-profile bunq links.
      connectionResult = await supabaseAdmin
        .from('bank_connections')
        .select('id,institution_name,status,last_synced_at,linked_account_ids')
        .eq('provider', 'bunq')
        .eq('link_ref', `bunq:${identity.bankUserId}`)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    }

    if (connectionResult.error) {
      return NextResponse.json(
        { ok: false, message: `Kon bankkoppeling niet laden: ${connectionResult.error.message}` },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    const realConnectionId =
      connectionResult.data && typeof connectionResult.data.id === 'string'
        ? connectionResult.data.id
        : null;

    const connectionView = mapConnectionView(connectionResult.data)
      || (provider === 'bunq' && contextResult.data
        ? {
          id: realConnectionId || '00000000-0000-0000-0000-000000000000',
          institutionName: 'bunq',
          status: 'connected',
          lastSyncedAt: null,
          accountCount: 0,
        }
        : null);

    if (!connectionView) {
      return NextResponse.json(
        {
          ok: true,
          data: {
            connection: null,
            summary: {
              incomeThisMonth: 0,
              expensesThisMonth: 0,
              privateWithdrawalsThisMonth: 0,
              privateWithdrawalsTotal: 0,
              firstTransactionDate: null,
            },
            accounts: [],
            transactions: [],
          },
        },
        { headers: noStoreHeaders() }
      );
    }

    let accountRows: unknown[] = [];
    if (realConnectionId) {
      const accountsResult = await supabaseAdmin
        .from('bank_accounts')
        .select('*')
        .eq('connection_id', realConnectionId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (accountsResult.error) {
        return NextResponse.json(
          { ok: false, message: `Kon bankrekeningen niet laden: ${accountsResult.error.message}` },
          { status: 500, headers: noStoreHeaders() }
        );
      }
      accountRows = Array.isArray(accountsResult.data) ? accountsResult.data : [];
    }

    const accountIds = accountRows
      .map((item) => (item && typeof item === 'object' && typeof (item as Record<string, unknown>).id === 'string'
        ? (item as Record<string, unknown>).id as string
        : ''))
      .filter(Boolean);

    let balancesRows: unknown[] = [];
    let transactionsRaw: unknown[] = [];
    let summaryTransactionsRaw: unknown[] = [];
    let allOutgoingTransactionsRaw: unknown[] = [];
    let firstTransactionDate: string | null = null;

    if (accountIds.length > 0) {
      const bounds = currentMonthBounds();
      const [balancesResult, txResult, summaryTxResult, allOutgoingTransactionsResult, firstTransactionResult] = await Promise.all([
        supabaseAdmin
          .from('bank_balances')
          .select('*')
          .in('bank_account_id', accountIds)
          .order('created_at', { ascending: false }),
        supabaseAdmin
          .from('bank_transactions')
          .select('*')
          .in('bank_account_id', accountIds)
          .order('booking_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(200),
        supabaseAdmin
          .from('bank_transactions')
          .select('*')
          .in('bank_account_id', accountIds)
          .gte('booking_date', bounds.start)
          .lt('booking_date', bounds.nextStart)
          .order('booking_date', { ascending: false }),
        supabaseAdmin
          .from('bank_transactions')
          .select('amount,bank_account_id,category,counterparty_name,description,remittance_information,raw')
          .in('bank_account_id', accountIds)
          .lt('amount', 0),
        supabaseAdmin
          .from('bank_transactions')
          .select('booking_date')
          .in('bank_account_id', accountIds)
          .order('booking_date', { ascending: true })
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      if (balancesResult.error) throw new Error(`Kon saldi niet laden: ${balancesResult.error.message}`);
      if (txResult.error) throw new Error(`Kon transacties niet laden: ${txResult.error.message}`);
      if (summaryTxResult.error) throw new Error(`Kon maandtotalen niet laden: ${summaryTxResult.error.message}`);
      if (allOutgoingTransactionsResult.error) throw new Error(`Kon totale afschriften niet laden: ${allOutgoingTransactionsResult.error.message}`);
      if (firstTransactionResult.error) throw new Error(`Kon startdatum van Knab-transacties niet laden: ${firstTransactionResult.error.message}`);

      balancesRows = Array.isArray(balancesResult.data) ? balancesResult.data : [];
      transactionsRaw = Array.isArray(txResult.data) ? txResult.data : [];
      summaryTransactionsRaw = Array.isArray(summaryTxResult.data) ? summaryTxResult.data : [];
      allOutgoingTransactionsRaw = Array.isArray(allOutgoingTransactionsResult.data) ? allOutgoingTransactionsResult.data : [];
      firstTransactionDate = typeof firstTransactionResult.data?.booking_date === 'string'
        ? firstTransactionResult.data.booking_date
        : null;
    }

    const latestBalanceByAccount = latestBalanceMap(balancesRows);
    const accountTotals = new Map<string, { outgoing: number; business: number; private: number }>();
    allOutgoingTransactionsRaw.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      const record = row as Record<string, unknown>;
      const accountId = typeof record.bank_account_id === 'string' ? record.bank_account_id : '';
      const amount = Math.abs(Number(record.amount) || 0);
      if (!accountId || amount <= 0) return;
      const totals = accountTotals.get(accountId) || { outgoing: 0, business: 0, private: 0 };
      totals.outgoing += amount;
      if (isInternalOwnAccountTransfer(row)) {
        accountTotals.set(accountId, totals);
        return;
      }
      if (isPrivateTransactionRow(row)) totals.private += amount;
      else totals.business += amount;
      accountTotals.set(accountId, totals);
    });

    const accounts = accountRows
      .map((row) => mapAccountView(row, latestBalanceByAccount))
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .map((account) => {
        const totals = accountTotals.get(account.id) || { outgoing: 0, business: 0, private: 0 };
        return {
          ...account,
          outgoingTotal: totals.outgoing,
          businessExpensesTotal: totals.business,
          privateWithdrawalsTotal: totals.private,
        };
      });

    const accountNameById = new Map<string, string>(accounts.map((item) => [item.id, item.name]));

    const transactions = transactionsRaw
      .map((row) => mapTransactionView(
        isInternalOwnAccountTransfer(row) && row && typeof row === 'object'
          ? { ...(row as Record<string, unknown>), category: 'internal' }
          : row,
        accountNameById,
      ))
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const summaryTransactions = summaryTransactionsRaw
      .map((row) => mapTransactionView(
        isInternalOwnAccountTransfer(row) && row && typeof row === 'object'
          ? { ...(row as Record<string, unknown>), category: 'internal' }
          : row,
        accountNameById,
      ))
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const privateWithdrawalsTotal = Array.from(accountTotals.values()).reduce((sum, totals) => sum - totals.private, 0);

    const summary = {
      incomeThisMonth: summaryTransactions.filter((tx) => tx.amount >= 0).reduce((sum, tx) => sum + tx.amount, 0),
      expensesThisMonth: summaryTransactions
        .filter((tx) => tx.amount < 0 && tx.category !== 'private' && tx.category !== 'internal')
        .reduce((sum, tx) => sum + tx.amount, 0),
      privateWithdrawalsThisMonth: summaryTransactions
        .filter((tx) => tx.amount < 0 && tx.category === 'private')
        .reduce((sum, tx) => sum + tx.amount, 0),
      privateWithdrawalsTotal,
      firstTransactionDate,
    };

    return NextResponse.json(
      {
        ok: true,
        data: {
          connection: {
            ...connectionView,
            institutionName: profile === 'business' ? 'bunq business' : 'bunq personal',
            status: contextResult.data ? 'connected' : connectionView.status,
            accountCount: accounts.length,
          },
          summary,
          accounts,
          transactions,
        },
      },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon bankoverzicht niet laden.';
    console.error('bank_overview_error', { message });
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { ok: false, message },
      { status, headers: noStoreHeaders() }
    );
  }
}
