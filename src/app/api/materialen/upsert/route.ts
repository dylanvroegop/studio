/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { initFirebaseAdmin } from '@/firebase/admin';
import { parsePriceToNumber } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  materiaalnaam?: unknown;
  eenheid?: unknown;
  prijs?: unknown;
  prijs_incl_btw?: unknown;
  prijs_excl_btw?: unknown;
  leverancier?: unknown;
  lengte?: unknown;
  breedte?: unknown;
  dikte?: unknown;
  hoogte?: unknown;
  werkende_breedte_maat?: unknown;
  werkende_hoogte_maat?: unknown;
  werkende_breedte_mm?: unknown;
  werkende_hoogte_mm?: unknown;
  verbruik_per_m2?: unknown;
  vebruik_per_m2?: unknown; // alias voor typo in oudere payloads

  // UI vs DB
  categorie?: unknown;  // DB
  subsectie?: unknown;  // UI (legacy)

  // Frontend stuurt soms beide mee; in jouw DB bestaat alleen row_id
  row_id?: unknown;
  id?: unknown;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function normalizeString(v: unknown): string | null {
  if (!isNonEmptyString(v)) return null;
  const s = v.trim();
  return s.length ? s : null;
}

function normalizeNullableNumber(v: unknown, fieldName: string): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === 'string' && v.trim() === '') return null;

  const parsed = parsePriceToNumber(v);
  if (parsed === null) throw new Error(`${fieldName} is ongeldig.`);
  if (parsed < 0) throw new Error(`${fieldName} mag niet negatief zijn.`);
  return parsed;
}

function roundToCents(value: number): number {
  return Number(value.toFixed(2));
}

function resolveCanonicalPrices(body: Body): { prijsExcl: number | null; prijsIncl: number | null } {
  const explicitExcl = parsePriceToNumber(body.prijs_excl_btw);
  const explicitIncl = parsePriceToNumber(body.prijs_incl_btw);
  const legacyPrijs = parsePriceToNumber(body.prijs);

  // Canonical truth: excl. btw.
  let prijsExcl = explicitExcl;
  let prijsIncl = explicitIncl;

  if (prijsExcl === null && prijsIncl !== null) {
    prijsExcl = roundToCents(prijsIncl / 1.21);
  }

  if (prijsIncl === null && prijsExcl !== null) {
    prijsIncl = roundToCents(prijsExcl * 1.21);
  }

  // Legacy fallback: treat ambiguous `prijs` as excl to avoid mixed semantics.
  if (prijsExcl === null && legacyPrijs !== null) {
    prijsExcl = legacyPrijs;
    if (prijsIncl === null) {
      prijsIncl = roundToCents(legacyPrijs * 1.21);
    }
  }

  return { prijsExcl, prijsIncl };
}

function bepaalN8nUrlVoorMaterialenUpsert(): string {
  const direct = process.env.N8N_MATERIALEN_UPSERT_URL;
  if (direct && direct.trim()) return direct.trim();
  throw new Error('ENV ontbreekt: N8N_MATERIALEN_UPSERT_URL');
}

function extractN8nRow(input: any): Record<string, unknown> | null {
  if (!input) return null;

  if (Array.isArray(input)) {
    const first = input.find((item) => item && typeof item === 'object');
    return first ?? null;
  }

  if (typeof input === 'object') {
    if (Array.isArray(input.data)) {
      const first = input.data.find((item: unknown) => item && typeof item === 'object');
      return first ?? null;
    }
    if (input.data && typeof input.data === 'object') {
      return input.data as Record<string, unknown>;
    }
    return input as Record<string, unknown>;
  }

  return null;
}

async function stuurNaarN8nVoorMaterialenUpsert(payload: Record<string, unknown>): Promise<any> {
  const secret = process.env.N8N_HEADER_SECRET;
  if (!secret || !secret.trim()) throw new Error('ENV ontbreekt: N8N_HEADER_SECRET');

  const n8nUrl = bepaalN8nUrlVoorMaterialenUpsert();
  const res = await fetch(n8nUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-offertehulp-secret': secret.trim(),
    },
    body: JSON.stringify(payload),
  });

  const txt = await res.text();
  if (!res.ok) {
    throw new Error(`n8n webhook faalde (${res.status}): ${txt || 'lege response'}`);
  }

  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

