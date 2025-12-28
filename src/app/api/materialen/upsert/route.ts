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
  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error('Geen Bearer token in Authorization header');

  const token = match[1];
  const app = krijgFirebaseAdminApp();
  const decoded = await admin.auth(app).verifyIdToken(token);

  if (!decoded?.uid) throw new Error('UID ontbreekt in token');
  return decoded.uid;
}

/**
 * Bouw exact dezelfde "Wordt opgeslagen als ..." logica als jouw UI:
 * - p/m1 & p/m2: lengte + breedte + dikte
 * - p/m3: lengte + breedte + hoogte
 * (Alleen als alle benodigde velden aanwezig zijn)
 */
function bouwMateriaalnaam(opts: {
  basisNaam: string;
  eenheid: string;
  unit: string;
  lengte: number | null;
  breedte: number | null;
  dikte: number | null;
  hoogte: number | null;
}): string {
  const { basisNaam, eenheid, unit, lengte, breedte, dikte, hoogte } = opts;

  const heeftLB = lengte !== null && breedte !== null;

  if ((eenheid === 'p/m1' || eenheid === 'p/m2') && heeftLB && dikte !== null) {
    return `${basisNaam} ${lengte} x ${breedte} x ${dikte}${unit}`;
  }

  if (eenheid === 'p/m3' && heeftLB && hoogte !== null) {
    return `${basisNaam} ${lengte} x ${breedte} x ${hoogte}${unit}`;
  }

  return basisNaam;
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

    // 1) UID server-side bepalen
    const uid = await bepaalUid(req);

    // 2) Input uit modal (client)
    const basisNaam = normalizeString(body.materiaalnaam);
    const eenheid = normalizeString(body.eenheid);
    const prijs = toNumber(body.prijs);

    const categorie =
      normalizeString(body.categorie) ||
      normalizeString(body.subsectie) ||
      'Overig';

    const leverancier = normalizeString(body.leverancier) || null;

    // afmetingen (client stuurt dikte OF hoogte afhankelijk van eenheid)
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

    // 3) Call n8n
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
      // BELANGRIJK: geef status + body terug zodat jij direct ziet wat n8n zegt
      const detail = `n8n ${res.status}: ${txt?.slice(0, 1500) || '(lege response)'}`;
      console.error('N8N FOUT (materialen/upsert)', {
        n8nUrl,
        status: res.status,
        body: txt?.slice(0, 4000),
      });

      return NextResponse.json(
        { ok: false, message: detail },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('UPSERT ROUTE FOUT', e);
    return NextResponse.json(
      { ok: false, message: e?.message || 'Onbekende serverfout' },
      { status: 500 }
    );
  }
}
