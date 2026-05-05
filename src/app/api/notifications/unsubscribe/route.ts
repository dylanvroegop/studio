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

    const body = await request.json().catch(() => null) as { token?: string } | null;
    const pushToken = body?.token?.trim();
    if (!pushToken) return NextResponse.json({ error: 'Token is verplicht' }, { status: 400 });

    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const snap = await firestore.collection('push_subscriptions')
      .where('userId', '==', decoded.uid)
      .where('token', '==', pushToken)
      .limit(20)
      .get();

    const batch = firestore.batch();
    snap.docs.forEach((docRef) => batch.delete(docRef.ref));
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('unsubscribe error', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
