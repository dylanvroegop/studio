import { NextResponse } from 'next/server';

import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import {
  mapAccountView,
  mapConnectionView,
  mapTransactionView,
  summarizeThisMonth,
} from '@/lib/bank-overzicht';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeBunqProfile } from '@/lib/bunq/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function latestBalanceMap(rows: unknown[]): Map<string, { amount: number | null; referenceDate: string | null }> {
  const byAccount = new Map<string, { amount: number | null; referenceDate: string | null }>();
  for (const row of rows) {
    const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
    if (!record) continue;
    const accountId = typeof record.bank_account_id === 'string' ? record.bank_account_id : '';
    if (!accountId) continue;
    const existing = byAccount.get(accountId);
    const referenceDate = typeof record.reference_date === 'string' ? record.reference_date : null;
    const amountRaw = Number(record.amount);
    const amount = Number.isFinite(amountRaw) ? amountRaw : null;
    if (!existing) {
      byAccount.set(accountId, { amount, referenceDate });
      continue;
    }
    const currentDate = referenceDate ? new Date(referenceDate).getTime() : 0;
    const prevDate = existing.referenceDate ? new Date(existing.referenceDate).getTime() : 0;
    if (currentDate >= prevDate) {
      byAccount.set(accountId, { amount, referenceDate });
    }
  }
  return byAccount;
}

export async function GET(request: Request) {
  try {
    const identity = await resolveBankIdentity(request);
    const url = new URL(request.url);
    const profile = normalizeBunqProfile(url.searchParams.get('profile'));
    const linkRef = `bunq:${profile}:${identity.bankUserId}`;
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(identity.firebaseUid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const contextResult = await supabaseAdmin
      .from('bunq_context')
      .select('id')
      .eq('profile', profile)
      .maybeSingle();

    if (contextResult.error) {
      return NextResponse.json(
        { ok: false, message: `Kon bunq-context niet laden: ${contextResult.error.message}` },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    let connectionResult = await supabaseAdmin
      .from('bank_connections')
      .select('id,institution_name,status,last_synced_at,linked_account_ids')
      .eq('provider', 'bunq')
      .eq('link_ref', linkRef)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!connectionResult.error && !connectionResult.data && profile === 'personal') {
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
      || (contextResult.data
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
    if (accountIds.length > 0) {
      const balancesResult = await supabaseAdmin
        .from('bank_balances')
        .select('*')
        .in('bank_account_id', accountIds);
      if (balancesResult.error) {
        return NextResponse.json(
          { ok: false, message: `Kon saldi niet laden: ${balancesResult.error.message}` },
          { status: 500, headers: noStoreHeaders() }
        );
      }
      balancesRows = Array.isArray(balancesResult.data) ? balancesResult.data : [];
    }

    const latestBalanceByAccount = latestBalanceMap(balancesRows);
    const accounts = accountRows
      .map((row) => mapAccountView(row, latestBalanceByAccount))
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const accountNameById = new Map<string, string>(accounts.map((item) => [item.id, item.name]));

    let transactionsRaw: unknown[] = [];
    if (accountIds.length > 0) {
      const txResult = await supabaseAdmin
        .from('bank_transactions')
        .select('*')
        .in('bank_account_id', accountIds)
        .order('booking_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);
      if (txResult.error) {
        return NextResponse.json(
          { ok: false, message: `Kon transacties niet laden: ${txResult.error.message}` },
          { status: 500, headers: noStoreHeaders() }
        );
      }
      transactionsRaw = Array.isArray(txResult.data) ? txResult.data : [];
    }

    const transactions = transactionsRaw
      .map((row) => mapTransactionView(row, accountNameById))
      .filter((row): row is NonNullable<typeof row> => row !== null);
    const summary = summarizeThisMonth(transactions);

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
