import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { linkStoredGpsPurchases } from '@/lib/gps-purchase-link-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const { auth } = initFirebaseAdmin();
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
    const user = await auth.verifyIdToken(token).catch(() => null);
    if (!user?.uid) return NextResponse.json({ ok: false }, { status: 401 });
    const body = await request.json();
    const from = String(body.from || ''), to = String(body.to || '');
    const days = (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000;
    if (![from, to].every(day => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T12:00:00Z`)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day) || !Number.isFinite(days) || days < 0 || days > 13) {
      return NextResponse.json({ ok: false, message: 'Kies een geldige periode van maximaal 14 dagen.' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...await linkStoredGpsPurchases(user.uid, from, to, body.dryRun !== false) });
  } catch {
    return NextResponse.json({ ok: false, message: 'GPS-koppeling kon niet worden uitgevoerd.' }, { status: 500 });
  }
}
