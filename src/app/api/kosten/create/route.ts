import { NextResponse } from 'next/server';
import type { DocumentReference } from 'firebase-admin/firestore';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { fetchLaborCostsByQuoteId } from '@/lib/labor-costs';
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

function resolveAutomationUid(
  request: Request,
  input: Record<string, unknown>
): string | null {
  const expectedSecret = safeString(process.env.N8N_HEADER_SECRET);
  if (!expectedSecret) return null;

  const providedSecret = safeString(request.headers.get('x-offertehulp-secret'));
  if (!providedSecret || providedSecret !== expectedSecret) return null;

  const uidFromBody = safeString(input.user_id);
  if (uidFromBody) return uidFromBody;

  const uidFromHeader = safeString(request.headers.get('x-offertehulp-user-id'));
  return uidFromHeader || null;
}

function safeNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeCreateInput(body: Record<string, unknown>): Record<string, unknown> {
  const nestedData = asRecord(body.data);
  if (!nestedData) return body;
  return {
    ...nestedData,
    ...body,
  };
}

function dateOnly(value: unknown): string {
  const raw = safeString(value);
  if (raw) return raw.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function euroToCents(value: number): number {
  return Math.round(roundEuro(value) * 100);
}

function centsToEuro(value: number): number {
  return roundEuro(value / 100);
}

function allocateAmountAcrossGroups(groupTotals: number[], targetAmount: number): number[] {
  const targetCents = euroToCents(targetAmount);
  if (targetCents === 0) return groupTotals.map(() => 0);

  const normalizedTotals = groupTotals.map((value) => safeNumber(value));
  const totalsSum = normalizedTotals.reduce((sum, value) => sum + Math.abs(value), 0);
  if (totalsSum <= 0) {
    return normalizedTotals.map((_, index) => (index === 0 ? centsToEuro(targetCents) : 0));
  }

  const rawShares = normalizedTotals.map((value) => (Math.abs(value) / totalsSum) * Math.abs(targetCents));
  const floorShares = rawShares.map((value) => Math.floor(value));
  const distributed = floorShares.reduce((sum, value) => sum + value, 0);
  let remainder = Math.abs(targetCents) - distributed;

  const order = rawShares
    .map((value, index) => ({
      index,
      fraction: value - floorShares[index],
    }))
    .sort((left, right) => right.fraction - left.fraction);

  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    floorShares[order[cursor].index] += 1;
    remainder -= 1;
    cursor = (cursor + 1) % order.length;
  }

  const sign = Math.sign(targetCents);
  return floorShares.map((value) => centsToEuro(value * sign));
}

function rebalanceLineItemsToTargetAmount(params: {
  lineItems: Array<Record<string, unknown>>;
  targetAmountExcl: number;
}): Array<Record<string, unknown>> {
  const { lineItems, targetAmountExcl } = params;
  if (lineItems.length === 0) return lineItems;

  const currentTotals = lineItems.map((item) => {
    const explicitTotal = roundEuro(safeNumber(item.total_price));
    if (explicitTotal !== 0) return explicitTotal;
    const quantity = safeNumber(item.quantity);
    const unitPrice = safeNumber(item.unit_price);
    return roundEuro(quantity * unitPrice);
  });
  const allocatedTotals = allocateAmountAcrossGroups(currentTotals, targetAmountExcl);

  return lineItems.map((item, index) => {
    const quantity = safeNumber(item.quantity);
    const allocatedTotal = roundEuro(allocatedTotals[index] || 0);
    const allocatedUnitPrice = quantity !== 0
      ? roundEuro(allocatedTotal / quantity)
      : roundEuro(safeNumber(item.unit_price));

    return {
      ...item,
      unit_price: allocatedUnitPrice,
      total_price: allocatedTotal,
    };
  });
}

function isMissingRelationError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('does not exist')
    || lower.includes('relation')
    || lower.includes('not found')
  );
}

function isProjectCostsSchemaMismatchError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('project_costs.') && lower.includes('does not exist');
}

function isMissingColumnError(message: string, table: string, column: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes(`could not find the '${column.toLowerCase()}' column`)
    || (lower.includes(table.toLowerCase()) && lower.includes(column.toLowerCase()) && lower.includes('does not exist'))
  );
}

