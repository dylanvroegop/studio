import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { fetchLaborCostsByQuoteId } from '@/lib/labor-costs';
import { normalizeProjectCostCategory } from '@/lib/project-costs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  buildWinstMetrics,
  extractQuoteCostFromExtras,
  type WinstCalculationSource,
  type WinstInvoiceSource,
  type WinstLaborCostSource,
  type WinstMetricsFiltersInput,
  type WinstNacalculatieSource,
  type WinstPaymentSource,
  type WinstProjectCostSource,
  type WinstQuoteSource,
} from '@/lib/winst-metrics-v2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null) {
    const row = value as { toDate?: () => Date; seconds?: number };
    if (typeof row.toDate === 'function') {
      try {
        return row.toDate();
      } catch {
        return null;
      }
    }
    if (typeof row.seconds === 'number') return new Date(row.seconds * 1000);
  }
  return null;
}

function normalizeClientName(source: unknown): string {
  if (!source || typeof source !== 'object') return 'Onbekende klant';
  const row = source as Record<string, unknown>;
  const bedrijfsnaam = safeString(row.bedrijfsnaam);
  if (bedrijfsnaam) return bedrijfsnaam;
  const voornaam = safeString(row.voornaam);
  const achternaam = safeString(row.achternaam);
  const fullName = `${voornaam} ${achternaam}`.trim();
  return fullName || 'Onbekende klant';
}

function normalizeClientId(rawClientName: string): string {
  const clean = rawClientName.toLowerCase().replace(/\s+/g, ' ').trim();
  return clean || 'onbekend';
}

function extractJobTypes(quoteData: Record<string, unknown>): string[] {
  const klussen = quoteData.klussen;
  if (!klussen || typeof klussen !== 'object') return [];
  const types = new Set<string>();

  Object.values(klussen as Record<string, unknown>).forEach((job) => {
    if (!job || typeof job !== 'object') return;
    const row = job as Record<string, unknown>;
    const maatwerk = row.maatwerk && typeof row.maatwerk === 'object' ? (row.maatwerk as Record<string, unknown>) : null;
    const meta = maatwerk?.meta && typeof maatwerk.meta === 'object' ? (maatwerk.meta as Record<string, unknown>) : null;
    const materialen = row.materialen && typeof row.materialen === 'object' ? (row.materialen as Record<string, unknown>) : null;

    const fromMetaTitle = safeString(meta?.title);
    const fromMetaSlug = safeString(meta?.slug);
    const fromMaterialJobKey = safeString(materialen?.jobKey);
    const fromKlusType = safeString(row.type);

    const value = fromMetaTitle || fromMetaSlug || fromMaterialJobKey || fromKlusType;
    if (value) types.add(value);
  });

  return Array.from(types);
}

function extractQuoteIdsFromInvoice(invoiceData: Record<string, unknown>): string[] {
  const ids = new Set<string>();

  const directQuoteId = safeString(invoiceData.quoteId);
  if (directQuoteId) ids.add(directQuoteId);

  const combinedQuoteIds = Array.isArray(invoiceData.combinedQuoteIds) ? invoiceData.combinedQuoteIds : [];
  combinedQuoteIds.forEach((id) => {
    const normalized = safeString(id);
    if (normalized) ids.add(normalized);
  });

  const context = invoiceData.combinedContext;
  if (context && typeof context === 'object') {
    const contextQuoteIds = Array.isArray((context as { quoteIds?: unknown[] }).quoteIds)
      ? ((context as { quoteIds?: unknown[] }).quoteIds as unknown[])
      : [];
    contextQuoteIds.forEach((id) => {
      const normalized = safeString(id);
      if (normalized) ids.add(normalized);
    });
  }

  return Array.from(ids);
}

