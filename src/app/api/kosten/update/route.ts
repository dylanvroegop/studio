import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import {
  archiveIdsFromReceiptFiles,
  linkTaxDocumentToCosts,
} from '@/lib/tax-document-archive';
import {
  mapProjectCostRow,
  normalizeProjectCostCategory,
  normalizeProjectCostLineItems,
  normalizeProjectCostReceiptFiles,
  roundEuro,
  sumProjectCostLineItems,
} from '@/lib/project-costs';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function dateOnly(value: unknown): string {
  const raw = safeString(value);
  if (raw) return raw.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function sumLineItemsInclBtw(
  lineItems: ReturnType<typeof normalizeProjectCostLineItems>,
  fallbackBtwPercentage: number
): number {
  return roundEuro(
    lineItems.reduce((sum, item) => {
      const lineBtwPercentage = item.btw_percentage ?? fallbackBtwPercentage;
      const calculatedIncl = roundEuro(item.total_price * (1 + lineBtwPercentage / 100));
      return sum + (item.total_incl_btw ?? calculatedIncl);
    }, 0)
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isMissingColumnError(message: string, table: string, column: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes(`could not find the '${column.toLowerCase()}' column`)
    || (lower.includes(table.toLowerCase()) && lower.includes(column.toLowerCase()) && lower.includes('does not exist'))
  );
}

function isImageReceiptFile(file: { url?: string; filename?: string; content_type?: string }): boolean {
  const contentType = safeString(file.content_type).toLowerCase();
  if (contentType.startsWith('image/')) return true;

  const filename = safeString(file.filename).toLowerCase();
  return /\.(png|jpe?g|webp|heic|heif|gif|bmp|tiff?)$/i.test(filename);
}

async function syncCostReceiptImagesToQuoteBonnetjes(params: {
  uid: string;
  offerteId: string;
  costId: string;
  receiptFiles: Array<{
    url: string;
    path: string | null;
    filename: string;
    content_type: string;
    size_bytes: number;
    uploaded_at: string;
  }>;
}): Promise<void> {
  const imageFiles = params.receiptFiles.filter((file) => isImageReceiptFile(file));
  if (imageFiles.length === 0) return;

  const { firestore } = initFirebaseAdmin();
  const quoteRef = firestore.collection('quotes').doc(params.offerteId);
  const quoteSnap = await quoteRef.get();
  if (!quoteSnap.exists) return;

  const quoteData = quoteSnap.data() || {};
  const ownerId = safeString((quoteData as { userId?: unknown }).userId);
  if (!ownerId || ownerId !== params.uid) return;

  const existing = Array.isArray((quoteData as { bonnetjes?: unknown }).bonnetjes)
    ? ((quoteData as { bonnetjes: Array<Record<string, unknown>> }).bonnetjes)
    : [];

  const dedupeKeys = new Set(
    existing.map((item) => `${safeString(item.downloadUrl)}|${safeString(item.originalName)}`).filter(Boolean)
  );

  const nowIso = new Date().toISOString();
  const additions: Array<Record<string, unknown>> = [];
  imageFiles.forEach((file, index) => {
    const fileUrl = safeString(file.url);
    if (!fileUrl) return;

    const originalName = safeString(file.filename) || `kost-bonnetje-${Date.now()}-${index + 1}.jpg`;
    const dedupeKey = `${fileUrl}|${originalName}`;
    if (dedupeKeys.has(dedupeKey)) return;

    dedupeKeys.add(dedupeKey);
    additions.push({
      id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      quoteId: params.offerteId,
      originalName,
      mimeType: safeString(file.content_type) || 'image/jpeg',
      sizeBytes: Math.max(0, safeNumber(file.size_bytes)),
      storagePath: safeString(file.path),
      downloadUrl: fileUrl,
      createdAt: safeString(file.uploaded_at) || nowIso,
      uploadedBy: params.uid,
      source: 'kosten_tab',
      sourceCostId: params.costId,
    });
  });

  if (additions.length === 0) return;

  await quoteRef.update({
    bonnetjes: [...existing, ...additions],
    updatedAt: new Date(),
  });
}

async function validateQuoteOwnership(params: {
  offerteId: string;
  uid: string;
}): Promise<void> {
  const { firestore } = initFirebaseAdmin();
  const quoteSnap = await firestore.collection('quotes').doc(params.offerteId).get();
  if (!quoteSnap.exists) {
    throw new Error('Offerte niet gevonden.');
  }
  const data = quoteSnap.data() || {};
  const ownerId = safeString((data as { userId?: unknown }).userId);
  if (!ownerId || ownerId !== params.uid) {
    throw new Error('Geen toegang tot deze offerte.');
  }
}

async function resolveOfferteIdFromReference(params: {
  reference: string;
  uid: string;
}): Promise<string | null> {
  const normalizedReference = safeString(params.reference);
  if (!normalizedReference) return null;

  const { firestore } = initFirebaseAdmin();

  const directSnap = await firestore.collection('quotes').doc(normalizedReference).get();
  if (directSnap.exists) {
    const data = directSnap.data() || {};
    const ownerId = safeString((data as { userId?: unknown }).userId);
    if (ownerId === params.uid) return directSnap.id;
  }

  const extractedNumber = normalizedReference.toLowerCase().match(/\d{2,}/)?.[0] || '';
  if (!extractedNumber) return null;

  const parsedNumber = Number(extractedNumber);
  if (!Number.isFinite(parsedNumber)) return null;

  const numericCandidates = [parsedNumber, String(parsedNumber)];
  for (const candidate of numericCandidates) {
    const snap = await firestore
      .collection('quotes')
      .where('userId', '==', params.uid)
      .where('offerteNummer', '==', candidate)
      .limit(1)
      .get();
    if (!snap.empty) {
      return snap.docs[0].id;
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid || '';
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, message: 'Ongeldige payload.' }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    const costId = safeString(input.id || input.cost_id);
    if (!costId) {
      return NextResponse.json({ ok: false, message: 'id is verplicht.' }, { status: 400 });
    }
    if (!isUuid(costId)) {
      return NextResponse.json({ ok: false, message: 'id is geen geldige UUID.' }, { status: 400 });
    }

    const existing = await supabaseAdmin
      .from('project_costs')
      .select('id,user_id,offerte_id')
      .eq('id', costId)
      .maybeSingle();

    if (existing.error) {
      return NextResponse.json({ ok: false, message: existing.error.message }, { status: 500 });
    }
    if (!existing.data) {
      return NextResponse.json({ ok: false, message: 'Kost niet gevonden.' }, { status: 404 });
    }

    const rowUserId = safeString((existing.data as Record<string, unknown>).user_id);
    if (!rowUserId || rowUserId !== uid) {
      return NextResponse.json({ ok: false, message: 'Geen toegang tot deze kost.' }, { status: 403 });
    }
    const supplierName = safeString(input.supplier_name);
    if (!supplierName) {
      return NextResponse.json({ ok: false, message: 'Leverancier is verplicht.' }, { status: 400 });
    }

    const category = normalizeProjectCostCategory(input.category);
    const description = safeString(input.description) || supplierName;
    const rawOfferteReference = safeString(input.offerte_id);
    let offerteId: string | null = null;
    if (rawOfferteReference) {
      const resolvedOfferteId = await resolveOfferteIdFromReference({
        reference: rawOfferteReference,
        uid,
      });
      if (resolvedOfferteId) {
        offerteId = resolvedOfferteId;
        await validateQuoteOwnership({ offerteId, uid });
      } else {
        // Legacy referenties (bijv. oud offertenummer-formaat) blijven behouden.
        offerteId = rawOfferteReference;
      }
    }

    const lineItems = normalizeProjectCostLineItems(input.line_items);
    const lineItemsTotal = sumProjectCostLineItems(lineItems);
    const requestedAmountExcl = roundEuro(safeNumber(input.amount_excl_btw));
    const requestedAmountIncl = roundEuro(safeNumber(input.amount_incl_btw));
    const manualOverride = input.manual_amount_override === true;

    const amountExcl = roundEuro(
      manualOverride
        ? requestedAmountExcl
        : (lineItemsTotal !== 0 ? lineItemsTotal : requestedAmountExcl)
    );
    if (amountExcl === 0) {
      return NextResponse.json({ ok: false, message: 'Bedrag excl. BTW mag niet 0 zijn.' }, { status: 400 });
    }

    const btwPercentage = roundEuro(safeNumber(input.btw_percentage) || 21);
    const amountIncl = requestedAmountIncl !== 0
      ? requestedAmountIncl
      : roundEuro(amountExcl * (1 + btwPercentage / 100));
    const btwAmount = roundEuro(amountIncl - amountExcl);
    const date = dateOnly(input.date);
    const receiptUrl = safeString(input.receipt_url) || null;
    const receiptFiles = normalizeProjectCostReceiptFiles(input.receipt_files, receiptUrl);
    const status = safeString(input.status) || 'confirmed';

    // A single supplier invoice can contain material for multiple quotes. Store a
    // separate cost row per quote so each quote overview receives only its lines.
    const routedLineItems = lineItems.map((item) => ({
      ...item,
      category: normalizeProjectCostCategory(item.category || category),
      offerte_id: safeString(item.offerte_id) || offerteId,
    }));
    const groupedEntries = new Map<string, {
      category: ReturnType<typeof normalizeProjectCostCategory>;
      offerteId: string | null;
      lineItems: typeof routedLineItems;
    }>();

    routedLineItems.forEach((line) => {
      const key = `${line.category}__${line.offerte_id || 'none'}`;
      const group = groupedEntries.get(key);
      if (group) {
        group.lineItems.push(line);
        return;
      }
      groupedEntries.set(key, {
        category: line.category,
        offerteId: line.offerte_id || null,
        lineItems: [line],
      });
    });

    const quoteIdsToValidate = Array.from(
      new Set(
        routedLineItems
          .map((item) => safeString(item.offerte_id))
          .filter(Boolean)
      )
    );
    for (const quoteId of quoteIdsToValidate) {
      await validateQuoteOwnership({ offerteId: quoteId, uid });
    }

    if (groupedEntries.size > 1) {
      const groups = Array.from(groupedEntries.values());
      const primaryRow: Record<string, unknown>[] = [];

      for (const [index, group] of groups.entries()) {
        const groupAmountExcl = sumProjectCostLineItems(group.lineItems);
        const groupAmountIncl = sumLineItemsInclBtw(group.lineItems, btwPercentage);
        const groupPayload = {
          offerte_id: group.offerteId,
          category: group.category,
          supplier_name: supplierName,
          supplier_order_number: safeString(input.supplier_order_number) || `kost-${date}-${Date.now()}-${index + 1}`,
          description: `${description} (${group.category})`,
          line_items: group.lineItems,
          amount_excl_btw: groupAmountExcl,
          btw_percentage: btwPercentage,
          btw_amount: roundEuro(groupAmountIncl - groupAmountExcl),
          amount_incl_btw: groupAmountIncl,
          date,
          receipt_url: receiptUrl,
          receipt_files: receiptFiles,
          status,
          updated_at: new Date().toISOString(),
        };

        const writeGroup = async (payload: Record<string, unknown>) => (
          index === 0
            ? supabaseAdmin
              .from('project_costs')
              .update(payload)
              .eq('id', costId)
              .eq('user_id', uid)
              .select('*')
              .single()
            : supabaseAdmin
              .from('project_costs')
              .insert({ ...payload, user_id: uid })
              .select('*')
              .single()
        );

        let result = await writeGroup(groupPayload);
        // Some existing installations predate the receipt_files column.
        if (result.error && isMissingColumnError(result.error.message, 'project_costs', 'receipt_files')) {
          const { receipt_files: _receiptFiles, ...fallbackPayload } = groupPayload;
          result = await writeGroup(fallbackPayload);
        }

        if (result.error) {
          return NextResponse.json({ ok: false, message: result.error.message }, { status: 500 });
        }

        primaryRow.push(result.data as Record<string, unknown>);

        if (group.offerteId) {
          try {
            await syncCostReceiptImagesToQuoteBonnetjes({
              uid,
              offerteId: group.offerteId,
              costId: safeString((result.data as Record<string, unknown>).id),
              receiptFiles,
            });
          } catch (syncError) {
            console.warn('[kosten/update] Kon bonnetjes niet aan gesplitste offerte koppelen:', syncError);
          }
        }
      }

      const splitCostIds = primaryRow
        .map((row) => safeString(row.id))
        .filter(Boolean);
      for (const archiveId of archiveIdsFromReceiptFiles(receiptFiles)) {
        try {
          await linkTaxDocumentToCosts({ archiveId, userId: uid, costIds: splitCostIds });
        } catch (archiveError) {
          console.warn('[kosten/update] Kon document niet aan gesplitste kost koppelen:', archiveError);
        }
      }

      return NextResponse.json({
        ok: true,
        data: mapProjectCostRow(primaryRow[0]),
      });
    }

    const updatePayload: Record<string, unknown> = {
      offerte_id: offerteId,
      category,
      supplier_name: supplierName,
      description,
      line_items: lineItems,
      amount_excl_btw: amountExcl,
      btw_percentage: btwPercentage,
      btw_amount: btwAmount,
      amount_incl_btw: amountIncl,
      date,
      receipt_url: receiptUrl,
      receipt_files: receiptFiles,
      status,
      updated_at: new Date().toISOString(),
    };

    let updated = await supabaseAdmin
      .from('project_costs')
      .update(updatePayload)
      .eq('id', costId)
      .eq('user_id', uid)
      .select('*')
      .single();

    if (updated.error && isMissingColumnError(updated.error.message, 'project_costs', 'receipt_files')) {
      const fallbackPayload = { ...updatePayload };
      delete fallbackPayload.receipt_files;
      updated = await supabaseAdmin
        .from('project_costs')
        .update(fallbackPayload)
        .eq('id', costId)
        .eq('user_id', uid)
        .select('*')
        .single();
    }

    if (updated.error) {
      return NextResponse.json({ ok: false, message: updated.error.message }, { status: 500 });
    }

    for (const archiveId of archiveIdsFromReceiptFiles(receiptFiles)) {
      try {
        await linkTaxDocumentToCosts({ archiveId, userId: uid, costIds: [costId] });
      } catch (archiveError) {
        console.warn('[kosten/update] Kon document niet aan kost koppelen:', archiveError);
      }
    }

    if (offerteId) {
      try {
        await syncCostReceiptImagesToQuoteBonnetjes({
          uid,
          offerteId,
          costId,
          receiptFiles,
        });
      } catch (syncError) {
        console.warn('[kosten/update] Kon bonnetjes sync niet uitvoeren:', syncError);
      }
    }

    return NextResponse.json({
      ok: true,
      data: mapProjectCostRow(updated.data),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon kost niet bijwerken.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
