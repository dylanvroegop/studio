import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim();
}

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const snap = await firestore.collection('users').doc(decoded.uid).get();
    const data = snap.data() as { integrations?: { googleCalendar?: { connected?: boolean } } } | undefined;
    const connected = data?.integrations?.googleCalendar?.connected === true;

    return NextResponse.json({ connected });
  } catch (error) {
    console.error('google calendar status error', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
