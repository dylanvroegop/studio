import { NextResponse } from 'next/server';

import { createSession } from '@/lib/enable-banking/client';
import { syncEnableBankingConnection } from '@/lib/enable-banking/sync';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function appRedirect(request: Request, result: 'connected' | 'error', message?: string, returnTo = '/kosten?tab=overview'): NextResponse {
  const url = new URL(returnTo === '/kosten?tab=totalen' ? returnTo : '/kosten?tab=overview', request.url);
  url.searchParams.set('bank', result);
  if (message) url.searchParams.set('message', message.slice(0, 180));
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const error = url.searchParams.get('error_description') || url.searchParams.get('error') || '';
  let returnTo = '/kosten?tab=overview';
  try {
    if (!state) return appRedirect(request, 'error', 'Enable Banking gaf geen state terug.');
    const connectionResult = await supabaseAdmin.from('bank_connections')
      .select('id,user_id,metadata')
      .eq('provider', 'enablebanking')
      .eq('reference', state)
      .maybeSingle();
    if (connectionResult.error || !connectionResult.data) return appRedirect(request, 'error', 'Koppeling niet gevonden. Start de Knab-koppeling opnieuw.');
    const metadata = connectionResult.data.metadata as { returnTo?: unknown } | null;
    if (metadata?.returnTo === '/kosten?tab=totalen') returnTo = '/kosten?tab=totalen';
    if (error) return appRedirect(request, 'error', `Knab-toestemming niet voltooid: ${error}`, returnTo);
    if (!code) return appRedirect(request, 'error', 'Enable Banking gaf geen code terug.', returnTo);

    const session = await createSession(code);
    const updateResult = await supabaseAdmin.from('bank_connections').update({
      requisition_id: session.sessionId,
      accounts: session.accounts,
      institution_name: session.aspspName || 'Knab',
      status: 'pending',
      metadata: { source: 'enablebanking', bank: session.aspspName || 'Knab', sessionId: session.sessionId, session: session.raw, returnTo },
      updated_at: new Date().toISOString(),
    }).eq('id', String(connectionResult.data.id));
    if (updateResult.error) throw new Error(`Kon Enable Banking-sessie niet opslaan: ${updateResult.error.message}`);
    const result = await syncEnableBankingConnection({ bankUserId: String(connectionResult.data.user_id), sessionId: session.sessionId });
    if (result.status !== 'connected') throw new Error(`Enable Banking status: ${result.status}`);
    return appRedirect(request, 'connected', undefined, returnTo);
  } catch (callbackError) {
    const message = callbackError instanceof Error ? callbackError.message : 'De Knab-koppeling kon niet worden voltooid.';
    return appRedirect(request, 'error', message, returnTo);
  }
}
