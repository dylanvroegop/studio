import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { reprocessGpsWorkSessions } from '@/lib/gps-work-session-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bearer(request: Request): string {
  const value = request.headers.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function dateSequence(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to && dates.length <= 90) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export async function POST(request: Request) {
  try {
    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(bearer(request)).catch(() => null);
    if (!decoded?.uid) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    const blocked = await ensureDemoTrialActiveByUid(decoded.uid);
    if (blocked) return blocked;

    const body = await request.json().catch(() => ({})) as { from?: unknown; to?: unknown; dryRun?: unknown };
    if (!validDate(body.from) || !validDate(body.to) || body.from > body.to) {
      return NextResponse.json({ ok: false, message: 'Gebruik een geldige periode met from en to.' }, { status: 400 });
    }
    const dates = dateSequence(body.from, body.to);
    if (dates.length === 0 || dates.length > 90) {
      return NextResponse.json({ ok: false, message: 'Kies maximaal 90 dagen.' }, { status: 400 });
    }
    const dryRun = body.dryRun !== false;
    const result = await reprocessGpsWorkSessions(firestore, decoded.uid, dates, { dryRun });
    return NextResponse.json({ ok: true, dryRun, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'GPS-uren opnieuw berekenen mislukt.' }, { status: 500 });
  }
}
