import { NextResponse } from 'next/server';

import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import { listInstitutions } from '@/lib/gocardless-bank-data/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await resolveBankIdentity(request);
    const country = new URL(request.url).searchParams.get('country') || 'nl';
    const institutions = await listInstitutions(country);
    return NextResponse.json({ ok: true, institutions }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon banken niet laden.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status, headers: noStoreHeaders() });
  }
}
