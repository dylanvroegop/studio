import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { gpsHealth } from '@/lib/gps-health';
import { readGpsHealth } from '@/lib/gps-health-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const { auth } = initFirebaseAdmin();
  const uid = (await auth.verifyIdToken(request.headers.get('authorization')?.replace(/^Bearer /, '') || '').catch(() => null))?.uid;
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  if (!process.env.CALVORA_USER_ID || uid !== process.env.CALVORA_USER_ID.trim()) return NextResponse.json({ enabled: false });
  try {
    return NextResponse.json({ enabled: true, ...await readGpsHealth() });
  } catch {
    return NextResponse.json({ enabled: true, ...gpsHealth(null) });
  }
}
