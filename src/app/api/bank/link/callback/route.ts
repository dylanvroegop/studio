import { NextResponse } from 'next/server';

import { getRequisitionStatus } from '@/lib/bank-provider-gocardless';
import { pullConnectionTransactions, type BankConnectionRow } from '@/lib/bank-sync';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

type StoredBankConnection = BankConnectionRow & {
  id: string;
  requisition_id: string;
  user_id: string;
  metadata?: Record<string, unknown>;
};

function mapStoredConnection(value: unknown): StoredBankConnection | null {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  if (!row) return null;
  const id = safeString(row.id);
  const userId = safeString(row.user_id);
  const requisitionId = safeString(row.requisition_id);
  const institutionId = safeString(row.institution_id);
  if (!id || !userId || !requisitionId || !institutionId) return null;

  return {
    id,
    user_id: userId,
    requisition_id: requisitionId,
    institution_id: institutionId,
    institution_name: safeString(row.institution_name) || null,
    status: safeString(row.status) || 'pending',
    accounts: row.accounts,
    metadata: row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : {},
  };
}

function buildRedirectUrl(baseOrigin: string, status: 'success' | 'pending' | 'error', message?: string): string {
  const redirect = new URL('/bank-overzicht', baseOrigin);
  redirect.searchParams.set('bank_link', status);
  if (message) redirect.searchParams.set('bank_message', message);
  return redirect.toString();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;

  try {
    const ref = safeString(url.searchParams.get('ref'));
    const requisitionIdFromQuery = safeString(url.searchParams.get('requisition_id'));
    const providerError = safeString(url.searchParams.get('error'));
    const providerDetails = safeString(url.searchParams.get('details'));

    if (providerError) {
      const errMessage = providerDetails || providerError || 'Bankkoppeling geannuleerd.';
      return NextResponse.redirect(buildRedirectUrl(origin, 'error', errMessage), { status: 302 });
    }

    let connectionQuery = supabaseAdmin
      .from('bank_connections')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (ref) {
      connectionQuery = connectionQuery.eq('link_ref', ref);
    } else if (requisitionIdFromQuery) {
      connectionQuery = connectionQuery.eq('requisition_id', requisitionIdFromQuery);
    } else {
      return NextResponse.redirect(
        buildRedirectUrl(origin, 'error', 'Ontbrekende callback referentie.'),
        { status: 302 }
      );
    }

    const connectionResult = await connectionQuery.maybeSingle();
    if (connectionResult.error || !connectionResult.data) {
      return NextResponse.redirect(
        buildRedirectUrl(origin, 'error', 'Kon bankkoppeling niet terugvinden.'),
        { status: 302 }
      );
    }

    const connection = mapStoredConnection(connectionResult.data);
    if (!connection) {
      return NextResponse.redirect(
        buildRedirectUrl(origin, 'error', 'Ongeldige bankkoppeling gevonden.'),
        { status: 302 }
      );
    }
    const requisition = await getRequisitionStatus(connection.requisition_id);
    const accounts = requisition.accounts;
    const nextStatus = accounts.length > 0 ? 'connected' : 'linked';

    const updateConnection = await supabaseAdmin
      .from('bank_connections')
      .update({
        status: nextStatus,
        accounts,
        metadata: {
          ...(connection.metadata || {}),
          requisition_status: requisition.status,
          callback_received_at: new Date().toISOString(),
        },
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    if (updateConnection.error) {
      return NextResponse.redirect(
        buildRedirectUrl(origin, 'error', updateConnection.error.message),
        { status: 302 }
      );
    }

    if (accounts.length === 0) {
      return NextResponse.redirect(
        buildRedirectUrl(origin, 'pending', 'Bankkoppeling aangemaakt, maar nog geen rekening beschikbaar.'),
        { status: 302 }
      );
    }

    const txRows = await pullConnectionTransactions({
      id: connection.id,
      user_id: connection.user_id,
      requisition_id: connection.requisition_id,
      institution_id: connection.institution_id,
      institution_name: connection.institution_name,
      status: nextStatus,
      accounts,
    });

    if (txRows.length > 0) {
      const upsertTx = await supabaseAdmin
        .from('bank_transactions')
        .upsert(txRows as unknown as Record<string, unknown>[], { onConflict: 'user_id,external_id' });
      if (upsertTx.error) {
        await supabaseAdmin
          .from('bank_connections')
          .update({
            status: 'error',
            last_error: upsertTx.error.message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        return NextResponse.redirect(
          buildRedirectUrl(origin, 'error', upsertTx.error.message),
          { status: 302 }
        );
      }
    }

    await supabaseAdmin
      .from('bank_connections')
      .update({
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    return NextResponse.redirect(
      buildRedirectUrl(origin, 'success', 'Bankrekening succesvol gekoppeld.'),
      { status: 302 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout tijdens bank callback.';
    return NextResponse.redirect(buildRedirectUrl(origin, 'error', message), { status: 302 });
  }
}
