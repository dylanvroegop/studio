import { NextResponse } from 'next/server';
import { resolveUid } from '@/lib/bank-api-auth';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function visionRequest(req: Request, run: (uid: string) => Promise<Response>) {
  let uid: string;
  try {
    uid = await resolveUid(req);
  } catch {
    return json({ error: 'Log opnieuw in bij Calvora.' }, 401);
  }
  try {
    return (await ensureDemoTrialActiveByUid(uid)) ?? (await run(uid));
  } catch {
    return json({ error: 'Vision kon de gegevens niet verwerken. Probeer het opnieuw.' }, 503);
  }
}