function parseFilters(body: unknown): WinstMetricsFiltersInput {
  if (!body || typeof body !== 'object') return {};
  const source = body as Record<string, unknown>;
  return {
    periodType: source.periodType === 'week' ? 'week' : 'month',
    periodRange: safeNumber(source.periodRange),
    jobTypes: Array.isArray(source.jobTypes) ? source.jobTypes.map((item) => String(item)) : [],
    clientIds: Array.isArray(source.clientIds) ? source.clientIds.map((item) => String(item)) : [],
    projectIds: Array.isArray(source.projectIds) ? source.projectIds.map((item) => String(item)) : [],
  };
}

function parseVatFilingPeriodMonths(raw: unknown): 1 | 3 {
  const normalized = safeString(raw).toLowerCase();
  if (normalized === 'maand' || normalized === 'monthly' || normalized === '1') return 1;
  return 3;
}

function parseVatPeriodStartMonth(raw: unknown): number {
  const parsed = Math.round(safeNumber(raw));
  if (parsed < 1 || parsed > 12) return 1;
  return parsed;
}

function chunkArray<T>(input: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < input.length; index += size) {
    output.push(input.slice(index, index + size));
  }
  return output;
}

function invoiceStatusImpliesPaid(status: unknown): boolean {
  const normalized = safeString(status).toLowerCase();
  return normalized === 'gedeeltelijk_betaald' || normalized === 'betaald';
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

async function fetchProjectCosts(uid: string, quoteIds: string[]): Promise<WinstProjectCostSource[]> {
  if (quoteIds.length === 0) return [];

  const output: WinstProjectCostSource[] = [];
  const chunks = chunkArray(quoteIds, 100);

  for (const chunk of chunks) {
    const { data, error } = await supabaseAdmin
      .from('project_costs')
      .select('offerte_id, category, amount_excl_btw, amount_incl_btw')
      .eq('user_id', uid)
      .in('offerte_id', chunk);

    if (error) {
      if (isProjectCostsSchemaMismatchError(error.message)) {
        throw new Error(
          'Database migratie ontbreekt: voer staging_sql/20260402_repair_project_costs_schema.sql uit.'
        );
      }
      if (isMissingRelationError(error.message)) return [];
      throw new Error(`Kon projectkosten niet laden: ${error.message}`);
    }

    if (!Array.isArray(data)) continue;
    data.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      const mapped = row as Record<string, unknown>;
      const quoteId = safeString(mapped.offerte_id);
      if (!quoteId) return;
      output.push({
        quoteId,
        category: normalizeProjectCostCategory(mapped.category),
        amountExcl: safeNumber(mapped.amount_excl_btw),
        amountIncl: safeNumber(mapped.amount_incl_btw),
      });
    });
  }

  return output;
}

