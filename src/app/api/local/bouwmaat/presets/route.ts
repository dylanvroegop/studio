import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StoredPresetRow = {
  id: string;
  name: string;
  links: unknown;
  supplier_key: string | null;
  price_mode: string | null;
  max_pages_per_url: number | null;
  ai_audit_enabled: boolean | null;
  updated_at: string | null;
};

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

async function verifyUser(request: Request): Promise<string | null> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) return null;
  const { auth } = initFirebaseAdmin();
  const decoded = await auth.verifyIdToken(token).catch(() => null);
  return decoded?.uid || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLinks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => (item as string).trim())
    .filter(Boolean);
}

function parseBody(raw: unknown): {
  id: string;
  name: string;
  links: string[];
  supplierKey: string;
  priceMode: 'excl' | 'incl';
  maxPagesPerUrl: number | null;
  aiAuditEnabled: boolean;
} {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const id = safeString(body.id);
  const name = safeString(body.name);
  const links = normalizeLinks(body.links);
  const supplierKey = safeString(body.supplierKey) || 'bouwmaat';
  const rawPriceMode = safeString(body.priceMode).toLowerCase();
  const priceMode: 'excl' | 'incl' = rawPriceMode === 'incl' ? 'incl' : 'excl';
  const rawMaxPages = body.maxPagesPerUrl;
  const parsedMaxPages = Number.parseInt(typeof rawMaxPages === 'string' ? rawMaxPages : String(rawMaxPages ?? ''), 10);
  const maxPagesPerUrl = Number.isFinite(parsedMaxPages) && parsedMaxPages > 0 ? parsedMaxPages : null;
  const aiAuditEnabled = typeof body.aiAuditEnabled === 'boolean' ? body.aiAuditEnabled : false;
  return { id, name, links, supplierKey, priceMode, maxPagesPerUrl, aiAuditEnabled };
}

function toResponsePreset(row: StoredPresetRow) {
  return {
    id: row.id,
    name: row.name,
    links: normalizeLinks(row.links),
    supplierKey: safeString(row.supplier_key) || 'bouwmaat',
    priceMode: safeString(row.price_mode).toLowerCase() === 'incl' ? 'incl' : 'excl',
    maxPagesPerUrl: row.max_pages_per_url == null ? '' : String(row.max_pages_per_url),
    aiAuditEnabled: row.ai_audit_enabled === true,
    updatedAt: row.updated_at,
  };
}

async function listPresets(uid: string, supplierKey: string) {
  const scopedSelect = 'id, name, links, supplier_key, price_mode, max_pages_per_url, ai_audit_enabled, updated_at';
  const legacySelect = 'id, name, links, max_pages_per_url, ai_audit_enabled, updated_at';

  let scopedQuery = supabaseAdmin
    .from('bouwmaat_link_presets')
    .select(scopedSelect)
    .eq('gebruikerid', uid)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (supplierKey === 'bouwmaat') {
    scopedQuery = scopedQuery.or('supplier_key.eq.bouwmaat,supplier_key.is.null');
  } else {
    scopedQuery = scopedQuery.eq('supplier_key', supplierKey);
  }

  const scopedResult = await scopedQuery;
  if (!scopedResult.error) {
    return (Array.isArray(scopedResult.data) ? scopedResult.data : []).map((row) => toResponsePreset(row as StoredPresetRow));
  }

  if (!/supplier_key|price_mode/i.test(scopedResult.error.message || '')) {
    throw new Error(scopedResult.error.message || 'Kon presets niet ophalen.');
  }

  const legacy = await supabaseAdmin
    .from('bouwmaat_link_presets')
    .select(legacySelect)
    .eq('gebruikerid', uid)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (legacy.error) {
    throw new Error(legacy.error.message || 'Kon presets niet ophalen.');
  }

  const fallbackRows = (Array.isArray(legacy.data) ? legacy.data : []).map((row) => ({
    ...(row as Record<string, unknown>),
    supplier_key: 'bouwmaat',
    price_mode: 'excl',
  }));
  const filtered = fallbackRows.filter((row) => (safeString(row.supplier_key) || 'bouwmaat') === supplierKey);
  return filtered.map((row) => toResponsePreset(row as StoredPresetRow));
}

