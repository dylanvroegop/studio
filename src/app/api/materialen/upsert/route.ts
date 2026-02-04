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
  leverancier?: unknown;
  lengte?: unknown;
  breedte?: unknown;
  dikte?: unknown;
  hoogte?: unknown;

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
    const prijsNum = parsePriceToNumber(body.prijs_incl_btw ?? body.prijs);

    const categorie =
      normalizeString(body.categorie) ??
      normalizeString(body.subsectie) ??
      'Overig';

    const leverancier = normalizeString(body.leverancier);
    const lengte = normalizeString(body.lengte);
    const breedte = normalizeString(body.breedte);
    const dikte = normalizeString(body.dikte);
    const hoogte = normalizeString(body.hoogte);

    // LET OP: jouw DB heeft GEEN 'id' kolom.
    // We accepteren 'id' alleen als alias voor row_id (frontend stuurt soms payload.id).
    const incomingRowId = normalizeString(body.row_id) ?? normalizeString(body.id) ?? null;

    if (!naam) return jsonFail('Materiaalnaam is verplicht.', 400);
    if (!eenheid) return jsonFail('Eenheid is verplicht.', 400);
    if (prijsNum === null) return jsonFail('Prijs is ongeldig.', 400);
    if (prijsNum < 0) return jsonFail('Prijs mag niet negatief zijn.', 400);

    // 4) Supabase service role (server-side) using shared client
    // supabaseAdmin is already initialized

    // 5) Payload (nooit id/categorie meesturen)
    const payload: Record<string, unknown> = {
      gebruikerid: uid,
      materiaalnaam: naam, // This now contains the full string correctly
      eenheid,
      prijs_incl_btw: prijsNum,
      categorie,
      leverancier,
    };
    if (lengte) payload.lengte = lengte;
    if (breedte) payload.breedte = breedte;
    if (dikte) payload.dikte = dikte;
    if (hoogte) payload.hoogte = hoogte;

    let data: any = null;

    // 6) Update of insert
    if (incomingRowId) {
      // SECURITY: altijd ownership check
      const upd = await supabaseAdmin
        .from('main_material_list')
        .update(payload)
        .eq('row_id', incomingRowId)
        .eq('gebruikerid', uid)
        .select('row_id,materiaalnaam,eenheid,prijs_incl_btw,categorie,leverancier')
        .single();

      if (upd.error) return jsonFail(upd.error.message || 'Update failed', 500);
      data = upd.data;

      if (!data) {
        return jsonFail('Materiaal niet gevonden of geen toegang.', 404);
      }
    } else {
      const ins = await supabaseAdmin
        .from('main_material_list')
        .insert(payload)
        .select('row_id,materiaalnaam,eenheid,prijs_incl_btw,categorie,leverancier')
        .single();

      if (ins.error) return jsonFail(ins.error.message || 'Insert failed', 500);
      data = ins.data;
    }

    const realRowId = data?.row_id ?? incomingRowId ?? null;
    if (!realRowId) return jsonFail('Geen ID ontvangen van server.', 500);

    const normalized =
      data && typeof data === 'object'
        ? {
            ...data,
            prijs:
              (data as any).prijs ??
              (data as any).prijs_incl_btw ??
              null,
            subsectie:
              (data as any).subsectie ??
              (data as any).categorie ??
              null,
          }
        : data;

    return jsonOk({ ok: true, data: normalized, row_id: realRowId }, 200);
  } catch (e: any) {
    console.error('Server error /api/materialen/upsert:', e);
    return jsonFail(e?.message || 'Server error', 500);
  }
}
