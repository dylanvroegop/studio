import { NextResponse } from 'next/server';
import { pushError, pushHeaders, pushUser } from '@/lib/push-server';
import { sendDepartureReminder } from '@/lib/departure-reminder-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  const uid = await pushUser(request, true);
  if (!uid) return pushError('Geen toegang.', 401);
  try {
    const result = await sendDepartureReminder(uid);
    return NextResponse.json(result, { status: 'ok' in result && result.ok === false ? 503 : 200, headers: pushHeaders });
  } catch { return pushError('Avondmelding maken mislukt.', 503); }
}
