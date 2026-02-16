import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ParsedBody = {
  quoteId: string | null;
  quoteIds: string[];
  status: string | null;
  latestOnly: boolean;
};

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const raw of value) {
    const normalized = normalizeString(raw);
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique);
}

function parseBody(body: unknown): ParsedBody | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

  const row = body as Record<string, unknown>;
  const quoteId = normalizeString(row.quoteId);
  const quoteIds = normalizeStringArray(row.quoteIds);
  const status = normalizeString(row.status);
  const latestOnly = row.latestOnly === true;

  return { quoteId, quoteIds, status, latestOnly };
}

function unauthorized() {
  return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) return unauthorized();

    const token = match[1].trim();
    const { auth } = initFirebaseAdmin();

    let uid = '';
    try {
      const decoded = await auth.verifyIdToken(token);
      uid = decoded.uid || '';
    } catch {
      return unauthorized();
    }

    if (!uid) return unauthorized();

    const rawBody = await req.json().catch(() => null);
    const parsed = parseBody(rawBody);
    if (!parsed) {
      return NextResponse.json(
        { ok: false, message: 'Body moet een geldig JSON-object zijn.' },
        { status: 400 }
      );
    }

    const { quoteId, quoteIds, status, latestOnly } = parsed;
    if (!quoteId && quoteIds.length === 0) {
      return NextResponse.json(
        { ok: false, message: 'Geef quoteId of quoteIds mee.' },
        { status: 400 }
      );
    }

    if (quoteIds.length > 100) {
      return NextResponse.json(
        { ok: false, message: 'Maximaal 100 quoteIds per request.' },
        { status: 400 }
      );
    }

    let query = supabaseAdmin
      .from('quotes_collection')
      .select('id, quoteid, gebruikerid, status, data_json, created_at')
      .eq('gebruikerid', uid);

    if (quoteId) {
      query = query.eq('quoteid', quoteId);
    } else {
      query = query.in('quoteid', quoteIds);
    }

    if (status) {
      query = query.eq('status', status);
    }

    query = query.order('created_at', { ascending: false });

    if (latestOnly && quoteId) {
      const { data, error } = await query.limit(1).maybeSingle();
      if (error) {
        return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, row: data || null });
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, rows: data || [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
