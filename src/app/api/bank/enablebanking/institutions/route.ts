import { NextResponse } from 'next/server';

import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import { listAspsps } from '@/lib/enable-banking/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await resolveBankIdentity(request);
    const aspsps = await listAspsps('NL');
    return NextResponse.json({ ok: true, institutions: aspsps.map((item) => ({ id: item.name, name: item.name })) }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Enable Banking is nog niet ingesteld.';
    return NextResponse.json({ ok: false, message }, { status: message === 'Unauthorized' ? 401 : 500, headers: noStoreHeaders() });
  }
}
