// src/app/api/materialen/custom/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { initFirebaseAdmin } from '@/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  materiaalnaam?: unknown;
  eenheid?: unknown;
  prijs?: unknown;
  prijs_incl_btw?: unknown;

  // UI gebruikt "subsectie" (frontend)
  subsectie?: unknown;

  // DB gebruikt "categorie" (supabase)
  categorie?: unknown;

  leverancier?: unknown;
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

  // verwijder € en spaties
  s = s.replace(/€/g, '').replace(/\s+/g, '');

  // laat alleen cijfers + . , - toe
  s = s.replace(/[^0-9,.-]/g, '');
  if (!s) return null;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  if (hasDot && hasComma) {
    // 1.234,56 -> 1234.56
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma && !hasDot) {
    // 12,34 -> 12.34
    s = s.replace(',', '.');
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function jsonOk(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(req: Request) {
  try {
    // 1) Bearer token uit header
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonError('Geen Bearer token.', 401);
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return jsonError('Lege token.', 401);
    }

    // 2) Firebase token verifiëren
    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid;

    if (!uid) {
      return jsonError('Token ongeldig.', 401);
    }

    // 3) Body lezen + normaliseren
    const body = (await req.json()) as Body;

    const naam = normalizeString(body.materiaalnaam);
    const eenheid = normalizeString(body.eenheid);
    const prijsNum = toNumber(body.prijs_incl_btw ?? body.prijs);

    // Belangrijk: UI = categorie, DB = subsectie
    // We accepteren beide als input, maar schrijven ALTIJD naar subsectie in Supabase.
    const categorieInput =
      normalizeString(body.categorie) ??
      normalizeString(body.subsectie) ??
      'Overig';

    const leverancier = normalizeString(body.leverancier); // mag null zijn

    // 4) Validaties
    if (!naam) return jsonError('Materiaalnaam is verplicht.', 400);
    if (!eenheid) return jsonError('Eenheid is verplicht.', 400);

    if (prijsNum === null) return jsonError('Prijs is ongeldig.', 400);
    if (prijsNum < 0) return jsonError('Prijs mag niet negatief zijn.', 400);

    // 5) Supabase service role client
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      return jsonError('Server mist NEXT_PUBLIC_SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY.', 500);
    }

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 6) Insert payload (NOOIT "categorie" naar Supabase sturen)
    // Let op: kolomnamen moeten exact matchen met je Supabase tabel.
    const payload = {
      gebruikerid: uid,
      materiaalnaam: naam,
      eenheid: eenheid,
      prijs_incl_btw: prijsNum,
      categorie: categorieInput,
      leverancier: leverancier, // null toegestaan
    };

    const { data, error } = await supabaseAdmin
      .from('main_material_list')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      // Dit is precies waar je eerder PGRST204 kreeg als je "categorie" stuurde.
      console.error('Supabase insert error:', error);
      return jsonError(error.message || 'Insert failed', 500);
    }

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
              (data as any).sub_categorie ??
              null,
          }
        : data;

    return jsonOk({ success: true, data: normalized }, 200);
  } catch (e) {
    console.error('Server error /api/materialen/custom:', e);
    return jsonError('Server error', 500);
  }
}
