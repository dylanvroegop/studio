import { NextResponse } from 'next/server';

import { getRequisition, ProviderRequestError } from '@/lib/bank-provider-gocardless';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function buildRedirect(origin: string, status: 'success' | 'pending' | 'error'): URL {
  const redirect = new URL('/bank-overzicht', origin);
  redirect.searchParams.set('bank_link', status);
  return redirect;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const origin = url.origin;
    const ref = safeString(url.searchParams.get('ref'));
    const requisitionIdFromProvider = safeString(url.searchParams.get('requisition_id'));
    const providerError = safeString(url.searchParams.get('error'));

    if (providerError) {
      return NextResponse.redirect(buildRedirect(origin, 'error'), { status: 302 });
    }

    if (!ref && !requisitionIdFromProvider) {
      return NextResponse.redirect(buildRedirect(origin, 'error'), { status: 302 });
    }

    let query = supabaseAdmin
      .from('bank_connections')
      .select('id,requisition_id')
      .limit(1);
    if (ref) {
      query = query.eq('reference', ref);
    } else {
      query = query.eq('requisition_id', requisitionIdFromProvider);
    }

    const connectionResult = await query.maybeSingle();
    if (connectionResult.error || !connectionResult.data) {
      return NextResponse.redirect(buildRedirect(origin, 'error'), { status: 302 });
    }

    const connectionId = safeString(connectionResult.data.id);
    const requisitionId = safeString(connectionResult.data.requisition_id);
    if (!connectionId || !requisitionId) {
      return NextResponse.redirect(buildRedirect(origin, 'error'), { status: 302 });
    }

    const requisition = await getRequisition(requisitionId);
    const nextStatus = requisition.accounts.length > 0 ? 'connected' : 'pending';

    const updateResult = await supabaseAdmin
      .from('bank_connections')
      .update({
        status: nextStatus,
        linked_account_ids: requisition.accounts,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId);

    if (updateResult.error) {
      return NextResponse.redirect(buildRedirect(origin, 'error'), { status: 302 });
    }

    return NextResponse.redirect(buildRedirect(origin, nextStatus === 'connected' ? 'success' : 'pending'), { status: 302 });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      const url = new URL(request.url);
      return NextResponse.redirect(buildRedirect(url.origin, 'error'), { status: 302 });
    }
    const url = new URL(request.url);
    return NextResponse.redirect(buildRedirect(url.origin, 'error'), { status: 302 });
  }
}
