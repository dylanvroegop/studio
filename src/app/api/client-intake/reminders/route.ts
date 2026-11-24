import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { runClientIntakeReminders } from '@/lib/client-intake-reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
const headers = { 'Cache-Control': 'no-store' };

async function processReminders(uid?: string, scheduled = !uid): Promise<NextResponse> {
  const status = scheduled ? initFirebaseAdmin().firestore.collection('client_intake_worker').doc('status') : null;
  try {
    // Ook een externe cron telt als actieve achtergrondverwerking; een losse
    // controle door de gebruiker bewijst niet dat er een scheduler draait.
    await status?.set({ heartbeatAt: Date.now(), state: 'running', source: 'cron' }, { merge: true });
    const sent = await runClientIntakeReminders(uid);
    await status?.set({ heartbeatAt: Date.now(), lastCompletedAt: Date.now(), lastSentCount: sent, state: 'idle', source: 'cron' }, { merge: true });
    return NextResponse.json({ ok: true, sent }, { headers });
  }
  catch {
    await status?.set({ state: 'error', lastErrorAt: Date.now() }, { merge: true }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: 'Herinneringen konden niet worden gecontroleerd.' }, { status: 503, headers });
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const expected = Buffer.from(process.env.CRON_SECRET?.trim() || '');
  const provided = Buffer.from(request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1] || '');
  if (!expected.length || expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 401, headers });
  }
  return processReminders();
}

export async function POST(request: Request): Promise<NextResponse> {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return NextResponse.json({ error: 'Geen toegang.' }, { status: 401, headers });
  // Supabase Cron ondertekent iedere oproep met een tijdelijk token; de sleutel
  // blijft in Vault. Firebase-tokens blijven uitsluitend de eigen gebruiker bedienen.
  if (/^[0-9a-f]{64}$/.test(token)) {
    try {
      const authorization = await supabaseAdmin.rpc('authorize_client_intake_reminder', { provided_token: token });
      if (authorization.error) return NextResponse.json({ error: 'Planning tijdelijk niet bereikbaar.' }, { status: 503, headers });
      if (authorization.data !== true) return NextResponse.json({ error: 'Geen toegang.' }, { status: 401, headers });
      const owner = process.env.CALVORA_USER_ID?.trim();
      if (!owner) return NextResponse.json({ error: 'Eigenaar van de planning ontbreekt.' }, { status: 503, headers });
      return processReminders(owner, true);
    } catch { return NextResponse.json({ error: 'Planning tijdelijk niet bereikbaar.' }, { status: 503, headers }); }
  }
  let uid: string;
  try { uid = (await initFirebaseAdmin().auth.verifyIdToken(token, true)).uid; }
  catch { return NextResponse.json({ error: 'Geen toegang.' }, { status: 401, headers }); }
  return processReminders(uid);
}
