import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SupplierKey = 'bouwmaat' | 'toolstation' | 'gamma';
type PriceMode = 'excl_btw' | 'incl_btw';

type ImportCategory = {
  base_url: string;
  pages: number;
  hoofdcategorie?: string;
  subcategorie?: string;
};

type StartImportBody = {
  supplier?: unknown;
  categories?: unknown;
  price_mode?: unknown;
};

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function verifyFirebaseUid(request: Request): Promise<string | null> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) return null;
  const { auth } = initFirebaseAdmin();
  const decoded = await auth.verifyIdToken(token).catch(() => null);
  return decoded?.uid || null;
}

function parseSupplier(value: unknown): SupplierKey | null {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === 'bouwmaat' || normalized === 'toolstation' || normalized === 'gamma') {
    return normalized;
  }
  return null;
}

function parsePriceMode(value: unknown): PriceMode {
  return normalizeString(value).toLowerCase() === 'incl_btw' ? 'incl_btw' : 'excl_btw';
}

function parseCategories(value: unknown): ImportCategory[] {
  if (!Array.isArray(value)) return [];

  const parsed: ImportCategory[] = [];
  for (const raw of value) {
    const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    if (!item) continue;

    const base_url = normalizeString(item.base_url);
    if (!base_url) continue;

    const pagesRaw = Number.parseInt(String(item.pages ?? ''), 10);
    const pages = Number.isFinite(pagesRaw) && pagesRaw > 0 ? pagesRaw : 1;

    parsed.push({
      base_url,
      pages,
      hoofdcategorie: normalizeString(item.hoofdcategorie) || undefined,
      subcategorie: normalizeString(item.subcategorie) || undefined,
    });
  }
  return parsed;
}

function getScrapeWebhookTargets() {
  const testUrl =
    normalizeString(process.env.N8N_SCRAPE_WEBHOOK_TEST_URL) ||
    normalizeString(process.env.N8N_WEBHOOK_TEST_URL);
  const productionUrl =
    normalizeString(process.env.N8N_SCRAPE_WEBHOOK_URL) ||
    normalizeString(process.env.N8N_WEBHOOK_URL);

  if (!testUrl && !productionUrl) {
    throw new Error(
      'ENV ontbreekt: zet N8N_SCRAPE_WEBHOOK_TEST_URL en/of N8N_SCRAPE_WEBHOOK_URL.'
    );
  }

  // Prefer explicit var, fallback to existing project secret var.
  const secret =
    normalizeString(process.env.N8N_WEBHOOK_SECRET) ||
    normalizeString(process.env.N8N_HEADER_SECRET);

  return {
    testUrl: testUrl || null,
    productionUrl: productionUrl || null,
    secret,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hasJobActivity(params: { importJobId: string; uid: string }): Promise<boolean> {
  const { importJobId, uid } = params;

  const jobResult = await supabaseAdmin
    .from('import_jobs')
    .select('status')
    .eq('id', importJobId)
    .eq('user_id', uid)
    .maybeSingle();

  const status = normalizeString(jobResult.data?.status);
  if (status === 'scraping' || status === 'completed' || status === 'imported') {
    return true;
  }

  const scrapedResult = await supabaseAdmin
    .from('scraped_materials')
    .select('id', { head: true, count: 'exact' })
    .eq('import_job_id', importJobId)
    .eq('user_id', uid);

  return (scrapedResult.count || 0) > 0;
}

async function verifyWebhookFallback(params: {
  importJobId: string;
  uid: string;
  retries?: number;
  intervalMs?: number;
}): Promise<boolean> {
  const { importJobId, uid, retries = 4, intervalMs = 1500 } = params;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (await hasJobActivity({ importJobId, uid })) return true;
    await sleep(intervalMs);
  }
  return false;
}

export async function POST(request: Request) {
  let importJobId: string | null = null;
  let userIdForFailure: string | null = null;

  try {
    const uid = await verifyFirebaseUid(request);
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Niet ingelogd.' }, { status: 401 });
    }
    userIdForFailure = uid;

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const rawBody = (await request.json().catch(() => ({}))) as StartImportBody;
    const supplier = parseSupplier(rawBody?.supplier);
    const categories = parseCategories(rawBody?.categories);
    const price_mode = parsePriceMode(rawBody?.price_mode);

    if (!supplier) {
      return NextResponse.json(
        { ok: false, message: 'Ongeldige leverancier. Gebruik bouwmaat, toolstation of gamma.' },
        { status: 400 }
      );
    }
    if (categories.length === 0) {
      return NextResponse.json(
        { ok: false, message: 'Minimaal één geldige categorie-URL is verplicht.' },
        { status: 400 }
      );
    }

    const createJob = await supabaseAdmin
      .from('import_jobs')
      .insert({
        user_id: uid,
        supplier,
        status: 'pending',
      })
      .select('id')
      .single();

    if (createJob.error || !createJob.data?.id) {
      throw new Error(createJob.error?.message || 'Kon import job niet aanmaken.');
    }

    importJobId = String(createJob.data.id);

    const { testUrl, productionUrl, secret } = getScrapeWebhookTargets();
    const webhookPayload = {
      import_job_id: importJobId,
      user_id: uid,
      supplier,
      categories,
      price_mode,
    };
    const headers = {
      'content-type': 'application/json',
      ...(secret ? { 'x-offertehulp-secret': secret } : {}),
    };

    let webhookStarted = false;
    let lastErrorMessage = 'n8n webhook trigger mislukt.';

    const targetUrls = [testUrl, productionUrl].filter((value): value is string => Boolean(value));
    for (const targetUrl of targetUrls) {
      try {
        const webhookRes = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(webhookPayload),
        });

        const webhookJson = await webhookRes.json().catch(() => null);
        if (webhookRes.ok) {
          webhookStarted = true;
          break;
        }

        lastErrorMessage =
          webhookJson?.message ||
          webhookJson?.error ||
          `n8n webhook status ${webhookRes.status}`;
      } catch (targetError) {
        lastErrorMessage =
          targetError instanceof Error ? targetError.message : 'Onbekende n8n webhook fout.';
      }
    }

    if (!webhookStarted) {
      const fallbackStarted = await verifyWebhookFallback({
        importJobId,
        uid,
      });
      if (!fallbackStarted) {
        throw new Error(lastErrorMessage);
      }
    }

    const updateScraping = await supabaseAdmin
      .from('import_jobs')
      .update({
        status: 'scraping',
        error_message: null,
      })
      .eq('id', importJobId)
      .eq('user_id', uid);

    if (updateScraping.error) {
      throw new Error(updateScraping.error.message || 'Kon jobstatus niet updaten naar scraping.');
    }

    return NextResponse.json({
      ok: true,
      import_job_id: importJobId,
      status: 'started',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Starten van supplier import mislukt.';

    if (importJobId && userIdForFailure) {
      await supabaseAdmin
        .from('import_jobs')
        .update({
          status: 'failed',
          error_message: message.slice(0, 1200),
          completed_at: new Date().toISOString(),
        })
        .eq('id', importJobId)
        .eq('user_id', userIdForFailure);
    }

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
