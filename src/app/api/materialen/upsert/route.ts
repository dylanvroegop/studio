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
    const n = Number(v.replace(',', '.').trim());
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

export async function POST(req: Request) {
  try {
    const body = await leesBodyVeilig(req);
    if (!body) {
      return NextResponse.json({ ok: false, message: 'Body is geen geldige JSON' }, { status: 400 });
    }

    const n8nUrl = process.env.N8N_MATERIALEN_UPSERT_URL;
    const secret = process.env.N8N_HEADER_SECRET;

    if (!n8nUrl) throw new Error('ENV ontbreekt: N8N_MATERIALEN_UPSERT_URL');
    if (!secret) throw new Error('ENV ontbreekt: N8N_HEADER_SECRET');

    const uid = await bepaalUid(req);

    const basisNaam = normalizeString(body.materiaalnaam);
    const eenheid = normalizeString(body.eenheid);
    const prijs = toNumber(body.prijs);

    const categorie = normalizeString(body.categorie) || normalizeString(body.subsectie) || 'Overig';
    const leverancier = normalizeString(body.leverancier) || null;

    const lengte = toNumber(body.lengte);
    const breedte = toNumber(body.breedte);
    const dikte = toNumber(body.dikte);
    const hoogte = toNumber(body.hoogte);
    const unit = normalizeString(body.unit) || 'mm';

    if (!basisNaam) return NextResponse.json({ ok: false, message: 'Materiaalnaam is verplicht' }, { status: 400 });
    if (!eenheid) return NextResponse.json({ ok: false, message: 'Eenheid is verplicht' }, { status: 400 });
    if (prijs === null) return NextResponse.json({ ok: false, message: 'Prijs is ongeldig' }, { status: 400 });

    // Let op: UI stuurt dikte OF hoogte afhankelijk van eenheid.
    let materiaalnaam = basisNaam;

    // p/m1 of p/m2: lengte + breedte + dikte
    if ((eenheid === 'p/m1' || eenheid === 'p/m2') && lengte !== null && breedte !== null && dikte !== null) {
      materiaalnaam = `${basisNaam} ${lengte} x ${breedte} x ${dikte}${unit}`;
    }

    // p/m3: lengte + breedte + hoogte
    if (eenheid === 'p/m3' && lengte !== null && breedte !== null && hoogte !== null) {
      materiaalnaam = `${basisNaam} ${lengte} x ${breedte} x ${hoogte}${unit}`;
    }

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
      // ✅ dit zie je letterlijk in Firebase runtime logs
      console.error('N8N FOUT', {
        n8nUrl,
        status: res.status,
        body: txt?.slice(0, 2000),
      });

      return NextResponse.json(
        { ok: false, message: 'n8n webhook faalde', status: res.status, body: txt },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('UPSERT ROUTE FOUT', e);
    return NextResponse.json({ ok: false, message: e?.message || 'Onbekende serverfout' }, { status: 500 });
  }
}
