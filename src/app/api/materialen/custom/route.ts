// src/app/api/materialen/custom/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { initFirebaseAdmin } from '@/firebase/admin';

type Body = {
  materiaalnaam?: unknown;
  eenheid?: unknown;
  prijs?: unknown;

  // UI veld (jij gebruikt dit overal)
  categorie?: unknown;

  // backward compat / future-proof
  subsectie?: unknown;

  leverancier?: unknown;
  volgorde?: unknown;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;

  let s = v.trim();
  s = s.replace(/€/g, '').replace(/\s+/g, '');
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

export async function POST(req: Request) {
  try {
    // 1) Auth header
    const authHeader =
      req.headers.get('authorization') || req.headers.get('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Geen Bearer token.' },
        { status: 401 }
      );
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Lege token.' },
        { status: 401 }
      );
    }

    // 2) Verify Firebase token (server-side)
    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid;

    if (!uid) {
      return NextResponse.json(
        { success: false, error: 'Token ongeldig.' },
        { status: 401 }
      );
    }

    // 3) Body
    const body = (await req.json()) as Body;

    const naam = isNonEmptyString(body.materiaalnaam) ? body.materiaalnaam.trim() : '';
    const eenheid = isNonEmptyString(body.eenheid) ? body.eenheid.trim() : '';
    const prijsNum = toNumber(body.prijs);

    // UI -> DB mapping: categorie/subsectie
    const categorieStr =
      isNonEmptyString(body.categorie)
        ? body.categorie.trim()
        : isNonEmptyString(body.subsectie)
          ? body.subsectie.trim()
          : 'Overig';

    const leverancier = isNonEmptyString(body.leverancier)
      ? body.leverancier.trim()
      : null;

    const volgorde =
      typeof body.volgorde === 'number' && Number.isFinite(body.volgorde)
        ? Math.trunc(body.volgorde)
        : 999999;

    if (!naam) {
      return NextResponse.json(
        { success: false, error: 'Materiaalnaam is verplicht.' },
        { status: 400 }
      );
    }
    if (!eenheid) {
      return NextResponse.json(
        { success: false, error: 'Eenheid is verplicht.' },
        { status: 400 }
      );
    }
    if (prijsNum === null || prijsNum < 0) {
      return NextResponse.json(
        { success: false, error: 'Prijs is ongeldig.' },
        { status: 400 }
      );
    }

    // 4) Supabase (service role)
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      return NextResponse.json(
        { success: false, error: 'Server mist SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 5) Insert (DB kolom blijft subsectie)
    const payload = {
      gebruikerid: uid,
      materiaalnaam: naam,
      eenheid,
      prijs: prijsNum,
      subsectie: categorieStr,
      leverancier,
      volgorde,
    };

    const { data, error } = await supabaseAdmin
      .from('materialen')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (e) {
    console.error('Server error /api/materialen/custom:', e);
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}
