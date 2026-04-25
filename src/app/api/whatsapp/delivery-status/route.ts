import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) {
      return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
    }

    const url = new URL(request.url);
    const messageId = safeString(url.searchParams.get('messageId'));
    const quoteId = safeString(url.searchParams.get('quoteId'));

    if (!messageId && !quoteId) {
      return NextResponse.json({ ok: false, message: 'Provide messageId or quoteId' }, { status: 400 });
    }

    if (messageId) {
      const events = await firestore
        .collection('whatsapp_delivery_events')
        .where('messageId', '==', messageId)
        .get();

      return NextResponse.json({
        ok: true,
        messageId,
        events: events.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      });
    }

    const quoteRef = firestore.collection('quotes').doc(quoteId);
    const quoteSnap = await quoteRef.get();
    if (!quoteSnap.exists) {
      return NextResponse.json({ ok: false, message: 'Quote not found' }, { status: 404 });
    }

    const quoteData = quoteSnap.data() as { userId?: unknown; klantinformatie?: { userId?: unknown } } | undefined;
    const ownerId = safeString(quoteData?.userId) || safeString(quoteData?.klantinformatie?.userId);
    if (!ownerId || ownerId !== decoded.uid) {
      return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 });
    }

    const logs = await quoteRef
      .collection('communication_logs')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    return NextResponse.json({
      ok: true,
      quoteId,
      logs: logs.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load delivery status';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
