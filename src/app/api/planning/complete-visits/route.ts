import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { completeVisitedAppointments } from '@/lib/appointment-visit-completion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const { auth, firestore } = initFirebaseAdmin();
  const header = request.headers.get('authorization') || '';
  const decoded = header.startsWith('Bearer ') ? await auth.verifyIdToken(header.slice(7)).catch(() => null) : null;
  if (!decoded?.uid) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...await completeVisitedAppointments(firestore, decoded.uid) });
  } catch (error) {
    console.error('GPS-bezoek afronden mislukt:', error);
    return NextResponse.json({ ok: false, message: 'Bezoekcontrole mislukt. Nog niet afgeronde reserveringen blijven behouden.' }, { status: 502 });
  }
}
