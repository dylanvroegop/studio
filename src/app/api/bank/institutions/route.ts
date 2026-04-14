import { NextResponse } from 'next/server';

import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { noStoreHeaders, resolveUid } from '@/lib/bank-api-auth';
import { listInstitutions } from '@/lib/bank-provider-gocardless';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isProviderNotConfiguredError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('gocardless_secret_id')
    || lower.includes('gocardless_secret_key')
    || lower.includes('bank provider ontbreekt');
}

export async function GET(request: Request) {
  try {
    const uid = await resolveUid(request);
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const url = new URL(request.url);
    const country = url.searchParams.get('country') || 'NL';
    const institutions = await listInstitutions(country);

    return NextResponse.json(
      { ok: true, data: institutions },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon banken niet laden.';
    if (isProviderNotConfiguredError(message)) {
      return NextResponse.json(
        {
          ok: true,
          data: [],
          message: 'Bankkoppeling is nog niet geconfigureerd. Voeg eerst de bankprovider-sleutels toe in je serveromgeving.',
        },
        { headers: noStoreHeaders() }
      );
    }
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { ok: false, message },
      { status, headers: noStoreHeaders() }
    );
  }
}
