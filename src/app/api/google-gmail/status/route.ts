import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';

export async function GET(request: Request) {
  try {
    const header = request.headers.get('authorization');
    const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!bearer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(bearer).catch(() => null);
    if (!decoded?.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const data = (await firestore.collection('users').doc(decoded.uid).get()).data() as { integrations?: { googleGmail?: { connected?: boolean; refreshToken?: string } } } | undefined;
    const integration = data?.integrations?.googleGmail;
    return NextResponse.json({ connected: integration?.connected === true && Boolean(integration.refreshToken) });
  } catch (error) {
    console.error('google gmail status error', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
