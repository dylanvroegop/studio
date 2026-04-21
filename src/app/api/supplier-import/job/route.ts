import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SupplierKey = 'bouwmaat' | 'toolstation' | 'gamma';
const ACTIVE_JOB_HARD_STALE_AFTER_MS = 45 * 60 * 1000;
const ACTIVE_JOB_NO_PROGRESS_STALE_AFTER_MS = 20 * 60 * 1000;

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

function normalizeSupplier(value: string): SupplierKey | null {
  const normalized = value.toLowerCase();
  if (normalized === 'bouwmaat' || normalized === 'toolstation' || normalized === 'gamma') {
    return normalized;
  }
  return null;
}

function toTimestamp(value: unknown): number | null {
  const raw = normalizeString(value);
  if (!raw) return null;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : null;
}

function isMissingImportedColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return error.code === '42703' || msg.includes('imported_to_main');
}

export async function GET(request: Request) {
  try {
    const uid = await verifyFirebaseUid(request);
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Niet ingelogd.' }, { status: 401 });
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const { searchParams } = new URL(request.url);
    const importJobId = normalizeString(searchParams.get('import_job_id'));
    const active = normalizeString(searchParams.get('active')) === '1';
    const supplierParam = normalizeString(searchParams.get('supplier'));
    const supplier = supplierParam ? normalizeSupplier(supplierParam) : null;

    if (!importJobId && !active) {
      return NextResponse.json(
        { ok: false, message: 'Gebruik import_job_id of active=1.' },
        { status: 400 }
      );
    }

    if (active) {
      let activeJobsQuery = supabaseAdmin
        .from('import_jobs')
        .select('*')
        .eq('user_id', uid)
        .in('status', ['pending', 'scraping', 'importing']);

      if (supplier) activeJobsQuery = activeJobsQuery.eq('supplier', supplier);
      activeJobsQuery = activeJobsQuery.order('created_at', { ascending: false }).limit(25);

      const activeJobsResult = await activeJobsQuery;
      if (activeJobsResult.error) {
        throw new Error(activeJobsResult.error.message || 'Kon actieve import jobs niet ophalen.');
      }

      const activeJobsRaw = Array.isArray(activeJobsResult.data)
        ? (activeJobsResult.data as Array<Record<string, unknown>>)
        : [];
      const now = Date.now();
      const preparedActiveJobs = await Promise.all(
        activeJobsRaw.map(async (job) => {
          const jobId = normalizeString(job.id);
          const createdTs = toTimestamp(job.created_at);
          const ageMs = createdTs == null ? null : now - createdTs;
          if (!jobId) {
            return {
              job,
              jobId,
              ageMs,
              scrapedCount: 0,
              sampleUrl: '',
            };
          }

          const [sampleRow, countRow] = await Promise.all([
            supabaseAdmin
              .from('scraped_materials')
              .select('product_url')
              .eq('user_id', uid)
              .eq('import_job_id', jobId)
              .eq('imported_to_main', false)
              .order('created_at', { ascending: true })
              .limit(1)
              .maybeSingle(),
            supabaseAdmin
              .from('scraped_materials')
              .select('id', { head: true, count: 'exact' })
              .eq('user_id', uid)
              .eq('import_job_id', jobId)
              .eq('imported_to_main', false),
          ]);

          const sampleUrl =
            !sampleRow.error && sampleRow.data
              ? normalizeString((sampleRow.data as Record<string, unknown>).product_url)
              : '';
          let scrapedCount = !countRow.error ? countRow.count || 0 : 0;

          // Backward compatibility before imported_to_main migration.
          if (
            (sampleRow.error && isMissingImportedColumnError(sampleRow.error)) ||
            (countRow.error && isMissingImportedColumnError(countRow.error))
          ) {
            const [legacySampleRow, legacyCountRow] = await Promise.all([
              supabaseAdmin
                .from('scraped_materials')
                .select('product_url')
                .eq('user_id', uid)
                .eq('import_job_id', jobId)
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle(),
              supabaseAdmin
                .from('scraped_materials')
                .select('id', { head: true, count: 'exact' })
                .eq('user_id', uid)
                .eq('import_job_id', jobId),
            ]);
            scrapedCount = !legacyCountRow.error ? legacyCountRow.count || 0 : 0;
            return {
              job,
              jobId,
              ageMs,
              scrapedCount,
              sampleUrl:
                !legacySampleRow.error && legacySampleRow.data
                  ? normalizeString((legacySampleRow.data as Record<string, unknown>).product_url)
                  : '',
            };
          }

          return {
            job,
            jobId,
            ageMs,
            scrapedCount,
            sampleUrl,
          };
        })
      );

      const staleJobIds = preparedActiveJobs
        .filter((entry) => {
          if (!entry.jobId || entry.ageMs == null) return false;
          if (entry.ageMs > ACTIVE_JOB_HARD_STALE_AFTER_MS) return true;
          if (entry.ageMs > ACTIVE_JOB_NO_PROGRESS_STALE_AFTER_MS && entry.scrapedCount === 0) {
            return true;
          }
          return false;
        })
        .map((entry) => entry.jobId);

      if (staleJobIds.length > 0) {
        await supabaseAdmin
          .from('import_jobs')
          .update({
            status: 'failed',
            error_message: 'Automatisch afgesloten: te lang actief zonder voortgang.',
            completed_at: new Date().toISOString(),
          })
          .eq('user_id', uid)
          .in('id', staleJobIds);
      }

      const activeJobsLimited = preparedActiveJobs
        .filter((entry) => entry.jobId && !staleJobIds.includes(entry.jobId))
        .slice(0, 5);
      const newestJob = activeJobsLimited[0]?.job || null;
      if (!newestJob) {
        return NextResponse.json({ ok: true, job: null, materials: [], active_jobs: [] });
      }

      const newestJobId = normalizeString(newestJob.id);
      const materialsResult = await supabaseAdmin
        .from('scraped_materials')
        .select('*')
        .eq('user_id', uid)
        .eq('import_job_id', newestJobId)
        .eq('imported_to_main', false)
        .order('created_at', { ascending: true });
      let materials = Array.isArray(materialsResult.data) ? materialsResult.data : [];
      if (materialsResult.error && isMissingImportedColumnError(materialsResult.error)) {
        const legacyMaterials = await supabaseAdmin
          .from('scraped_materials')
          .select('*')
          .eq('user_id', uid)
          .eq('import_job_id', newestJobId)
          .order('created_at', { ascending: true });
        if (legacyMaterials.error) {
          throw new Error(legacyMaterials.error.message || 'Kon scraped materials niet ophalen.');
        }
        materials = Array.isArray(legacyMaterials.data) ? legacyMaterials.data : [];
      } else if (materialsResult.error) {
        throw new Error(materialsResult.error.message || 'Kon scraped materials niet ophalen.');
      }
      const activeJobsWithLinks = activeJobsLimited.map((entry) => ({
        ...entry.job,
        sample_url: entry.sampleUrl || null,
      }));

      return NextResponse.json({
        ok: true,
        job: newestJob,
        materials,
        active_jobs: activeJobsWithLinks,
      });
    }

    const jobResult = await supabaseAdmin
      .from('import_jobs')
      .select('*')
      .eq('user_id', uid)
      .eq('id', importJobId)
      .maybeSingle();

    if (jobResult.error) {
      throw new Error(jobResult.error.message || 'Kon import job niet ophalen.');
    }
    if (!jobResult.data) {
      return NextResponse.json({ ok: true, job: null, materials: [] });
    }

    const job = jobResult.data as Record<string, unknown>;
    const jobId = normalizeString(job.id);

    const materialsResult = await supabaseAdmin
      .from('scraped_materials')
      .select('*')
      .eq('user_id', uid)
      .eq('import_job_id', jobId)
      .eq('imported_to_main', false)
      .order('created_at', { ascending: true });

    let materials = Array.isArray(materialsResult.data) ? materialsResult.data : [];
    if (materialsResult.error && isMissingImportedColumnError(materialsResult.error)) {
      const legacyMaterials = await supabaseAdmin
        .from('scraped_materials')
        .select('*')
        .eq('user_id', uid)
        .eq('import_job_id', jobId)
        .order('created_at', { ascending: true });
      if (legacyMaterials.error) {
        throw new Error(legacyMaterials.error.message || 'Kon scraped materials niet ophalen.');
      }
      materials = Array.isArray(legacyMaterials.data) ? legacyMaterials.data : [];
    } else if (materialsResult.error) {
      throw new Error(materialsResult.error.message || 'Kon scraped materials niet ophalen.');
    }
    return NextResponse.json({
      ok: true,
      job,
      materials,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Job ophalen mislukt.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
