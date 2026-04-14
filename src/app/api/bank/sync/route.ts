import { NextResponse } from 'next/server';

import { noStoreHeaders, resolveUid } from '@/lib/bank-api-auth';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { getRequisitionStatus } from '@/lib/bank-provider-gocardless';
import { mapBankTransactionRow } from '@/lib/bank-overzicht';
import { pullConnectionTransactions, type BankConnectionRow } from '@/lib/bank-sync';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isMissingBankRelationError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('bank_transactions')
    || lower.includes('bank_connections')
    || lower.includes('does not exist')
    || lower.includes('schema cache');
}

export async function POST(request: Request) {
  try {
    const uid = await resolveUid(request);
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const connectionResult = await supabaseAdmin
      .from('bank_connections')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (connectionResult.error) {
      if (isMissingBankRelationError(connectionResult.error.message)) {
        return NextResponse.json(
          {
            ok: true,
            mode: 'project_costs_fallback',
            inserted_count: 0,
            data: [],
            connection: null,
            message: 'Banktabellen ontbreken nog in Supabase. Draai eerst de bank-migratie.',
          },
          { headers: noStoreHeaders() }
        );
      }
      return NextResponse.json(
        { ok: false, message: connectionResult.error.message },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    const connection = connectionResult.data as (BankConnectionRow & { id: string }) | null;
    if (!connection) {
      return NextResponse.json(
        {
          ok: true,
          mode: 'project_costs_fallback',
          inserted_count: 0,
          data: [],
          connection: null,
          message: 'Nog geen bankrekening gekoppeld. Klik op "Bank koppelen" om te starten.',
        },
        { headers: noStoreHeaders() }
      );
    }

    const requisition = await getRequisitionStatus(connection.requisition_id);
    const resolvedAccounts = requisition.accounts;
    const connectionStatus = resolvedAccounts.length > 0 ? 'connected' : 'linked';

    const updateConnection = await supabaseAdmin
      .from('bank_connections')
      .update({
        status: connectionStatus,
        accounts: resolvedAccounts,
        metadata: {
          requisition_status: requisition.status,
          sync_triggered_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    if (updateConnection.error) {
      return NextResponse.json(
        { ok: false, message: updateConnection.error.message },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    if (resolvedAccounts.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          mode: 'project_costs_fallback',
          inserted_count: 0,
          data: [],
          connection: {
            id: connection.id,
            status: connectionStatus,
            institution_id: connection.institution_id,
            institution_name: connection.institution_name,
            last_error: null,
            last_synced_at: null,
            accounts: resolvedAccounts,
          },
          message: 'Bankkoppeling bestaat, maar er zijn nog geen rekeningen beschikbaar.',
        },
        { headers: noStoreHeaders() }
      );
    }

    const txRows = await pullConnectionTransactions({
      ...connection,
      accounts: resolvedAccounts,
      status: connectionStatus,
    });

    if (txRows.length > 0) {
      const upsertResult = await supabaseAdmin
        .from('bank_transactions')
        .upsert(txRows as unknown as Record<string, unknown>[], { onConflict: 'user_id,external_id' });

      if (upsertResult.error) {
        if (isMissingBankRelationError(upsertResult.error.message)) {
          return NextResponse.json(
            {
              ok: true,
              mode: 'project_costs_fallback',
              inserted_count: 0,
              data: [],
              connection: {
                id: connection.id,
                status: connectionStatus,
                institution_id: connection.institution_id,
                institution_name: connection.institution_name,
                last_error: null,
                last_synced_at: null,
                accounts: resolvedAccounts,
              },
              message: 'Banktransacties tabel ontbreekt nog in Supabase. Draai eerst de bank-migratie.',
            },
            { headers: noStoreHeaders() }
          );
        }
        await supabaseAdmin
          .from('bank_connections')
          .update({
            status: 'error',
            last_error: upsertResult.error.message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        return NextResponse.json(
          { ok: false, message: upsertResult.error.message },
          { status: 500, headers: noStoreHeaders() }
        );
      }
    }

    await supabaseAdmin
      .from('bank_connections')
      .update({
        status: 'connected',
        last_error: null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    const transactionsResult = await supabaseAdmin
      .from('bank_transactions')
      .select('*')
      .eq('user_id', uid)
      .order('booked_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300);

    if (transactionsResult.error) {
      if (isMissingBankRelationError(transactionsResult.error.message)) {
        return NextResponse.json(
          {
            ok: true,
            mode: 'project_costs_fallback',
            inserted_count: 0,
            data: [],
            connection: {
              id: connection.id,
              status: connectionStatus,
              institution_id: connection.institution_id,
              institution_name: connection.institution_name,
              last_error: null,
              last_synced_at: null,
              accounts: resolvedAccounts,
            },
            message: 'Banktransacties tabel ontbreekt nog in Supabase. Draai eerst de bank-migratie.',
          },
          { headers: noStoreHeaders() }
        );
      }
      return NextResponse.json(
        { ok: false, message: transactionsResult.error.message },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        mode: 'bank_transactions',
        inserted_count: txRows.length,
        data: (transactionsResult.data || []).map((row) => mapBankTransactionRow(row)),
        connection: {
          id: connection.id,
          status: 'connected',
          institution_id: connection.institution_id,
          institution_name: connection.institution_name,
          last_error: null,
          last_synced_at: new Date().toISOString(),
          accounts: resolvedAccounts,
        },
        message: txRows.length > 0
          ? `${txRows.length} banktransacties gesynchroniseerd.`
          : 'Geen nieuwe banktransacties gevonden.',
      },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon banksync niet uitvoeren.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status, headers: noStoreHeaders() });
  }
}
