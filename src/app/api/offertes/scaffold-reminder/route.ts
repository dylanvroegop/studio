import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { acknowledgeScaffoldReminder, claimScaffoldReminder, loadScaffoldReminders, scaffoldDeliveryId } from '@/lib/scaffold-reminder-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'no-store' };
function owner(request: Request): string | null {
  const expected = Buffer.from(process.env.N8N_HEADER_SECRET?.trim() || '');
  const supplied = Buffer.from(request.headers.get('x-offertehulp-secret')?.trim() || '');
  return expected.length > 0 && expected.length === supplied.length && timingSafeEqual(expected, supplied)
    ? process.env.CALVORA_USER_ID?.trim() || null : null;
}

/** Alleen lezen: deze controle markeert geen herinneringen als verstuurd. */
export async function GET(request: Request): Promise<NextResponse> {
  const uid = owner(request);
  if (!uid) return NextResponse.json({ ok: false }, { status: 401, headers });
  try {
    const reminders = await loadScaffoldReminders(uid);
    const { firestore } = initFirebaseAdmin();
    const saved = await firestore.collection('users').doc(uid).collection('scaffoldReminders').get();
    const states = new Map(saved.docs.map(doc => [doc.id, doc.data()]));
    return NextResponse.json({ ok: true, version: 1, timezone: 'Europe/Amsterdam',
      reminders: reminders.filter(item => !states.has(scaffoldDeliveryId(item.quoteId, item.startDay))),
      uncertain: saved.docs.filter(doc => doc.data().state === 'sending').map(doc => ({ quoteId: doc.data().quoteId, startDay: doc.data().startDay })),
    }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: 'Steigerherinneringen ophalen mislukt.' }, { status: 503, headers });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const uid = owner(request);
  if (!uid) return NextResponse.json({ ok: false }, { status: 401, headers });
  const body = await request.json().catch(() => null);
  if (!body || !['claim', 'sent'].includes(body.action) || typeof body.quoteId !== 'string'
    || !/^[\w-]{1,128}$/.test(body.quoteId) || typeof body.startDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.startDay)) {
    return NextResponse.json({ ok: false }, { status: 400, headers });
  }
  try {
    if (body.action === 'claim') return NextResponse.json({ ok: true, ...await claimScaffoldReminder(uid, body.quoteId, body.startDay) }, { headers });
    if (typeof body.token !== 'string' || !Number.isInteger(body.messageId) || body.messageId <= 0) return NextResponse.json({ ok: false }, { status: 400, headers });
    await acknowledgeScaffoldReminder(uid, body.quoteId, body.startDay, body.token, body.messageId);
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: 'Verzending niet bevestigd. Controleer n8n voordat je opnieuw verstuurt.' }, { status: 503, headers });
  }
}
