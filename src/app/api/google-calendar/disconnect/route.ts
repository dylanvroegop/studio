import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim();
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await firestore.collection('users').doc(decoded.uid).set({
      integrations: {
        googleCalendar: {
          connected: false,
          refreshToken: null,
          accessToken: null,
          expiryDate: null,
          updatedAt: new Date(),
        }
      }
    }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('google calendar disconnect error', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
