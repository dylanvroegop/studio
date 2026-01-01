// src/app/api/materialen/upsert/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { initFirebaseAdmin } from '@/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  materiaalnaam?: unknown;
  eenheid?: unknown;
  prijs?: unknown;
  leverancier?: unknown;
  volgorde?: unknown;

  // UI vs DB
  categorie?: unknown;  // UI
  subsectie?: unknown;  // DB

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

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;

  let s = v.trim();
  if (!s) return null;

  s = s.replace(/€/g, '').replace(/\s+/g, '');
  s = s.replace(/[^0-9,.-]/g, '');
  if (!s) return null;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  if (hasDot && hasComma) s = s.replace(/\./g, '').replace(',', '.');
  else if (hasComma && !hasDot) s = s.replace(',', '.');

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function toInt(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string') {
    const n = parseInt(v.trim(), 10);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return fallback;
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

    const naam = normalizeString(body.materiaalnaam);
    const eenheid = normalizeString(body.eenheid);
    const prijsNum = toNumber(body.prijs);

    const subsectie =
      normalizeString(body.subsectie) ??
      normalizeString(body.categorie) ??
      'Overig';

    const leverancier = normalizeString(body.leverancier);
    const volgorde = toInt(body.volgorde, 999999);

    // LET OP: jouw DB heeft GEEN 'id' kolom.
    // We accepteren 'id' alleen als alias voor row_id (frontend stuurt soms payload.id).
    const incomingRowId = normalizeString(body.row_id) ?? normalizeString(body.id) ?? null;

    if (!naam) return jsonFail('Materiaalnaam is verplicht.', 400);
    if (!eenheid) return jsonFail('Eenheid is verplicht.', 400);
    if (prijsNum === null) return jsonFail('Prijs is ongeldig.', 400);
    if (prijsNum < 0) return jsonFail('Prijs mag niet negatief zijn.', 400);

    // 4) Supabase service role (server-side)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return jsonFail('Server mist SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY.', 500);

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 5) Payload (nooit id/categorie meesturen)
    const payload = {
      gebruikerid: uid,
      materiaalnaam: naam,
      eenheid,
      prijs: prijsNum,
      subsectie,
      leverancier,
      volgorde,
    };

    let data: any = null;

    // 6) Update of insert
    if (incomingRowId) {
      // SECURITY: altijd ownership check (anders kan iemand andermans row_id misbruiken)
      const upd = await supabaseAdmin
        .from('materialen')
        .update(payload)
        .eq('row_id', incomingRowId)
        .eq('gebruikerid', uid)
        .select('row_id,materiaalnaam,eenheid,prijs,subsectie,leverancier,volgorde')
        .single();

      if (upd.error) return jsonFail(upd.error.message || 'Update failed', 500);
      data = upd.data;

      if (!data) {
        // row_id bestaat niet of hoort niet bij gebruiker -> harde fout (beter dan silent insert)
        return jsonFail('Materiaal niet gevonden of geen toegang.', 404);
      }
    } else {
      const ins = await supabaseAdmin
        .from('materialen')
        .insert(payload)
        .select('row_id,materiaalnaam,eenheid,prijs,subsectie,leverancier,volgorde')
        .single();

      if (ins.error) return jsonFail(ins.error.message || 'Insert failed', 500);
      data = ins.data;
    }

    const realRowId = data?.row_id ?? incomingRowId ?? null;
    if (!realRowId) return jsonFail('Geen ID ontvangen van server.', 500);

    return jsonOk({ ok: true, data, row_id: realRowId }, 200);
  } catch (e: any) {
    console.error('Server error /api/materialen/upsert:', e);
    return jsonFail(e?.message || 'Server error', 500);
  }
}
