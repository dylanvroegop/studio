import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isMissingImportedColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return error.code === '42703' || msg.includes('imported_to_main');
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

export async function GET(request: Request) {
  try {
    const uid = await verifyFirebaseUid(request);
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Niet ingelogd.' }, { status: 401 });
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const jobsResult = await supabaseAdmin
      .from('import_jobs')
      .select('id, supplier, status, created_at')
      .eq('user_id', uid)
      .in('status', ['failed', 'completed', 'imported'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (jobsResult.error) {
      throw new Error(jobsResult.error.message || 'Kon import jobs niet ophalen.');
    }

    const jobs = Array.isArray(jobsResult.data)
      ? (jobsResult.data as Array<Record<string, unknown>>)
      : [];

    const recoverableJobs: Array<{
      import_job_id: string;
      supplier: string;
      status: string;
      created_at: string;
      pending_count: number;
    }> = [];
    let totalPending = 0;

    for (const job of jobs) {
      const jobId = normalizeString(job.id);
      if (!jobId) continue;

      let countResult = await supabaseAdmin
        .from('scraped_materials')
        .select('id', { head: true, count: 'exact' })
        .eq('user_id', uid)
        .eq('import_job_id', jobId)
        .eq('imported_to_main', false);

      if (countResult.error && isMissingImportedColumnError(countResult.error)) {
        countResult = await supabaseAdmin
          .from('scraped_materials')
          .select('id', { head: true, count: 'exact' })
          .eq('user_id', uid)
          .eq('import_job_id', jobId);
      }

      if (countResult.error) continue;
      const pendingCount = countResult.count || 0;
      if (pendingCount <= 0) continue;
      totalPending += pendingCount;
      recoverableJobs.push({
        import_job_id: jobId,
        supplier: normalizeString(job.supplier) || 'bouwmaat',
        status: normalizeString(job.status),
        created_at: normalizeString(job.created_at),
        pending_count: pendingCount,
      });
    }

    return NextResponse.json({
      ok: true,
      recoverable: recoverableJobs[0] || null,
      jobs: recoverableJobs,
      total_pending: totalPending,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon herstelbare import niet ophalen.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
