import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { deriveBankUserId } from '@/lib/bank-user-id';
import {
  buildFinanceBankLedger,
  loadConnectedKnabTransactions,
} from '@/lib/finance-bank-ledger';
import { mapProjectCostRow, normalizeProjectCostCategory, roundEuro } from '@/lib/project-costs';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}

async function resolveOwnedQuoteId(uid: string, reference: string): Promise<string | null> {
  if (!reference) return null;

  const { firestore } = initFirebaseAdmin();
  const direct = await firestore.collection('quotes').doc(reference).get();
  if (direct.exists && safeString(direct.data()?.userId) === uid) return direct.id;

  const number = Number(reference.match(/\d{2,}/)?.[0] || '');
  if (!Number.isFinite(number)) return null;

  for (const candidate of [number, String(number)]) {
    const snapshot = await firestore
      .collection('quotes')
      .where('userId', '==', uid)
      .where('offerteNummer', '==', candidate)
      .limit(1)
      .get();
    if (!snapshot.empty) return snapshot.docs[0].id;
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid || '';
    if (!uid) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const bankTransactionId = safeString(body?.bank_transaction_id);
    if (!bankTransactionId) {
      return NextResponse.json({ ok: false, message: 'Banktransactie ontbreekt.' }, { status: 400 });
    }

    const requestedQuoteReference = safeString(body?.offerte_id);
    const offerteId = await resolveOwnedQuoteId(uid, requestedQuoteReference);
    if (requestedQuoteReference && !offerteId) {
      return NextResponse.json({ ok: false, message: 'Offerte niet gevonden voor deze gebruiker.' }, { status: 404 });
    }

    const [transactions, costsResult, overridesResult] = await Promise.all([
      loadConnectedKnabTransactions(deriveBankUserId(uid)),
      supabaseAdmin.from('project_costs').select('*').eq('user_id', uid),
      supabaseAdmin
        .from('bank_transaction_category_overrides')
        .select('bank_transaction_id,category')
        .eq('user_id', uid),
    ]);
    if (costsResult.error) throw new Error(`Kosten konden niet worden geladen: ${costsResult.error.message}`);
    if (overridesResult.error) throw new Error(`Categorieën konden niet worden geladen: ${overridesResult.error.message}`);

    const transaction = transactions.find((item) => item.id === bankTransactionId);
    if (!transaction) {
      return NextResponse.json({ ok: false, message: 'Banktransactie niet gevonden.' }, { status: 404 });
    }
    if (safeNumber(transaction.amount) >= 0) {
      return NextResponse.json({ ok: false, message: 'Alleen uitgaande banktransacties kunnen aan een klant worden gekoppeld.' }, { status: 400 });
    }

    const costs = (costsResult.data || []).map((row) => mapProjectCostRow(row));
    const categoryOverrides = new Map(
      (overridesResult.data || []).map((row) => [
        String(row.bank_transaction_id),
        normalizeProjectCostCategory(row.category),
      ])
    );
    const ledgerRow = buildFinanceBankLedger({
      userId: uid,
      transactions: [transaction],
      costs,
      categoryOverrides,
    })[0];

    if (!ledgerRow) {
      return NextResponse.json({ ok: false, message: 'Deze banktransactie kan niet als zakelijke kost worden gekoppeld.' }, { status: 400 });
    }

    const sourceCostIds = ledgerRow.source_cost_ids;
    let createdSourceCostId: string | null = null;
    if (sourceCostIds.length > 0) {
      const update = await supabaseAdmin
        .from('project_costs')
        .update({ offerte_id: offerteId, updated_at: new Date().toISOString() })
        .eq('user_id', uid)
        .in('id', sourceCostIds);
      if (update.error) throw new Error(`Klantkoppeling kon niet worden opgeslagen: ${update.error.message}`);
    } else if (offerteId) {
      const amount = roundEuro(Math.abs(safeNumber(transaction.amount)));
      const date = safeString(transaction.booking_date).slice(0, 10) || new Date().toISOString().slice(0, 10);
      const category = categoryOverrides.get(transaction.id) || ledgerRow.category;
      const insert = await supabaseAdmin
        .from('project_costs')
        .insert({
          user_id: uid,
          offerte_id: offerteId,
          category,
          supplier_name: ledgerRow.supplier_name,
          description: `${ledgerRow.description} (bankafschrijving)`,
          line_items: [],
          amount_excl_btw: amount,
          btw_percentage: 0,
          btw_amount: 0,
          amount_incl_btw: amount,
          date,
          receipt_url: null,
          receipt_files: [],
          status: 'bank_transaction',
          payment_type: 'unknown',
          payment_status: 'paid',
          due_date: null,
          supplier_order_number: `bank-${transaction.id}`,
          supplier_invoice_number: null,
          reconciliation_group_id: null,
          reconciliation_status: 'matched',
          paid_bank_transaction_id: transaction.id,
          paid_at: date,
          source_email: null,
          source_filename: null,
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (insert.error || !insert.data?.id) {
        throw new Error(insert.error?.message || 'Bankkost kon niet worden aangemaakt.');
      }
      createdSourceCostId = String(insert.data.id);
    }

    return NextResponse.json({
      ok: true,
      data: {
        bank_transaction_id: transaction.id,
        offerte_id: offerteId,
        source_cost_ids: sourceCostIds.length > 0 ? sourceCostIds : createdSourceCostId ? [createdSourceCostId] : [],
        created_source_cost: Boolean(createdSourceCostId),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Klantkoppeling kon niet worden opgeslagen.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
