import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { runClientIntakeReminders } from '@/lib/client-intake-reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'no-store' };

async function processReminders(uid?: string): Promise<NextResponse> {
  try {
    // Ook een externe cron telt als actieve achtergrondverwerking; een losse
    // controle door de gebruiker bewijst niet dat er een scheduler draait.
    const status = uid ? null : initFirebaseAdmin().firestore.collection('client_intake_worker').doc('status');
    await status?.set({ heartbeatAt: Date.now(), state: 'running', source: 'cron' }, { merge: true });
    const sent = await runClientIntakeReminders(uid);
    await status?.set({ heartbeatAt: Date.now(), lastCompletedAt: Date.now(), lastSentCount: sent, state: 'idle', source: 'cron' }, { merge: true });
    return NextResponse.json({ ok: true, sent }, { headers });
  }
  catch { return NextResponse.json({ ok: false, error: 'Herinneringen konden niet worden gecontroleerd.' }, { status: 503, headers }); }
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
  let uid: string;
  try { uid = (await initFirebaseAdmin().auth.verifyIdToken(token)).uid; }
  catch { return NextResponse.json({ error: 'Geen toegang.' }, { status: 401, headers }); }
  return processReminders(uid);
}
