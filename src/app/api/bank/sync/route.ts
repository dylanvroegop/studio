import { NextResponse } from 'next/server';
import { z } from 'zod';

import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import {
  getAccountBalances,
  getAccountDetails,
  getAccountTransactions,
  getBankProviderSettings,
  getRequisition,
  ProviderRequestError,
} from '@/lib/bank-provider-gocardless';
import { mapAccountUpsert, mapBalancesInsert, mapTransactionsUpsert } from '@/lib/bank-sync';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const inputSchema = z.object({
  connectionId: z.string().uuid(),
});

type ConnectionRow = {
  id: string;
  user_id: string;
  requisition_id: string | null;
  institution_id: string;
  linked_account_ids: unknown;
};

function safeArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)
    : [];
}

function getDateRange(maxDays: number): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const from = new Date(today.getTime() - maxDays * 24 * 60 * 60 * 1000);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: today.toISOString().slice(0, 10),
  };
}

export async function POST(request: Request) {
  try {
    const identity = await resolveBankIdentity(request);
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(identity.firebaseUid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const body = await request.json().catch(() => null);
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Ongeldig sync-verzoek.' },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const connectionResult = await supabaseAdmin
      .from('bank_connections')
      .select('id,user_id,requisition_id,institution_id,linked_account_ids')
      .eq('id', parsed.data.connectionId)
      .eq('user_id', identity.bankUserId)
      .maybeSingle();

    if (connectionResult.error || !connectionResult.data) {
      return NextResponse.json(
        { ok: false, message: 'Bankkoppeling niet gevonden.' },
        { status: 404, headers: noStoreHeaders() }
      );
    }

    const connection = connectionResult.data as ConnectionRow;
    if (!connection.requisition_id) {
      return NextResponse.json(
        { ok: false, message: 'Bankkoppeling heeft geen actieve requisitie.' },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const requisition = await getRequisition(connection.requisition_id);
    const linkedAccountIds = requisition.accounts.length > 0
      ? requisition.accounts
      : safeArray(connection.linked_account_ids);

    if (linkedAccountIds.length === 0) {
      await supabaseAdmin
        .from('bank_connections')
        .update({
          status: 'pending',
          linked_account_ids: [],
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id);
      return NextResponse.json(
        {
          ok: true,
          data: {
            accounts_synced: 0,
            balances_synced: 0,
            transactions_created: 0,
            transactions_updated: 0,
          },
          message: 'Nog geen gekoppelde rekeningen gevonden.',
        },
        { headers: noStoreHeaders() }
      );
    }

    const settings = getBankProviderSettings();
    const { dateFrom, dateTo } = getDateRange(settings.maxTransactionDays);

    let accountsSynced = 0;
    let balancesSynced = 0;
    let transactionsCreated = 0;
    let transactionsUpdated = 0;

    for (const externalAccountId of linkedAccountIds) {
      const details = await getAccountDetails(externalAccountId);
      const accountUpsert = mapAccountUpsert({
        connectionId: connection.id,
        externalAccountId: details.externalAccountId,
        iban: details.iban,
        name: details.name,
        currency: details.currency,
        ownerName: details.ownerName,
        product: details.product,
        cashAccountType: details.cashAccountType,
      });

      const accountResult = await supabaseAdmin
        .from('bank_accounts')
        .upsert(accountUpsert as unknown as Record<string, unknown>, { onConflict: 'external_account_id' })
        .select('id')
        .single();

      const bankAccountId = typeof accountResult.data?.id === 'string' ? accountResult.data.id : '';
      if (accountResult.error || !bankAccountId) {
        return NextResponse.json(
          { ok: false, message: 'Kon rekeninggegevens niet opslaan.' },
          { status: 500, headers: noStoreHeaders() }
        );
      }

      accountsSynced += 1;

      const balances = await getAccountBalances(externalAccountId);
      const balanceRows = mapBalancesInsert(bankAccountId, balances);
      if (balanceRows.length > 0) {
        const deleteResult = await supabaseAdmin
          .from('bank_balances')
          .delete()
          .eq('bank_account_id', bankAccountId);
        if (deleteResult.error) {
          return NextResponse.json(
            { ok: false, message: 'Kon bestaande saldi niet verversen.' },
            { status: 500, headers: noStoreHeaders() }
          );
        }
        const insertBalances = await supabaseAdmin
          .from('bank_balances')
          .insert(balanceRows as unknown as Record<string, unknown>[]);
        if (insertBalances.error) {
          return NextResponse.json(
            { ok: false, message: 'Kon saldi niet opslaan.' },
            { status: 500, headers: noStoreHeaders() }
          );
        }
        balancesSynced += balanceRows.length;
      }

      const transactions = await getAccountTransactions(externalAccountId, dateFrom, dateTo);
      const transactionRows = mapTransactionsUpsert(bankAccountId, transactions);
      if (transactionRows.length > 0) {
        const hashes = transactionRows.map((row) => row.hash);
        const existingResult = await supabaseAdmin
          .from('bank_transactions')
          .select('hash')
          .in('hash', hashes);
        if (existingResult.error) {
          return NextResponse.json(
            { ok: false, message: 'Kon bestaande transacties niet bepalen.' },
            { status: 500, headers: noStoreHeaders() }
          );
        }
        const existingHashes = new Set(
          Array.isArray(existingResult.data)
            ? existingResult.data.map((item) => (typeof item.hash === 'string' ? item.hash : '')).filter(Boolean)
            : []
        );

        const upsertResult = await supabaseAdmin
          .from('bank_transactions')
          .upsert(transactionRows as unknown as Record<string, unknown>[], { onConflict: 'hash' });
        if (upsertResult.error) {
          return NextResponse.json(
            { ok: false, message: 'Kon transacties niet opslaan.' },
            { status: 500, headers: noStoreHeaders() }
          );
        }

        for (const row of transactionRows) {
          if (existingHashes.has(row.hash)) transactionsUpdated += 1;
          else transactionsCreated += 1;
        }
      }
    }

    await supabaseAdmin
      .from('bank_connections')
      .update({
        linked_account_ids: linkedAccountIds,
        status: 'connected',
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    return NextResponse.json(
      {
        ok: true,
        data: {
          accounts_synced: accountsSynced,
          balances_synced: balancesSynced,
          transactions_created: transactionsCreated,
          transactions_updated: transactionsUpdated,
        },
      },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      return NextResponse.json(
        { ok: false, message: 'Synchronisatie met de bankprovider is mislukt. Probeer het later opnieuw.' },
        { status: 502, headers: noStoreHeaders() }
      );
    }
    const message = error instanceof Error ? error.message : 'Kon banksync niet uitvoeren.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { ok: false, message },
      { status, headers: noStoreHeaders() }
    );
  }
}