function jsonOk(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status });
}

function jsonFail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(req: Request) {
  try {
    // 1) Bearer token
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonFail('Geen Bearer token.', 401);

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) return jsonFail('Lege token.', 401);

    // 2) Firebase token verifiëren
    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid;
    if (!uid) return jsonFail('Token ongeldig.', 401);

    // 3) Body
    const body = (await req.json()) as Body;

    // ✅ FIXED HERE: We check "typeof === string" so Typescript allows .trim()
    const naam = typeof body.materiaalnaam === 'string' ? body.materiaalnaam.trim() : null;

    const eenheid = normalizeString(body.eenheid);
    const { prijsExcl: prijsExclNum, prijsIncl: prijsInclNum } = resolveCanonicalPrices(body);

    const categorie =
      normalizeString(body.categorie) ??
      normalizeString(body.subsectie);

    const leverancier = normalizeString(body.leverancier);
    const lengte = normalizeString(body.lengte);
    const breedte = normalizeString(body.breedte);
    const dikte = normalizeString(body.dikte);
    const hoogte = normalizeString(body.hoogte);

    let werkendeBreedteMaat: number | null | undefined;
    let werkendeHoogteMaat: number | null | undefined;
    let verbruikPerM2: number | null | undefined;
    try {
      werkendeBreedteMaat = normalizeNullableNumber(
        body.werkende_breedte_maat ?? body.werkende_breedte_mm,
        'werkende_breedte_maat'
      );
      werkendeHoogteMaat = normalizeNullableNumber(
        body.werkende_hoogte_maat ?? body.werkende_hoogte_mm,
        'werkende_hoogte_maat'
      );
      verbruikPerM2 = normalizeNullableNumber(
        body.verbruik_per_m2 ?? body.vebruik_per_m2,
        'verbruik_per_m2'
      );
    } catch (validationError: any) {
      return jsonFail(validationError?.message || 'Ongeldige numerieke waarde.', 400);
    }

    // LET OP: jouw DB heeft GEEN 'id' kolom.
    // We accepteren 'id' alleen als alias voor row_id (frontend stuurt soms payload.id).
    const incomingRowId = normalizeString(body.row_id) ?? normalizeString(body.id) ?? null;

    if (!naam) return jsonFail('Materiaalnaam is verplicht.', 400);
    if (!eenheid) return jsonFail('Eenheid is verplicht.', 400);
    if (prijsExclNum === null) return jsonFail('Prijs (excl. btw) is ongeldig.', 400);
    if (prijsExclNum < 0) return jsonFail('Prijs mag niet negatief zijn.', 400);
    const prijsInclSafe = prijsInclNum ?? roundToCents(prijsExclNum * 1.21);

    // 4) Supabase service role (server-side) using shared client
    // supabaseAdmin is already initialized

    // 5) Payload (nooit id/categorie meesturen)
    const payload: Record<string, unknown> = {
      gebruikerid: uid,
      materiaalnaam: naam, // This now contains the full string correctly
      eenheid,
      prijs_incl_btw: prijsInclSafe,
      prijs_excl_btw: prijsExclNum,
    };
    if (categorie) payload.categorie = categorie;
    if (leverancier) payload.leverancier = leverancier;
    if (lengte) payload.lengte = lengte;
    if (breedte) payload.breedte = breedte;
    if (dikte) payload.dikte = dikte;
    if (hoogte) payload.hoogte = hoogte;
    if (werkendeBreedteMaat !== undefined) {
      payload.werkende_breedte_maat = werkendeBreedteMaat;
      payload.werkende_breedte_mm = werkendeBreedteMaat;
    }
    if (werkendeHoogteMaat !== undefined) {
      payload.werkende_hoogte_maat = werkendeHoogteMaat;
      payload.werkende_hoogte_mm = werkendeHoogteMaat;
    }
    if (verbruikPerM2 !== undefined) {
      payload.verbruik_per_m2 = verbruikPerM2;
    }

    let data: any = null;
    let realRowId: string | null = null;
    let n8nResponse: any = null;

    // 6) Update of insert
    if (incomingRowId) {
      // SECURITY: update alleen eigen materiaal. Als het bronmateriaal niet van deze user is,
      // maken we een persoonlijke kopie i.p.v. het globale item aan te passen.
      const upd = await supabaseAdmin
        .from('main_material_list')
        .update(payload)
        .eq('row_id', incomingRowId)
        .eq('gebruikerid', uid)
        .select('*')
        .maybeSingle();

      if (upd.error) return jsonFail(upd.error.message || 'Update failed', 500);
      data = upd.data;

      if (!data) {
        const base = await supabaseAdmin
          .from('main_material_list')
          .select('row_id')
          .eq('row_id', incomingRowId)
          .maybeSingle();

        if (base.error) return jsonFail(base.error.message || 'Lookup failed', 500);
        if (!base.data) return jsonFail('Materiaal niet gevonden.', 404);

        const insCopy = await supabaseAdmin
          .from('main_material_list')
          .insert(payload)
          .select('*')
          .single();

        if (insCopy.error) return jsonFail(insCopy.error.message || 'Insert failed', 500);
        data = insCopy.data;
      }
      realRowId = data?.row_id ?? incomingRowId ?? null;
    } else {
      // Nieuwe materialen lopen via n8n AI-agent -> Supabase
      n8nResponse = await stuurNaarN8nVoorMaterialenUpsert(payload);

      const n8nRow = extractN8nRow(n8nResponse);
      if (n8nRow) {
        data = n8nRow;
        realRowId =
          normalizeString((n8nRow as any).row_id) ??
          normalizeString((n8nRow as any).id) ??
          null;
      }

      // Fallback: haal laatste insert op als n8n geen row terugstuurt
      if (!realRowId) {
        const lookup = await supabaseAdmin
          .from('main_material_list')
          .select('*')
          .eq('gebruikerid', uid)
          .eq('materiaalnaam', naam)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lookup.error) {
          return jsonFail(lookup.error.message || 'Insert lookup failed', 500);
        }

        if (lookup.data) {
          data = lookup.data;
          realRowId = lookup.data.row_id ?? null;
        }
      }
    }

    // Defensive repair: if n8n returned/stored only incl. btw, patch row to always include excl. btw.
    const storedExcl = parsePriceToNumber((data as any)?.prijs_excl_btw ?? (data as any)?.prijs);
    const storedIncl = parsePriceToNumber((data as any)?.prijs_incl_btw);
    const resolvedStoredExcl =
      storedExcl ??
      (storedIncl !== null ? roundToCents(storedIncl / 1.21) : prijsExclNum);

    if (realRowId && resolvedStoredExcl !== null && storedExcl === null) {
      const repairPayload: Record<string, unknown> = {
        prijs_excl_btw: resolvedStoredExcl,
      };
      if (storedIncl === null) {
        repairPayload.prijs_incl_btw = roundToCents(resolvedStoredExcl * 1.21);
      }

      const repair = await supabaseAdmin
        .from('main_material_list')
        .update(repairPayload)
        .eq('row_id', realRowId)
        .eq('gebruikerid', uid)
        .select('*')
        .maybeSingle();

      if (!repair.error && repair.data) {
        data = repair.data;
      }
    }

    const finalExcl =
      parsePriceToNumber((data as any)?.prijs_excl_btw ?? (data as any)?.prijs) ??
      resolvedStoredExcl;
    const finalIncl =
      parsePriceToNumber((data as any)?.prijs_incl_btw) ??
      (finalExcl !== null ? roundToCents(finalExcl * 1.21) : null);

    const normalized =
      data && typeof data === 'object'
        ? {
            ...data,
            prijs:
              finalExcl ??
              null,
            prijs_excl_btw: finalExcl ?? null,
            prijs_incl_btw: finalIncl ?? null,
            subsectie:
              (data as any).subsectie ??
              (data as any).categorie ??
              null,
          }
        : data;

    return jsonOk({ ok: true, data: normalized, row_id: realRowId, n8n: n8nResponse }, 200);
  } catch (e: any) {
    console.error('Server error /api/materialen/upsert:', e);
    return jsonFail(e?.message || 'Server error', 500);
  }
}
