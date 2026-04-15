import { NextResponse } from 'next/server';

import {
  exchangeCodeForTokens,
  listAccountIds,
  ProviderRequestError,
} from '@/lib/bank-provider-gocardless';
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
  const url = new URL(request.url);
  const origin = url.origin;

  try {
    const state = safeString(url.searchParams.get('state'));
    const code = safeString(url.searchParams.get('code'));
    const providerError = safeString(url.searchParams.get('error'));

    if (providerError) {
      return NextResponse.redirect(buildRedirect(origin, 'error'), { status: 302 });
    }

    if (!state || !code) {
      return NextResponse.redirect(buildRedirect(origin, 'error'), { status: 302 });
    }

    const connectionResult = await supabaseAdmin
      .from('bank_connections')
      .select('id')
      .eq('reference', state)
      .limit(1)
      .maybeSingle();

    if (connectionResult.error || !connectionResult.data?.id) {
      return NextResponse.redirect(buildRedirect(origin, 'error'), { status: 302 });
    }

    const tokenSet = await exchangeCodeForTokens(code);
    const accountIds = await listAccountIds(tokenSet.accessToken);

    const updateResult = await supabaseAdmin
      .from('bank_connections')
      .update({
        status: accountIds.length > 0 ? 'connected' : 'pending',
        linked_account_ids: accountIds,
        access_token: tokenSet.accessToken,
        refresh_token: tokenSet.refreshToken,
        access_token_expires_at: tokenSet.expiresAtIso,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionResult.data.id);

    if (updateResult.error) {
      return NextResponse.redirect(buildRedirect(origin, 'error'), { status: 302 });
    }

    return NextResponse.redirect(buildRedirect(origin, accountIds.length > 0 ? 'success' : 'pending'), { status: 302 });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      return NextResponse.redirect(buildRedirect(origin, 'error'), { status: 302 });
    }
    return NextResponse.redirect(buildRedirect(origin, 'error'), { status: 302 });
  }
}
