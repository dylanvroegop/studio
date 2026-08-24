import { NextResponse } from 'next/server';

import { getRequisition } from '@/lib/gocardless-bank-data/client';
import { syncGoCardlessConnection } from '@/lib/gocardless-bank-data/sync';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function appRedirect(request: Request, result: 'connected' | 'error', message?: string): NextResponse {
  const fallback = new URL('/financieen', request.url);
  fallback.searchParams.set('bank', result);
  if (message) fallback.searchParams.set('message', message.slice(0, 180));
  return NextResponse.redirect(fallback);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const requisitionId = url.searchParams.get('requisition_id') || '';
  try {
    const connectionQuery = supabaseAdmin
      .from('bank_connections')
      .select('id,user_id,requisition_id')
      .eq('provider', 'gocardless');
    const connectionResult = state
      ? await connectionQuery.eq('reference', state).maybeSingle()
      : await connectionQuery.eq('requisition_id', requisitionId).maybeSingle();
    if (connectionResult.error || !connectionResult.data) {
      return appRedirect(request, 'error', 'Koppeling niet gevonden. Start de Knab-koppeling opnieuw.');
    }

    const resolvedRequisitionId = String(connectionResult.data.requisition_id || requisitionId);
    const requisition = await getRequisition(resolvedRequisitionId);
    if (requisition.status === 'RJ' || requisition.status === 'EX') {
      await supabaseAdmin
        .from('bank_connections')
        .update({ status: requisition.status === 'EX' ? 'revoked' : 'error', last_error: `GoCardless status: ${requisition.status}`, updated_at: new Date().toISOString() })
        .eq('id', String(connectionResult.data.id));
      return appRedirect(request, 'error', 'De Knab-toestemming is niet voltooid.');
    }

    await syncGoCardlessConnection({
      bankUserId: String(connectionResult.data.user_id),
      requisitionId: resolvedRequisitionId,
    });
    return appRedirect(request, 'connected');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'De Knab-koppeling kon niet worden voltooid.';
    return appRedirect(request, 'error', message);
  }
}