async function fetchCalculations(uid: string, quoteIds: string[]): Promise<WinstCalculationSource[]> {
  if (quoteIds.length === 0) return [];

  const rows: Array<{ quoteid?: string; data_json?: unknown; status?: string; created_at?: string }> = [];
  const chunks = chunkArray(quoteIds, 100);

  for (const chunk of chunks) {
    const { data, error } = await supabaseAdmin
      .from('quotes_collection')
      .select('quoteid, data_json, status, created_at')
      .eq('gebruikerid', uid)
      .in('quoteid', chunk)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Kon calculaties niet laden: ${error.message}`);
    }
    if (Array.isArray(data)) {
      data.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const row = item as Record<string, unknown>;
        rows.push({
          quoteid: safeString(row.quoteid) || undefined,
          data_json: row.data_json,
          status: safeString(row.status) || undefined,
          created_at: safeString(row.created_at) || undefined,
        });
      });
    }
  }

  const latestByQuote = new Map<string, WinstCalculationSource>();
  const bestByQuote = new Map<string, WinstCalculationSource>();

  rows.forEach((row) => {
    const quoteId = safeString(row.quoteid);
    if (!quoteId || row.data_json == null) return;

    const mapped: WinstCalculationSource = {
      quoteId,
      dataJson: row.data_json,
    };

    if (!latestByQuote.has(quoteId)) latestByQuote.set(quoteId, mapped);
    if (safeString(row.status) === 'completed' && !bestByQuote.has(quoteId)) {
      bestByQuote.set(quoteId, mapped);
    }
  });

  return quoteIds
    .map((quoteId) => bestByQuote.get(quoteId) || latestByQuote.get(quoteId))
    .filter((row): row is WinstCalculationSource => !!row);
}

async function fetchNacalculaties(
  quoteDocs: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]
): Promise<WinstNacalculatieSource[]> {
  if (quoteDocs.length === 0) return [];
  const entries = quoteDocs.map((docSnap) => ({
    quoteId: docSnap.id,
    ref: docSnap.ref.collection('nacalculatie').doc('main'),
  }));
  const batches = chunkArray(entries, 200);
  const output: WinstNacalculatieSource[] = [];

  for (const batch of batches) {
    const snaps = await quoteDocs[0].ref.firestore.getAll(...batch.map((item) => item.ref));
    snaps.forEach((snap, index) => {
      const quoteId = batch[index]?.quoteId || safeString(snap.get('quoteId'));
      if (!quoteId) return;
      output.push({
        quoteId,
        data: snap.exists ? snap.data() ?? null : null,
      });
    });
  }

  return output;
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(tokenMatch[1].trim());
    const uid = decoded.uid;
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const filters = parseFilters(await req.json().catch(() => ({})));

    const [quoteSnapshot, invoiceSnapshot, userSnapshot] = await Promise.all([
      firestore.collection('quotes').where('userId', '==', uid).get(),
      firestore.collection('invoices').where('userId', '==', uid).get(),
      firestore.collection('users').doc(uid).get(),
    ]);
    const userSettings = userSnapshot.exists ? (userSnapshot.data()?.settings ?? {}) : {};
    const vatFilingPeriodMonths = parseVatFilingPeriodMonths((userSettings as Record<string, unknown>)?.omzetBelastingAangiftePeriode);
    const vatPeriodStartMonth = parseVatPeriodStartMonth((userSettings as Record<string, unknown>)?.omzetBelastingStartMaand);

    const quotes: WinstQuoteSource[] = quoteSnapshot.docs
      .filter((docSnap) => {
        const data = docSnap.data();
        const rawStatus = safeString(data.status).toLowerCase();
        return data.archived !== true;
      })
      .map((docSnap) => {
        const data = docSnap.data();
        const clientName = normalizeClientName(data.klantinformatie);
        const extraCosts = extractQuoteCostFromExtras(data.extras);
        const title =
          safeString(data.titel) ||
          safeString(data.title) ||
          safeString(data.werkomschrijving) ||
          `Project ${safeString(data.offerteNummer) || docSnap.id.slice(0, 8)}`;

        return {
          id: docSnap.id,
          offerteNummer: Number.isFinite(Number(data.offerteNummer)) ? Number(data.offerteNummer) : null,
          title,
          clientId: normalizeClientId(clientName),
          clientName,
          status: safeString(data.status) || undefined,
          createdAt: parseDate(data.createdAt),
          updatedAt: parseDate(data.updatedAt),
          quotedRevenueIncl: safeNumber(data.totaalbedrag) || safeNumber(data.amount),
          jobTypes: extractJobTypes(data),
          quotedMaterieelExcl: extraCosts.materieel,
          quotedOverheadExcl: extraCosts.overhead,
        } satisfies WinstQuoteSource;
      });

    const quoteIds = quotes.map((quote) => quote.id);
    const quoteIdsSet = new Set(quoteIds);

    const invoices: WinstInvoiceSource[] = invoiceSnapshot.docs
      .map((docSnap) => {
        const data = docSnap.data();
        const quoteIdsForInvoice = extractQuoteIdsFromInvoice(data).filter((quoteId) => quoteIdsSet.has(quoteId));
        return {
          id: docSnap.id,
          quoteIds: quoteIdsForInvoice,
          status: safeString(data.status) || undefined,
          invoiceType: safeString(data.invoiceType) || undefined,
          createdAt:
            parseDate(data.createdAt) ||
            parseDate(data.issueDate) ||
            parseDate(data.updatedAt) ||
            parseDate(docSnap.createTime),
          dueDate: parseDate(data.dueDate),
          totalIncl: safeNumber((data.totalsSnapshot as { totaalInclBtw?: unknown } | undefined)?.totaalInclBtw),
          paidAmount: safeNumber((data.paymentSummary as { paidAmount?: unknown } | undefined)?.paidAmount),
          openAmount: safeNumber((data.paymentSummary as { openAmount?: unknown } | undefined)?.openAmount),
        } satisfies WinstInvoiceSource;
      })
      .filter((invoice) => invoice.quoteIds.length > 0);

    const payments: WinstPaymentSource[] = [];
    await Promise.all(
      invoiceSnapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const quoteIdsForInvoice = extractQuoteIdsFromInvoice(data).filter((quoteId) => quoteIdsSet.has(quoteId));
        if (quoteIdsForInvoice.length === 0) return;

        const paymentSnapshot = await docSnap.ref.collection('payments').get();
        let totalFromDocs = 0;
        paymentSnapshot.docs.forEach((paymentDoc) => {
          const paymentData = paymentDoc.data();
          const amount = Math.max(0, safeNumber(paymentData.amount));
          const date =
            parseDate(paymentData.date) ||
            parseDate(paymentData.createdAt) ||
            parseDate(data.updatedAt) ||
            parseDate(docSnap.createTime) ||
            new Date();
          totalFromDocs += amount;
          payments.push({
            invoiceId: docSnap.id,
            amount,
            date,
          });
        });

        const paidAmount = Math.max(0, safeNumber((data.paymentSummary as { paidAmount?: unknown } | undefined)?.paidAmount));
        const totalIncl = Math.max(0, safeNumber((data.totalsSnapshot as { totaalInclBtw?: unknown } | undefined)?.totaalInclBtw));
        const openAmount = Math.max(0, safeNumber((data.paymentSummary as { openAmount?: unknown } | undefined)?.openAmount));
        const missingPaidAmount = paidAmount - totalFromDocs;
        const hasRealPaymentSignal = paidAmount > 0 && (totalIncl <= 0 || openAmount < totalIncl - 0.0001);
        const allowSummaryFallback = invoiceStatusImpliesPaid(data.status) || hasRealPaymentSignal;
        if (allowSummaryFallback && missingPaidAmount > 0.0001) {
          payments.push({
            invoiceId: docSnap.id,
            amount: missingPaidAmount,
            date:
              parseDate(data.paidAt) ||
              parseDate((data.paymentSummary as { lastPaymentAt?: unknown } | undefined)?.lastPaymentAt) ||
              parseDate(data.updatedAt) ||
              parseDate(docSnap.updateTime) ||
              parseDate(docSnap.createTime) ||
              new Date(),
          });
        }
      })
    );

    const [calculations, nacalculaties, projectCosts, laborByQuote] = await Promise.all([
      fetchCalculations(uid, quoteIds),
      fetchNacalculaties(quoteSnapshot.docs),
      fetchProjectCosts(uid, quoteIds),
      fetchLaborCostsByQuoteId({ uid, quoteIds }),
    ]);

    const laborCosts: WinstLaborCostSource[] = Array.from(laborByQuote.entries()).map(([quoteId, bucket]) => ({
      quoteId,
      costExcl: safeNumber(bucket.costExcl),
      hours: safeNumber(bucket.hours),
      days: safeNumber(bucket.days),
    }));

    const metrics = buildWinstMetrics({
      filters,
      quotes,
      calculations,
      invoices,
      payments,
      nacalculaties,
      projectCosts,
      laborCosts,
      vatFilingPeriodMonths,
      vatPeriodStartMonth,
      userId: uid,
    });

    return NextResponse.json({ ok: true, data: metrics });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
