/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parsePriceToNumber } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ImportMaterial = {
  materiaalnaam?: unknown;
  eenheid?: unknown;
  prijs_excl_btw?: unknown;
  prijs_incl_btw?: unknown;
  categorie?: unknown;
  sub_categorie?: unknown;
  leverancier?: unknown;
  lengte?: unknown;
  breedte?: unknown;
  dikte?: unknown;
  hoogte?: unknown;
  source_url?: unknown;
  source_product_id?: unknown;
  unit_price_text?: unknown;
  bulk_price_text?: unknown;
  confidence?: unknown;
};

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function roundToCents(value: number): number {
  return Number(value.toFixed(2));
}

function normalizeMaterial(input: ImportMaterial, uid: string): Record<string, unknown> | null {
  const materiaalnaam = safeString(input.materiaalnaam);
  const eenheid = safeString(input.eenheid) || 'stuk';
  if (!materiaalnaam) return null;
  if (/\(\s*\d+\s*\)\s*$/.test(materiaalnaam)) return null;

  const prijsExcl = parsePriceToNumber(input.prijs_excl_btw);
  if (prijsExcl == null) return null;
  const prijsInclRaw = parsePriceToNumber(input.prijs_incl_btw);
  const prijsIncl = prijsInclRaw ?? (prijsExcl == null ? null : roundToCents(prijsExcl * 1.21));

  const payload: Record<string, unknown> = {
    gebruikerid: uid,
    materiaalnaam,
    eenheid,
    leverancier: safeString(input.leverancier) || 'Bouwmaat',
    ai_extra_data: {
      source: 'bouwmaat_authenticated_scraper',
      source_url: safeString(input.source_url),
      source_product_id: safeString(input.source_product_id),
      unit_price_text: safeString(input.unit_price_text),
      bulk_price_text: safeString(input.bulk_price_text),
      confidence: typeof input.confidence === 'number' ? input.confidence : null,
      imported_at: new Date().toISOString(),
    },
  };

  if (prijsExcl != null) payload.prijs_excl_btw = prijsExcl;
  if (prijsIncl != null) payload.prijs_incl_btw = prijsIncl;

  const categorie = safeString(input.categorie);
  const subCategorie = safeString(input.sub_categorie);
  if (categorie) payload.categorie = categorie;
  if (subCategorie) payload.sub_categorie = subCategorie;

  const lengte = safeString(input.lengte);
  const breedte = safeString(input.breedte);
  const dikte = safeString(input.dikte);
  const hoogte = safeString(input.hoogte);
  if (lengte) payload.lengte = lengte;
  if (breedte) payload.breedte = breedte;
  if (dikte) payload.dikte = dikte;
  if (hoogte) payload.hoogte = hoogte;

  return payload;
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Niet ingelogd.' }, { status: 401 });
    }

    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token).catch(() => null);
    const uid = decoded?.uid || '';
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Niet ingelogd.' }, { status: 401 });
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const body = await request.json().catch(() => ({}));
    const rawMaterials = Array.isArray(body?.materials) ? body.materials.slice(0, 1000) : [];
    const materials = rawMaterials
      .map((entry: unknown) => normalizeMaterial(entry as ImportMaterial, uid))
      .filter((entry: Record<string, unknown> | null): entry is Record<string, unknown> => Boolean(entry));

    if (materials.length === 0) {
      return NextResponse.json({ ok: false, message: 'Geen geldige materialen om te importeren.' }, { status: 400 });
    }

    let inserted = 0;
    let updated = 0;
    const skipped: Array<{ materiaalnaam: string; message: string }> = [];

    for (const material of materials) {
      const naam = safeString(material.materiaalnaam);
      if (!naam) continue;

      const existing = await supabaseAdmin
        .from('main_material_list')
        .select('row_id')
        .eq('gebruikerid', uid)
        .eq('materiaalnaam', naam)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing.error) {
        skipped.push({ materiaalnaam: naam, message: existing.error.message });
        continue;
      }

      if (existing.data?.row_id) {
        const update = await supabaseAdmin
          .from('main_material_list')
          .update(material)
          .eq('gebruikerid', uid)
          .eq('row_id', existing.data.row_id)
          .select('row_id')
          .maybeSingle();

        if (update.error) {
          skipped.push({ materiaalnaam: naam, message: update.error.message });
          continue;
        }
        updated += 1;
      } else {
        const insert = await supabaseAdmin
          .from('main_material_list')
          .insert(material)
          .select('row_id')
          .single();

        if (insert.error) {
          skipped.push({ materiaalnaam: naam, message: insert.error.message });
          continue;
        }
        inserted += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      inserted,
      updated,
      skipped,
      total: materials.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bulk import mislukt.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
