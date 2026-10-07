import { initFirebaseAdmin } from '@/firebase/admin';
import { costImportHasTools } from '@/lib/cost-import-routing';
import { normalizeProjectCostCategory } from '@/lib/project-costs';

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

function serializeTimestamp(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  const raw = safeString(value);
  return raw || new Date().toISOString();
}

export function mapPendingImport(id: string, raw: Record<string, unknown>): Record<string, unknown> {
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

export function pendingFingerprint(raw: Record<string, unknown>): string {
  const stored = safeString(raw.pendingFingerprint);
  if (stored) return stored;
  return createPendingFingerprint(asRecord(raw.payload) || {});
}

export async function queuePendingCostImport(uid: string, payload: Record<string, unknown>): Promise<{
  id: string;
  deduplicated: boolean;
  data: Record<string, unknown>;
}> {
    const { firestore } = initFirebaseAdmin();
    payload = { ...payload };
    if (costImportHasTools(payload)) {
      payload.review_reason = 'gereedschap';
      payload.line_items = (Array.isArray(payload.line_items) ? payload.line_items : []).map((line) => {
        const item = asRecord(line) || {};
        return normalizeProjectCostCategory(item.category) === 'gereedschap' ? { ...item, offerte_id: null } : item;
      });
    }
    if (!safeString(payload.offerte_id) && safeString(payload.offerte_reference)) {
      const reference = safeString(payload.offerte_reference).match(/(?:^|\D)(\d{5,8})(?:\D|$)/)?.[1];
      if (reference) {
        const quotes = await firestore.collection('quotes').where('userId', '==', uid).get();
        const matches = quotes.docs.filter((quote) => String(quote.data().offerteNummer) === reference);
        if (matches.length === 1) payload.offerte_id = matches[0].id;
      }
    }
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
      return {
        deduplicated: true,
        id: existingDuplicate.id,
        data: mapPendingImport(existingDuplicate.id, raw),
      };
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

    return { id: pendingRef.id, deduplicated: false, data: mapPendingImport(pendingRef.id, { payload, status: 'pending', createdAt: now, updatedAt: now }) };
}