function getProjectCostsNotNullColumn(message: string): string | null {
  const match = message.match(
    /null value in column "([^"]+)" of relation "project_costs" violates not-null constraint/i
  );
  return match?.[1] || null;
}

function fallbackValueForLegacyRequiredColumn(params: {
  column: string;
  input: Record<string, unknown>;
}): unknown {
  const explicit = params.input[params.column];
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();

  const fallbackRef = String(Date.now());
  const column = params.column.toLowerCase();

  if (
    column === 'supplier_order_number'
    || column === 'order_number'
    || column === 'supplier_invoice_number'
    || column === 'invoice_number'
    || column.endsWith('_number')
  ) {
    return fallbackRef;
  }

  return null;
}

function buildLegacySupplierOrderNumberFallback(params: {
  input: Record<string, unknown>;
  date: string;
}): string {
  return (
    safeString(params.input.supplier_order_number)
    || safeString(params.input.order_number)
    || safeString(params.input.supplier_invoice_number)
    || safeString(params.input.invoice_number)
    || `kost-${params.date}-${Date.now()}`
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

async function upsertProfitOverview(params: {
  uid: string;
  offerteId: string;
}): Promise<void> {
  const { firestore } = initFirebaseAdmin();
  const quoteSnap = await firestore.collection('quotes').doc(params.offerteId).get();
  if (!quoteSnap.exists) return;

  const quoteData = quoteSnap.data() || {};
  const ownerId = safeString((quoteData as { userId?: unknown }).userId);
  if (!ownerId || ownerId !== params.uid) return;

  const quotedPrice = roundEuro(
    safeNumber((quoteData as { totaalbedrag?: unknown }).totaalbedrag)
    || safeNumber((quoteData as { amount?: unknown }).amount)
  );

  const { data: rows, error: costsError } = await supabaseAdmin
    .from('project_costs')
    .select('category, amount_excl_btw')
    .eq('user_id', params.uid)
    .eq('offerte_id', params.offerteId);

  if (costsError) {
    if (isProjectCostsSchemaMismatchError(costsError.message)) return;
    if (isMissingRelationError(costsError.message)) return;
    throw new Error(costsError.message);
  }

  const totals = {
    materiaal: 0,
    autokosten: 0,
    brandstof: 0,
    gereedschap: 0,
    eigen_verbruik: 0,
    hotel: 0,
    telefoon: 0,
    leadkosten: 0,
    overig: 0,
  };

  (rows || []).forEach((row) => {
    const mappedCategory = normalizeProjectCostCategory((row as { category?: unknown }).category);
    totals[mappedCategory] += safeNumber((row as { amount_excl_btw?: unknown }).amount_excl_btw);
  });

  const laborByQuote = await fetchLaborCostsByQuoteId({
    uid: params.uid,
    quoteIds: [params.offerteId],
  });
  const laborCost = laborByQuote.get(params.offerteId)?.costExcl || 0;

  const totalMaterialCost = roundEuro(totals.materiaal);
  const totalFuelCost = roundEuro(totals.brandstof + totals.autokosten);
  const totalToolCost = roundEuro(totals.gereedschap);
  const totalOtherCost = roundEuro(totals.overig + totals.eigen_verbruik + totals.hotel + totals.telefoon + totals.leadkosten);
  const totalLaborCost = roundEuro(laborCost);
  const totalCosts = roundEuro(
    totalMaterialCost
    + totalFuelCost
    + totalToolCost
    + totalOtherCost
    + totalLaborCost
  );
  const profit = roundEuro(quotedPrice - totalCosts);
  const marginPct = quotedPrice > 0 ? roundEuro((profit / quotedPrice) * 1000) / 10 : 0;

  const { error: upsertError } = await supabaseAdmin
    .from('profit_overview')
    .upsert(
      {
        offerte_id: params.offerteId,
        quoted_price: quotedPrice,
        total_material_cost: totalMaterialCost,
        total_fuel_cost: totalFuelCost,
        total_tool_cost: totalToolCost,
        total_other_cost: totalOtherCost,
        total_labor_cost: totalLaborCost,
        total_costs: totalCosts,
        profit,
        margin_pct: marginPct,
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'offerte_id' }
    );

  if (upsertError && !isMissingRelationError(upsertError.message)) {
    throw new Error(upsertError.message);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, message: 'Ongeldige payload.' }, { status: 400 });
    }

    let input = normalizeCreateInput(body as Record<string, unknown>);
    const token = extractBearerToken(request.headers.get('authorization'));
    let uid = '';
    if (token) {
      const { auth } = initFirebaseAdmin();
      const decoded = await auth.verifyIdToken(token);
      uid = decoded?.uid || '';
    } else {
      uid = resolveAutomationUid(request, input) || '';
    }

    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const pendingImportId = safeString(input.pending_import_id);
    let pendingImportRef: FirebaseFirestore.DocumentReference | null = null;
    if (pendingImportId) {
      const { firestore } = initFirebaseAdmin();
      pendingImportRef = firestore.collection('pending_cost_imports').doc(pendingImportId);
      const pendingSnap = await pendingImportRef.get();
      if (!pendingSnap.exists) {
        return NextResponse.json({ ok: false, message: 'Openstaande factuur niet gevonden.' }, { status: 404 });
      }

      const pendingRow = pendingSnap.data() || {};
      const pendingUserId = safeString((pendingRow as { userId?: unknown }).userId);
      if (pendingUserId !== uid) {
        return NextResponse.json({ ok: false, message: 'Geen toegang tot deze openstaande factuur.' }, { status: 403 });
      }

      if (safeString((pendingRow as { status?: unknown }).status) === 'linked') {
        return NextResponse.json({ ok: false, message: 'Deze factuur is al gekoppeld.' }, { status: 409 });
      }

      const pendingPayload = asRecord((pendingRow as { payload?: unknown }).payload);
      if (!pendingPayload) {
        return NextResponse.json({ ok: false, message: 'De gegevens van de openstaande factuur zijn ongeldig.' }, { status: 400 });
      }

      input = {
        ...pendingPayload,
        ...input,
        user_id: uid,
      };
    }

    const supplierName = safeString(input.supplier_name);
    if (!supplierName) {
      return NextResponse.json({ ok: false, message: 'Leverancier is verplicht.' }, { status: 400 });
    }

    const category = normalizeProjectCostCategory(input.category);
    const description = safeString(input.description) || supplierName;
    const offerteId =
      safeString(input.offerte_id)
      || (await resolveOfferteIdFromReference({
        reference: safeString(input.offerte_reference),
        uid,
      }))
      || null;
    if (offerteId) {
      await validateQuoteOwnership({ offerteId, uid });
    }

    const lineItems = normalizeProjectCostLineItems(input.line_items);
    const requestedAmountExcl = roundEuro(safeNumber(input.amount_excl_btw));
    const requestedAmountIncl = roundEuro(safeNumber(input.amount_incl_btw));
    const manualOverride = input.manual_amount_override === true;
    const btwPercentage = roundEuro(safeNumber(input.btw_percentage) || 21);
    const date = dateOnly(input.date);
    const receiptUrl = safeString(input.receipt_url) || null;
    const receiptFiles = normalizeProjectCostReceiptFiles(input.receipt_files, receiptUrl);
    const status = safeString(input.status) || 'confirmed';

    const routedLineItems = lineItems.map((item) => {
      const lineCategory = normalizeProjectCostCategory(item.category || category);
      const lineOfferteIdRaw = safeString(item.offerte_id || null);
      const lineOfferteId = lineOfferteIdRaw || offerteId;
      return {
        ...item,
        category: lineCategory,
        offerte_id: lineOfferteId,
      };
    });

    const quoteIdsToValidate = Array.from(
      new Set(
        routedLineItems
          .map((item) => safeString(item.offerte_id || null))
          .filter(Boolean)
      )
    );
    for (const quoteId of quoteIdsToValidate) {
      await validateQuoteOwnership({ offerteId: quoteId, uid });
    }

    const insertWithFallback = async (
      insertPayload: Record<string, unknown>
    ): Promise<{ data: any; error: any }> => {
      let { data, error } = await supabaseAdmin
        .from('project_costs')
        .insert(insertPayload)
        .select('*')
        .single();

      if (error) {
        const retryPayload: Record<string, unknown> = { ...insertPayload };
        let latestRetryPayload: Record<string, unknown> = retryPayload;
        let attempts = 0;
        while (error && attempts < 5) {
          const notNullColumn = getProjectCostsNotNullColumn(error.message);
          if (!notNullColumn) break;

          const existingValue = retryPayload[notNullColumn];
          if (existingValue !== null && existingValue !== undefined && `${existingValue}`.trim() !== '') {
            break;
          }

          const fallback = fallbackValueForLegacyRequiredColumn({
            column: notNullColumn,
            input,
          });
          if (fallback === null || fallback === undefined || `${fallback}`.trim() === '') {
            break;
          }

          retryPayload[notNullColumn] = fallback;
          latestRetryPayload = retryPayload;
          const retry = await supabaseAdmin
            .from('project_costs')
            .insert(retryPayload)
            .select('*')
            .single();

          data = retry.data;
          error = retry.error;
          attempts += 1;
        }

        if (error && isMissingColumnError(error.message, 'project_costs', 'supplier_order_number')) {
          const retryPayloadWithoutSupplierOrderNumber: Record<string, unknown> = { ...latestRetryPayload };
          delete retryPayloadWithoutSupplierOrderNumber.supplier_order_number;
          latestRetryPayload = retryPayloadWithoutSupplierOrderNumber;
          const retryWithoutSupplierOrderNumber = await supabaseAdmin
            .from('project_costs')
            .insert(retryPayloadWithoutSupplierOrderNumber)
            .select('*')
            .single();
          data = retryWithoutSupplierOrderNumber.data;
          error = retryWithoutSupplierOrderNumber.error;
        }

        if (error && isMissingColumnError(error.message, 'project_costs', 'receipt_files')) {
          const retryPayloadWithoutReceiptFiles: Record<string, unknown> = { ...latestRetryPayload };
          delete retryPayloadWithoutReceiptFiles.receipt_files;
          const retryWithoutReceiptFiles = await supabaseAdmin
            .from('project_costs')
            .insert(retryPayloadWithoutReceiptFiles)
            .select('*')
            .single();
          data = retryWithoutReceiptFiles.data;
          error = retryWithoutReceiptFiles.error;
        }
      }

      return { data, error };
    };

    const groupedEntries = new Map<string, {
      category: ReturnType<typeof normalizeProjectCostCategory>;
      offerteId: string | null;
      lineItems: typeof routedLineItems;
    }>();

    routedLineItems.forEach((line) => {
      const key = `${line.category}__${line.offerte_id || 'none'}`;
      const existing = groupedEntries.get(key);
      if (existing) {
        existing.lineItems.push(line);
        return;
      }
      groupedEntries.set(key, {
        category: line.category,
        offerteId: line.offerte_id || null,
        lineItems: [line],
      });
    });

    if (groupedEntries.size === 0) {
      groupedEntries.set(`${category}__${offerteId || 'none'}`, {
        category,
        offerteId,
        lineItems: [],
      });
    }

    const groupedArray = Array.from(groupedEntries.values());
    const groupLineTotals = groupedArray.map((group) => sumProjectCostLineItems(group.lineItems));
    let amountExclPerGroup = groupLineTotals.map((value) => roundEuro(value));
    const groupedLineTotal = roundEuro(groupLineTotals.reduce((sum, value) => sum + roundEuro(value), 0));
    const shouldApplyManualOverrideForSplit =
      manualOverride
      && requestedAmountExcl !== 0
      && Math.abs(groupedLineTotal - requestedAmountExcl) > 0.05;

    if (shouldApplyManualOverrideForSplit) {
      amountExclPerGroup = allocateAmountAcrossGroups(groupLineTotals, requestedAmountExcl);
    } else if (groupedArray.length === 1 && amountExclPerGroup[0] === 0 && requestedAmountExcl !== 0) {
      amountExclPerGroup = [roundEuro(requestedAmountExcl)];
    }

    const insertedRows: any[] = [];

    for (const [groupIndex, group] of groupedArray.entries()) {
      let groupLineItems = group.lineItems;
      const amountExcl = roundEuro(amountExclPerGroup[groupIndex] || 0);
      if (amountExcl === 0) continue;

      const groupLineTotal = sumProjectCostLineItems(groupLineItems as any);
      if (groupLineItems.length > 0 && Math.abs(groupLineTotal - amountExcl) > 0.01) {
        groupLineItems = rebalanceLineItemsToTargetAmount({
          lineItems: groupLineItems as unknown as Array<Record<string, unknown>>,
          targetAmountExcl: amountExcl,
        }) as any;
      }

      const amountIncl = groupedArray.length === 1 && requestedAmountIncl !== 0
        ? requestedAmountIncl
        : roundEuro(amountExcl * (1 + btwPercentage / 100));
      const btwAmount = roundEuro(amountIncl - amountExcl);
      const rowDescription = groupedArray.length > 1
        ? `${description} (${group.category})`
        : description;

      const insertPayload: Record<string, unknown> = {
        user_id: uid,
        offerte_id: group.offerteId,
        category: group.category,
        supplier_name: supplierName,
        supplier_order_number: buildLegacySupplierOrderNumberFallback({ input, date }),
        description: rowDescription,
        line_items: groupLineItems,
        amount_excl_btw: amountExcl,
        btw_percentage: btwPercentage,
        btw_amount: btwAmount,
        amount_incl_btw: amountIncl,
        date,
        receipt_url: receiptUrl,
        receipt_files: receiptFiles,
        status,
      };

      const { data, error } = await insertWithFallback(insertPayload);

      if (error) {
        if (isProjectCostsSchemaMismatchError(error.message)) {
          return NextResponse.json(
            {
              ok: false,
              message:
                'Database migratie ontbreekt: voer staging_sql/20260402_repair_project_costs_schema.sql uit.',
            },
            { status: 500 }
          );
        }

        const notNullColumn = getProjectCostsNotNullColumn(error.message);
        if (notNullColumn) {
          return NextResponse.json(
            {
              ok: false,
              message:
                `Database schema mismatch: kolom "${notNullColumn}" is verplicht in project_costs. ` +
                'Maak die kolom optioneel in Supabase (voor kosten moet niets verplicht ingevuld worden).',
            },
            { status: 500 }
          );
        }

        return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
      }

      insertedRows.push(data);
    }

    if (insertedRows.length === 0) {
      return NextResponse.json({ ok: false, message: 'Bedrag excl. BTW moet groter dan 0 zijn.' }, { status: 400 });
    }

    const insertedCostIds = insertedRows
      .map((row) => safeString((row as Record<string, unknown>).id))
      .filter(Boolean);
    for (const archiveId of archiveIdsFromReceiptFiles(receiptFiles)) {
      try {
        await linkTaxDocumentToCosts({
          archiveId,
          userId: uid,
          costIds: insertedCostIds,
        });
      } catch (archiveError) {
        // The archive itself is already durable and the receipt_files JSON keeps
        // its id; linking is retried safely when the cost is edited later.
        console.warn('[kosten/create] Kon document niet aan kost koppelen:', archiveError);
      }
    }

    const overviewQuoteIds = Array.from(
      new Set(
        insertedRows
          .map((row) => safeString((row as Record<string, unknown>).offerte_id))
          .filter(Boolean)
      )
    );
    for (const quoteId of overviewQuoteIds) {
      try {
        await upsertProfitOverview({ uid, offerteId: quoteId });
      } catch (overviewError) {
        console.warn('[kosten/create] Kon profit_overview niet bijwerken:', overviewError);
      }
    }

    for (const row of insertedRows) {
      const rowOfferteId = safeString((row as Record<string, unknown>).offerte_id);
      const rowId = safeString((row as Record<string, unknown>).id);
      if (!rowOfferteId || !rowId) continue;

      try {
        await syncCostReceiptImagesToQuoteBonnetjes({
          uid,
          offerteId: rowOfferteId,
          costId: rowId,
          receiptFiles,
        });
      } catch (syncError) {
        console.warn('[kosten/create] Kon bonnetjes sync niet uitvoeren:', syncError);
      }
    }

    if (pendingImportRef) {
      try {
        await pendingImportRef.update({
          status: 'linked',
          linkedCostIds: insertedCostIds,
          linkedAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (pendingError) {
        console.warn('[kosten/create] Kon openstaande factuur niet als gekoppeld te markeren:', pendingError);
      }
    }

    return NextResponse.json({
      ok: true,
      data: mapProjectCostRow(insertedRows[0]),
      rows: insertedRows.map((row) => mapProjectCostRow(row)),
      inserted_count: insertedRows.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon kost niet opslaan.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
