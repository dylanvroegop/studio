import { NextResponse } from 'next/server';
import { pushError, pushHeaders, pushUser, sendUserPush } from '@/lib/push-server';
import { pushMessageSchema } from '@/lib/push-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  const uid = await pushUser(request, true);
  if (!uid) return pushError('Geen toegang.', 401);
  const parsed = pushMessageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return pushError('Gebruik title, body, url en een unieke eventId (maximaal 100/800/1000/200 tekens).', 400);
  try {
    const result = await sendUserPush(uid, parsed.data);
    const ok = result.failed === 0 && result.accepted + result.skipped > 0;
    return NextResponse.json({ ok, ...result }, { status: ok ? 200 : result.failed ? 503 : 409, headers: pushHeaders });
  } catch { return pushError('Pushmelding versturen mislukt.', 503); }
}
