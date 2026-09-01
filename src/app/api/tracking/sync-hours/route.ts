import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { dateSequence } from '@/lib/gps-hour-sync';
import { reprocessGpsWorkSessions } from '@/lib/gps-work-session-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

export async function POST(request: Request) {
  try {
    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(bearer(request) || '').catch(() => null);
    if (!decoded?.uid) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    const blocked = await ensureDemoTrialActiveByUid(decoded.uid);
    if (blocked) return blocked;
    const body = await request.json().catch(() => ({})) as { from?: string; to?: string };
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const from = /^\d{4}-\d{2}-\d{2}$/.test(body.from || '') ? body.from! : today;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(body.to || '') ? body.to! : from;
    const dates = dateSequence(from, to);
    if (!dates.length || dates.length > 14) return NextResponse.json({ ok: false, message: 'Per synchronisatie zijn maximaal 14 dagen toegestaan.' }, { status: 400 });
    // Keep this legacy endpoint on the same bookkeeping pipeline as the
    // work-session UI. Otherwise an old client could overwrite corrected
    // entries with the former stop-only calculation.
    const result = await reprocessGpsWorkSessions(firestore, decoded.uid, dates, { dryRun: false });
    return NextResponse.json({ ok: true, synced: result.updatedTimeEntries, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'GPS-uren synchroniseren mislukt.' }, { status: 500 });
  }
}
