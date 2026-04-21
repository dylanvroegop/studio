import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SupplierKey = 'bouwmaat' | 'toolstation' | 'gamma';

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

    let jobQuery = supabaseAdmin
      .from('import_jobs')
      .select('*')
      .eq('user_id', uid);

    if (importJobId) {
      jobQuery = jobQuery.eq('id', importJobId);
    } else if (active) {
      jobQuery = jobQuery.in('status', ['pending', 'scraping']);
      if (supplier) jobQuery = jobQuery.eq('supplier', supplier);
      jobQuery = jobQuery.order('created_at', { ascending: false }).limit(1);
    } else {
      return NextResponse.json(
        { ok: false, message: 'Gebruik import_job_id of active=1.' },
        { status: 400 }
      );
    }

    const jobResult = await jobQuery.maybeSingle();
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
      .order('created_at', { ascending: true });

    if (materialsResult.error) {
      throw new Error(materialsResult.error.message || 'Kon scraped materials niet ophalen.');
    }

    const materials = Array.isArray(materialsResult.data) ? materialsResult.data : [];
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

