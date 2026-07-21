import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function noStoreHeaders(): HeadersInit {
  return { 'Cache-Control': 'no-store' };
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function resolveAutomationUid(request: Request, input: Record<string, unknown>): string | null {
  const expectedSecret = safeString(process.env.N8N_HEADER_SECRET);
  const providedSecret = safeString(request.headers.get('x-offertehulp-secret'));
  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) return null;

  return safeString(input.user_id) || safeString(request.headers.get('x-offertehulp-user-id')) || null;
}

function serializeTimestamp(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  const raw = safeString(value);
  return raw || new Date().toISOString();
}

function mapPendingImport(id: string, raw: Record<string, unknown>): Record<string, unknown> {
  const payload = asRecord(raw.payload) || {};
  return {
    id,
    ...payload,
    status: safeString(raw.status) || 'pending',
    created_at: serializeTimestamp(raw.createdAt),
    updated_at: serializeTimestamp(raw.updatedAt || raw.createdAt),
  };
}

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401, headers: noStoreHeaders() });
    }

    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid || '';
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401, headers: noStoreHeaders() });
    }

    const snapshot = await firestore
      .collection('pending_cost_imports')
      .where('userId', '==', uid)
      .get();

    const data = snapshot.docs
      .map((doc) => mapPendingImport(doc.id, doc.data() as Record<string, unknown>))
      .filter((item) => item.status === 'pending')
      .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));

    return NextResponse.json({ ok: true, data }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon openstaande facturen niet laden.';
    return NextResponse.json({ ok: false, message }, { status: 500, headers: noStoreHeaders() });
  }
}

export async function POST(request: Request) {
  try {
    const body = asRecord(await request.json().catch(() => null));
    if (!body) {
      return NextResponse.json({ ok: false, message: 'Ongeldige payload.' }, { status: 400 });
    }

    const payload = asRecord(body.payload) || body;
    const uid = resolveAutomationUid(request, body);
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { firestore } = initFirebaseAdmin();
    const pendingRef = firestore.collection('pending_cost_imports').doc();
    const now = new Date();
    const storedPayload = { ...payload };
    delete storedPayload.user_id;

    await pendingRef.set({
      userId: uid,
      status: 'pending',
      payload: {
        ...storedPayload,
        offerte_id: safeString(payload.offerte_id) || null,
      },
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json(
      { ok: true, id: pendingRef.id, data: mapPendingImport(pendingRef.id, { payload, status: 'pending', createdAt: now, updatedAt: now }) },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon factuur in de wachtrij te zetten.';
    return NextResponse.json({ ok: false, message }, { status: 500, headers: noStoreHeaders() });
  }
}
