import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Firebase Admin via ADC (werkt op Firebase App Hosting) */
function krijgFirebaseAdminApp() {
  if (admin.apps.length > 0) return admin.app();
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

/** Voorkomt build-time inlining issues: altijd runtime lezen */
function env(name: string): string | undefined {
  return (process.env as Record<string, string | undefined>)[name];
}

async function leesBodyVeilig(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function normalizeString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length ? s : null;
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(',', '.').trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isMaatEenheid(eenheid: string) {
  return eenheid === 'p/m1' || eenheid === 'p/m2' || eenheid === 'p/m3';
}

function bouwMateriaalnaam(opts: {
  basisNaam: string;
  eenheid: string;
  unit: string;
  lengte: number | null;
  breedte: number | null;
  dikte: number | null;
  hoogte: number | null;
}) {
  const { basisNaam, eenheid, unit, lengte, breedte, dikte, hoogte } = opts;

  if (!isMaatEenheid(eenheid)) return basisNaam;

  // UI-logica:
  // - p/m1 & p/m2 => lengte, breedte, dikte
  // - p/m3       => lengte, breedte, hoogte
  if (lengte == null || breedte == null) return basisNaam;

  if (eenheid === 'p/m3') {
    if (hoogte == null) return basisNaam;
    return `${basisNaam} ${lengte} × ${breedte} × ${hoogte}${unit}`;
  }

  if (dikte == null) return basisNaam;
  return `${basisNaam} ${lengte} × ${breedte} × ${dikte}${unit}`;
}

async function bepaalUid(req: Request): Promise<string> {
  // Dev bypass (zelfde idee als je generate route)
  if (process.env.NODE_ENV !== 'production') return 'dev-user';

  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error('Geen Authorization: Bearer <idToken> header gevonden.');

  const token = match[1];

  const app = krijgFirebaseAdminApp();
  const decoded = await admin.auth(app).verifyIdToken(token);
  if (!decoded?.uid) throw new Error('UID ontbreekt in token');

  return decoded.uid;
}

export async function POST(req: Request) {
  try {
    const body = await leesBodyVeilig(req);
    if (!body) {
      return NextResponse.json({ ok: false, message: 'Body is geen geldige JSON' }, { status: 400 });
    }

    // Lees env dynamisch (runtime), voorkomt dat Next dit "undefined" bundled
    const n8nUrl = env('N8N_MATERIALEN_UPSERT_URL');
    const secret = env('N8N_HEADER_SECRET');

    if (!n8nUrl) {
      return NextResponse.json(
        {
          ok: false,
          message: 'ENV ontbreekt: N8N_MATERIALEN_UPSERT_URL',
          debug: {
            hasN8N_WEBHOOK_URL: !!env('N8N_WEBHOOK_URL'),
            hasN8N_MATERIALEN_UPSERT_URL: !!env('N8N_MATERIALEN_UPSERT_URL'),
            nodeEnv: env('NODE_ENV') || null,
          },
        },
        { status: 500 }
      );
    }

    if (!secret) {
      return NextResponse.json(
        { ok: false, message: 'ENV ontbreekt: N8N_HEADER_SECRET' },
        { status: 500 }
      );
    }

    const uid = await bepaalUid(req);

    const basisNaam = normalizeString(body.materiaalnaam);
    const eenheid = normalizeString(body.eenheid);
    const prijs = toNumber(body.prijs);

    const categorie = normalizeString(body.categorie) || normalizeString(body.subsectie) || 'Overig';
    const leverancier = normalizeString(body.leverancier) || null;

    const unit = normalizeString(body.unit) || 'mm';
    const lengte = toNumber(body.lengte);
    const breedte = toNumber(body.breedte);
    const dikte = toNumber(body.dikte);
    const hoogte = toNumber(body.hoogte);

    if (!basisNaam) return NextResponse.json({ ok: false, message: 'Materiaalnaam is verplicht' }, { status: 400 });
    if (!eenheid) return NextResponse.json({ ok: false, message: 'Eenheid is verplicht' }, { status: 400 });
    if (prijs === null) return NextResponse.json({ ok: false, message: 'Prijs is ongeldig' }, { status: 400 });

    const materiaalnaam = bouwMateriaalnaam({
      basisNaam,
      eenheid,
      unit,
      lengte,
      breedte,
      dikte,
      hoogte,
    });

    const payload = {
      uid,
      materiaalnaam,
      eenheid,
      prijs,
      subsectie: categorie,
      leverancier,
      volgorde: 999999,
    };

    const res = await fetch(n8nUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-offertehulp-secret': secret,
      },
      body: JSON.stringify(payload),
    });

    const txt = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, message: 'n8n webhook faalde', status: res.status, body: txt },
        { status: 502 }
      );
    }

    // n8n kan JSON teruggeven of plain text; beide ok
    try {
      return NextResponse.json({ ok: true, n8n: JSON.parse(txt) });
    } catch {
      return NextResponse.json({ ok: true, n8n: txt });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message || 'Onbekende serverfout' }, { status: 500 });
  }
}
