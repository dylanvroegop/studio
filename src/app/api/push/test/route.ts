import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { pushError, pushHeaders, pushUser, sendUserPush } from '@/lib/push-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const uid = await pushUser(request);
  if (!uid) return pushError('Log opnieuw in.', 401);
  const body = await request.json().catch(() => null);
  if (typeof body?.endpoint !== 'string' || body.endpoint.length > 2048) return pushError('Ongeldig apparaat.', 400);
  try {
    const result = await sendUserPush(uid, {
      title: 'Testmelding', body: 'Meldingen van Calvora werken op dit apparaat.',
      url: '/instellingen?tab=meldingen', eventId: `test:${randomUUID()}`,
    }, body.endpoint);
    if (!result.accepted) return pushError('Geen melding verstuurd. Schakel meldingen opnieuw in en probeer het nogmaals.', 409);
    return NextResponse.json({ ok: true, ...result }, { headers: pushHeaders });
  } catch { return pushError('Testmelding versturen mislukt. Probeer het opnieuw.', 503); }
}
