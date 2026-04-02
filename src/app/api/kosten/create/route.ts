import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { fetchLaborCostsByQuoteId } from '@/lib/labor-costs';
import {
  mapProjectCostRow,
  normalizeProjectCostCategory,
  normalizeProjectCostLineItems,
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

function isMissingRelationError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('does not exist')
    || lower.includes('relation')
    || lower.includes('not found')
  );
}

function isMissingUserIdColumnError(message: string): boolean {
  return message.toLowerCase().includes('column project_costs.user_id does not exist');
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
    if (isMissingUserIdColumnError(costsError.message)) return;
    if (isMissingRelationError(costsError.message)) return;
    throw new Error(costsError.message);
  }

  const totals = {
    materiaal: 0,
    brandstof: 0,
    gereedschap: 0,
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
  const totalFuelCost = roundEuro(totals.brandstof);
  const totalToolCost = roundEuro(totals.gereedschap);
  const totalOtherCost = roundEuro(totals.overig);
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

    const supplierName = safeString(input.supplier_name);
    if (!supplierName) {
      return NextResponse.json({ ok: false, message: 'Leverancier is verplicht.' }, { status: 400 });
    }

    const category = normalizeProjectCostCategory(input.category);
    const description = safeString(input.description) || supplierName;
    const offerteId = safeString(input.offerte_id) || null;
    if (offerteId) {
      await validateQuoteOwnership({ offerteId, uid });
    }

    const lineItems = normalizeProjectCostLineItems(input.line_items);
    const lineItemsTotal = sumProjectCostLineItems(lineItems);
    const requestedAmountExcl = roundEuro(safeNumber(input.amount_excl_btw));
    const manualOverride = input.manual_amount_override === true;

    const amountExcl = roundEuro(
      manualOverride
        ? requestedAmountExcl
        : (lineItemsTotal > 0 ? lineItemsTotal : requestedAmountExcl)
    );
    if (amountExcl <= 0) {
      return NextResponse.json({ ok: false, message: 'Bedrag excl. BTW moet groter dan 0 zijn.' }, { status: 400 });
    }

    const btwPercentage = roundEuro(safeNumber(input.btw_percentage) || 21);
    const btwAmount = roundEuro((amountExcl * btwPercentage) / 100);
    const amountIncl = roundEuro(amountExcl + btwAmount);
    const date = dateOnly(input.date);
    const receiptUrl = safeString(input.receipt_url) || null;
    const status = safeString(input.status) || 'confirmed';

    const { data, error } = await supabaseAdmin
      .from('project_costs')
      .insert({
        user_id: uid,
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
        status,
      })
      .select('*')
      .single();

    if (error) {
      if (isMissingUserIdColumnError(error.message)) {
        return NextResponse.json(
          {
            ok: false,
            message:
              'Database migratie ontbreekt: voer staging_sql/20260402_add_user_id_to_existing_project_costs.sql uit.',
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    if (offerteId) {
      try {
        await upsertProfitOverview({ uid, offerteId });
      } catch (overviewError) {
        console.warn('[kosten/create] Kon profit_overview niet bijwerken:', overviewError);
      }
    }

    return NextResponse.json({
      ok: true,
      data: mapProjectCostRow(data),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon kost niet opslaan.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
