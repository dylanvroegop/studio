import { NextResponse } from 'next/server';

import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { noStoreHeaders, resolveUid } from '@/lib/bank-api-auth';
import { listInstitutions, ProviderNotConfiguredError, ProviderRequestError } from '@/lib/bank-provider-gocardless';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const uid = await resolveUid(request);
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const institutions = await listInstitutions();

    return NextResponse.json(
      { ok: true, data: institutions },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return NextResponse.json(
        {
          ok: true,
          data: [],
          message: 'Bankkoppeling is nog niet geconfigureerd in de serveromgeving.',
        },
        { headers: noStoreHeaders() }
      );
    }
    if (error instanceof ProviderRequestError) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Kon de bankenlijst nu niet ophalen. Probeer het opnieuw.',
        },
        { status: 502, headers: noStoreHeaders() }
      );
    }
    const message = error instanceof Error ? error.message : 'Kon banken niet laden.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { ok: false, message },
      { status, headers: noStoreHeaders() }
    );
  }
}