export async function GET(request: Request) {
  try {
    const uid = await verifyUser(request);
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Niet ingelogd.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const supplierKey = safeString(searchParams.get('supplierKey')) || 'bouwmaat';
    const presets = await listPresets(uid, supplierKey);
    return NextResponse.json({ ok: true, presets });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon presets niet ophalen.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const uid = await verifyUser(request);
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Niet ingelogd.' }, { status: 401 });
    }

    const body = parseBody(await request.json().catch(() => ({})));
    if (!body.name) {
      return NextResponse.json({ ok: false, message: 'Presetnaam ontbreekt.' }, { status: 400 });
    }
    if (body.links.length === 0) {
      return NextResponse.json({ ok: false, message: 'Minimaal één link is verplicht.' }, { status: 400 });
    }
    if (body.maxPagesPerUrl == null) {
      return NextResponse.json(
        { ok: false, message: 'Aantal pagina\'s is verplicht voor een preset (bijv. 1 of 100).' },
        { status: 400 }
      );
    }

    let presetId = body.id || `preset-${crypto.randomUUID()}`;

    // Canonicalize by (user, supplier, name) so save acts like "update or create"
    // and never violates the unique index on (gebruikerid, supplier_key, name).
    const existingByName = await supabaseAdmin
      .from('bouwmaat_link_presets')
      .select('id')
      .eq('gebruikerid', uid)
      .eq('supplier_key', body.supplierKey)
      .ilike('name', body.name)
      .maybeSingle();

    if (!existingByName.error && existingByName.data?.id) {
      presetId = safeString((existingByName.data as Record<string, unknown>).id) || presetId;
    }

    const existingById = await supabaseAdmin
      .from('bouwmaat_link_presets')
      .select('id, gebruikerid')
      .eq('id', presetId)
      .maybeSingle();

    if (existingById.error) {
      return NextResponse.json(
        { ok: false, message: existingById.error.message || 'Kon preset niet controleren.' },
        { status: 500 }
      );
    }

    const ownerUid = safeString((existingById.data as Record<string, unknown> | null)?.gebruikerid);
    if (ownerUid && ownerUid !== uid) {
      return NextResponse.json({ ok: false, message: 'Preset hoort bij een andere gebruiker.' }, { status: 403 });
    }

    const upsertPayload = {
      id: presetId,
      gebruikerid: uid,
      name: body.name,
      links: body.links,
      supplier_key: body.supplierKey,
      price_mode: body.priceMode,
      max_pages_per_url: body.maxPagesPerUrl,
      ai_audit_enabled: body.aiAuditEnabled,
      updated_at: new Date().toISOString(),
    };

    let upsert = await supabaseAdmin
      .from('bouwmaat_link_presets')
      .upsert(
        upsertPayload,
        { onConflict: 'id' }
      );

    if (upsert.error && /supplier_key|price_mode/i.test(upsert.error.message || '')) {
      const legacyPayload = {
        id: presetId,
        gebruikerid: uid,
        name: body.name,
        links: body.links,
        max_pages_per_url: body.maxPagesPerUrl,
        ai_audit_enabled: body.aiAuditEnabled,
        updated_at: new Date().toISOString(),
      };
      upsert = await supabaseAdmin
        .from('bouwmaat_link_presets')
        .upsert(legacyPayload, { onConflict: 'id' });
    }

    if (upsert.error) {
      // If unique constraint still triggers (race/case edge), update by unique tuple.
      if ((upsert.error as { code?: string }).code === '23505') {
        const tupleLookup = await supabaseAdmin
          .from('bouwmaat_link_presets')
          .select('id')
          .eq('gebruikerid', uid)
          .eq('supplier_key', body.supplierKey)
          .ilike('name', body.name)
          .maybeSingle();

        const tupleId = safeString((tupleLookup.data as Record<string, unknown> | null)?.id);
        if (tupleId) {
          const tupleUpdate = await supabaseAdmin
            .from('bouwmaat_link_presets')
            .update({
              links: body.links,
              price_mode: body.priceMode,
              max_pages_per_url: body.maxPagesPerUrl,
              ai_audit_enabled: body.aiAuditEnabled,
              updated_at: new Date().toISOString(),
            })
            .eq('id', tupleId)
            .eq('gebruikerid', uid);

          if (!tupleUpdate.error) {
            const presets = await listPresets(uid, body.supplierKey);
            return NextResponse.json({ ok: true, presets, savedId: tupleId });
          }
        }
      }
      return NextResponse.json({ ok: false, message: upsert.error.message || 'Opslaan mislukt.' }, { status: 500 });
    }

    const presets = await listPresets(uid, body.supplierKey);
    return NextResponse.json({ ok: true, presets, savedId: presetId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preset opslaan mislukt.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const uid = await verifyUser(request);
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Niet ingelogd.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const id = safeString((body as Record<string, unknown>)?.id);
    if (!id) {
      return NextResponse.json({ ok: false, message: 'Preset id ontbreekt.' }, { status: 400 });
    }

    const deletion = await supabaseAdmin
      .from('bouwmaat_link_presets')
      .delete()
      .eq('id', id)
      .eq('gebruikerid', uid);

    if (deletion.error) {
      return NextResponse.json({ ok: false, message: deletion.error.message || 'Verwijderen mislukt.' }, { status: 500 });
    }

    const supplierKey = safeString((body as Record<string, unknown>)?.supplierKey) || 'bouwmaat';
    const presets = await listPresets(uid, supplierKey);
    return NextResponse.json({ ok: true, presets });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preset verwijderen mislukt.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
