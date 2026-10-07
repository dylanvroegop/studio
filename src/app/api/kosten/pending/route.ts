import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { mapPendingImport, pendingFingerprint, queuePendingCostImport } from '@/lib/pending-cost-imports';

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

    const rows = snapshot.docs.map((doc) => ({
      doc,
      raw: doc.data() as Record<string, unknown>,
      mapped: mapPendingImport(doc.id, doc.data() as Record<string, unknown>),
    }));
    const duplicatePendingIds = new Set<string>();
    const seenFingerprints = new Set<string>();
    const statusPriority: Record<string, number> = { linked: 0, pending: 1, dismissed: 2 };
    const orderedRows = [...rows].sort((left, right) => {
      const leftStatus = safeString(left.raw.status) || 'pending';
      const rightStatus = safeString(right.raw.status) || 'pending';
      const priorityDiff = (statusPriority[leftStatus] ?? 3) - (statusPriority[rightStatus] ?? 3);
      if (priorityDiff !== 0) return priorityDiff;
      return String(right.mapped.created_at).localeCompare(String(left.mapped.created_at));
    });

    for (const row of orderedRows) {
      const fingerprint = pendingFingerprint(row.raw);
      if (!fingerprint || seenFingerprints.has(fingerprint)) {
        if ((safeString(row.raw.status) || 'pending') === 'pending') duplicatePendingIds.add(row.doc.id);
        continue;
      }
      seenFingerprints.add(fingerprint);
    }

    await Promise.all([...duplicatePendingIds].map((id) =>
      firestore.collection('pending_cost_imports').doc(id).update({
        status: 'duplicate',
        updatedAt: new Date(),
      }).catch(() => null)
    ));

    const data = rows
      .map((row) => row.mapped)
      .filter((item) => item.status === 'pending' && !duplicatePendingIds.has(String(item.id)))
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

    const result = await queuePendingCostImport(uid, payload);
    return NextResponse.json({ ok: true, ...result }, { headers: noStoreHeaders() });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon factuur in de wachtrij te zetten.';
    return NextResponse.json({ ok: false, message }, { status: 500, headers: noStoreHeaders() });
  }
}

export async function DELETE(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = asRecord(await request.json().catch(() => null));
    const pendingId = safeString(body?.id);
    if (!pendingId) {
      return NextResponse.json({ ok: false, message: 'Pending-import-id ontbreekt.' }, { status: 400 });
    }

    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid || '';
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const pendingRef = firestore.collection('pending_cost_imports').doc(pendingId);
    const pendingSnap = await pendingRef.get();
    if (!pendingSnap.exists) {
      return NextResponse.json({ ok: false, message: 'Openstaande factuur bestaat niet meer.' }, { status: 404 });
    }

    const pending = pendingSnap.data() as Record<string, unknown>;
    if (safeString(pending.userId) !== uid) {
      return NextResponse.json({ ok: false, message: 'Geen toegang tot deze openstaande factuur.' }, { status: 403 });
    }

    await pendingRef.update({
      status: 'dismissed',
      dismissedAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({ ok: true }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon de openstaande factuur niet verbergen.';
    return NextResponse.json({ ok: false, message }, { status: 500, headers: noStoreHeaders() });
  }
}
