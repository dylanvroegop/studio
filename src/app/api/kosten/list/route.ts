import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { mapProjectCostRow } from '@/lib/project-costs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function noStoreHeaders(): HeadersInit {
  return {
    'Cache-Control': 'no-store',
  };
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

async function fetchProjectCostsViaRest(uid: string): Promise<unknown[]> {
  const supabaseUrl = safeString(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceKey = safeString(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  const url = new URL('/rest/v1/project_costs', supabaseUrl);
  url.searchParams.set('select', '*');
  url.searchParams.set('user_id', `eq.${uid}`);
  url.searchParams.append('order', 'date.desc');
  url.searchParams.append('order', 'created_at.desc');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Cache-Control': 'no-store',
    },
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = safeString(
      (payload as { message?: unknown; error?: unknown } | null)?.message
      || (payload as { error?: unknown } | null)?.error
    );
    throw new Error(message || `Supabase REST HTTP ${response.status}`);
  }

  if (!Array.isArray(payload)) {
    throw new Error('Supabase REST gaf geen geldige array terug.');
  }

  return payload;
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function isProjectCostsSchemaMismatchError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('project_costs.') && lower.includes('does not exist');
}

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json(
        { ok: false, message: 'Unauthorized' },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid || '';
    if (!uid) {
      return NextResponse.json(
        { ok: false, message: 'Unauthorized' },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const rows = await fetchProjectCostsViaRest(uid);
    const mappedRows = rows.map((row) => mapProjectCostRow(row));
    if (process.env.NODE_ENV !== 'production') {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      console.log(
        '[kosten/list]',
        JSON.stringify({
          uid,
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
          serviceKeyPrefix: serviceKey ? serviceKey.slice(0, 14) : null,
          source: 'rest',
          rowCount: mappedRows.length,
          rowIds: mappedRows.map((row) => row.id),
        })
      );
    }
    return NextResponse.json({ ok: true, data: mappedRows }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon kosten niet laden.';
    return NextResponse.json(
      { ok: false, message },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}
