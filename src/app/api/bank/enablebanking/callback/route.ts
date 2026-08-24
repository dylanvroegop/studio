import { NextResponse } from 'next/server';

import { createSession } from '@/lib/enable-banking/client';
import { syncEnableBankingConnection } from '@/lib/enable-banking/sync';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function appRedirect(request: Request, result: 'connected' | 'error', message?: string): NextResponse {
  const url = new URL('/financieen', request.url);
  url.searchParams.set('bank', result);
  if (message) url.searchParams.set('message', message.slice(0, 180));
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const error = url.searchParams.get('error_description') || url.searchParams.get('error') || '';
  try {
    if (error) return appRedirect(request, 'error', `Knab-toestemming niet voltooid: ${error}`);
    if (!state || !code) return appRedirect(request, 'error', 'Enable Banking gaf geen state en code terug.');
    const connectionResult = await supabaseAdmin.from('bank_connections')
      .select('id,user_id')
      .eq('provider', 'enablebanking')
      .eq('reference', state)
      .maybeSingle();
    if (connectionResult.error || !connectionResult.data) return appRedirect(request, 'error', 'Koppeling niet gevonden. Start de Knab-koppeling opnieuw.');

    const session = await createSession(code);
    const updateResult = await supabaseAdmin.from('bank_connections').update({
      requisition_id: session.sessionId,
      accounts: session.accounts,
      institution_name: session.aspspName || 'Knab',
      status: 'pending',
      metadata: { source: 'enablebanking', bank: session.aspspName || 'Knab', sessionId: session.sessionId, session: session.raw },
      updated_at: new Date().toISOString(),
    }).eq('id', String(connectionResult.data.id));
    if (updateResult.error) throw new Error(`Kon Enable Banking-sessie niet opslaan: ${updateResult.error.message}`);
    await syncEnableBankingConnection({ bankUserId: String(connectionResult.data.user_id), sessionId: session.sessionId });
    return appRedirect(request, 'connected');
  } catch (callbackError) {
    const message = callbackError instanceof Error ? callbackError.message : 'De Knab-koppeling kon niet worden voltooid.';
    return appRedirect(request, 'error', message);
  }
}
