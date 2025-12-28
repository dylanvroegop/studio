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
    const cleaned = v.trim().replace(',', '.');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

async function bepaalUid(req: Request): Promise<string> {
  // Verwacht: Authorization: Bearer <firebaseIdToken>
  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error('Geen Bearer token in Authorization header');

  const token = match[1];

  const app = krijgFirebaseAdminApp();
  const decoded = await admin.auth(app).verifyIdToken(token);

  if (!decoded?.uid) throw new Error('UID ontbreekt in token');
  return decoded.uid;
}

function bouwMateriaalnaam(opts: {
  basisNaam: string;
  eenheid: string;
  unit: string;
  lengte: number | null;
  breedte: number | null;
  dikte: number | null;
  hoogte: number | null;
}): string {
  const basis = opts.basisNaam.trim();
  if (!basis) return basis;

  const heeftLB = opts.lengte !== null && opts.breedte !== null;

  // UI gedrag:
  // - p/m1 en p/m2 -> lengte × breedte × dikte + unit
  // - p/m3 -> lengte × breedte × hoogte + unit
  if (opts.eenheid === 'p/m3') {
    if (heeftLB && opts.hoogte !== null) {
      return `${basis} ${opts.lengte} x ${opts.breedte} x ${opts.hoogte}${opts.unit}`;
    }
    return basis;
  }

  if (opts.eenheid === 'p/m1' || opts.eenheid === 'p/m2') {
    if (heeftLB && opts.dikte !== null) {
      return `${basis} ${opts.lengte} x ${opts.breedte} x ${opts.dikte}${opts.unit}`;
    }
    return basis;
  }

  // andere eenheden: geen afmetingen aan naam plakken
  return basis;
}

export async function POST(req: Request) {
  try {
    const body = await leesBodyVeilig(req);
    if (!body) {
      return NextResponse.json(
        { ok: false, message: 'Body is geen geldige JSON' },
        { status: 400 }
      );
    }

    const n8nUrl = process.env.N8N_MATERIALEN_UPSERT_URL;
    const secret = process.env.N8N_HEADER_SECRET;

    if (!n8nUrl) throw new Error('ENV ontbreekt: N8N_MATERIALEN_UPSERT_URL');
    if (!secret) throw new Error('ENV ontbreekt: N8N_HEADER_SECRET');

    // 1) UID server-side bepalen (niet vertrouwen op client)
    const uid = await bepaalUid(req);

    // 2) Input uit modal
    const basisNaam = normalizeString(body.materiaalnaam);
    const eenheid = normalizeString(body.eenheid);
    const prijs = toNumber(body.prijs);

    const categorie =
      normalizeString(body.categorie) ||
      normalizeString(body.subsectie) ||
      'Overig';

    const leverancier = normalizeString(body.leverancier) || null;

    // afmetingen optioneel
    const lengte = toNumber(body.lengte);
    const breedte = toNumber(body.breedte);
    const dikte = toNumber(body.dikte);
    const hoogte = toNumber(body.hoogte);
    const unit = normalizeString(body.unit) || 'mm';

    if (!basisNaam) {
      return NextResponse.json(
        { ok: false, message: 'Materiaalnaam is verplicht' },
        { status: 400 }
      );
    }

    if (!eenheid) {
      return NextResponse.json(
        { ok: false, message: 'Eenheid is verplicht' },
        { status: 400 }
      );
    }

    if (prijs === null) {
      return NextResponse.json(
        { ok: false, message: 'Prijs is ongeldig' },
        { status: 400 }
      );
    }

    // 3) Bouw dezelfde naam-logica als UI ("Wordt opgeslagen als ...")
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

    // 4) Call n8n
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
        {
          ok: false,
          message: 'n8n webhook faalde',
          status: res.status,
          body: txt,
        },
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
    return NextResponse.json(
      { ok: false, message: e?.message || 'Onbekende serverfout' },
      { status: 500 }
    );
  }
}
