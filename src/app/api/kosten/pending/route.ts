import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0;
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

function normalizeFingerprintText(value: unknown): string {
  return safeString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function receiptFilename(payload: Record<string, unknown>): string {
  const files = Array.isArray(payload.receipt_files) ? payload.receipt_files : [];
  const firstFile = asRecord(files[0]);
  const explicitFilename = normalizeFingerprintText(firstFile?.filename);
  if (explicitFilename) return explicitFilename;

  const receiptUrl = normalizeFingerprintText(payload.receipt_url);
  const basename = receiptUrl.split('/').pop() || '';
  return basename.replace(/^\d+-/, '');
}

function createPendingFingerprint(payload: Record<string, unknown>): string {
  const sourceIdentity = [
    payload.source_message_id,
    payload.source_mailbox,
    payload.source_attachment_filename,
  ].map(normalizeFingerprintText).filter(Boolean);

  if (sourceIdentity.length > 0) {
    return `source:${sourceIdentity.join('|')}`;
  }

  const lineItems = Array.isArray(payload.line_items)
    ? payload.line_items.map((item) => {
      const row = asRecord(item) || {};
      return [
        safeNumber(row.quantity),
        normalizeFingerprintText(row.unit),
        safeNumber(row.unit_price),
        safeNumber(row.total_price),
        safeNumber(row.total_incl_btw),
      ].join(':');
    }).sort().join('|')
    : '';

  return [
    'content',
    normalizeFingerprintText(payload.supplier_name),
    normalizeFingerprintText(payload.date),
    safeNumber(payload.amount_excl_btw),
    safeNumber(payload.amount_incl_btw),
    receiptFilename(payload),
    lineItems,
  ].join('|');
}

function pendingFingerprint(raw: Record<string, unknown>): string {
  const stored = safeString(raw.pendingFingerprint);
  if (stored) return stored;
  return createPendingFingerprint(asRecord(raw.payload) || {});
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

    const { firestore } = initFirebaseAdmin();
    const incomingFingerprint = createPendingFingerprint(payload);
    const existingSnapshot = await firestore
      .collection('pending_cost_imports')
      .where('userId', '==', uid)
      .get();
    const existingDuplicate = existingSnapshot.docs.find((doc) => {
      const raw = doc.data() as Record<string, unknown>;
      return pendingFingerprint(raw) === incomingFingerprint;
    });

    if (existingDuplicate) {
      const raw = existingDuplicate.data() as Record<string, unknown>;
      return NextResponse.json({
        ok: true,
        deduplicated: true,
        id: existingDuplicate.id,
        data: mapPendingImport(existingDuplicate.id, raw),
      }, { headers: noStoreHeaders() });
    }

    const pendingRef = firestore.collection('pending_cost_imports').doc();
    const now = new Date();
    const storedPayload = { ...payload };
    delete storedPayload.user_id;

    await pendingRef.set({
      userId: uid,
      status: 'pending',
      pendingFingerprint: incomingFingerprint,
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
