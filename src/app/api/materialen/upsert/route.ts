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
  // Verwacht: Authorization: Bearer <firebaseIdToken>
  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error('Geen Bearer token in Authorization header');

  const token = match[1];

  const app = krijgFirebaseAdminApp();
  const decoded = await app.auth().verifyIdToken(token);
  if (!decoded?.uid) throw new Error('UID ontbreekt in token');
  return decoded.uid;
}

export async function POST(req: Request) {
  try {
    const body = await leesBodyVeilig(req);
    if (!body) {
      return NextResponse.json({ ok: false, message: 'Body is geen geldige JSON' }, { status: 400 });
    }

    if (!process.env.N8N_MATERIALEN_UPSERT_URL) {
      throw new Error('ENV ontbreekt: N8N_MATERIALEN_UPSERT_URL');
    }
    if (!process.env.N8N_HEADER_SECRET) {
      throw new Error('ENV ontbreekt: N8N_HEADER_SECRET');
    }

    // 1) UID server-side bepalen (niet vertrouwen op client)
    const uid = await bepaalUid(req);

    // 2) Input uit modal
    const basisNaam = normalizeString(body.materiaalnaam);
    const eenheid = normalizeString(body.eenheid);
    const prijs = toNumber(body.prijs);

    const categorie = normalizeString(body.categorie) || normalizeString(body.subsectie) || 'Overig';
    const leverancier = normalizeString(body.leverancier) || null;

    // afmetingen optioneel (zoals in jouw screenshot)
    const lengte = toNumber(body.lengte);
    const breedte = toNumber(body.breedte);
    const dikte = toNumber(body.dikte);
    const unit = normalizeString(body.unit) || 'mm';

    if (!basisNaam) return NextResponse.json({ ok: false, message: 'Materiaalnaam is verplicht' }, { status: 400 });
    if (!eenheid) return NextResponse.json({ ok: false, message: 'Eenheid is verplicht' }, { status: 400 });
    if (prijs === null) return NextResponse.json({ ok: false, message: 'Prijs is ongeldig' }, { status: 400 });

    // Maak dezelfde "wordt opgeslagen als ..." naam als jouw UI (alleen als afmetingen compleet zijn)
    let materiaalnaam = basisNaam;
    const heeftAfm = lengte !== null && breedte !== null && dikte !== null;
    if (heeftAfm) {
      materiaalnaam = `${basisNaam} ${lengte} x ${breedte} x ${dikte}${unit}`;
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

    // 3) Call n8n
    const res = await fetch(process.env.N8N_MATERIALEN_UPSERT_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-offertehulp-secret': process.env.N8N_HEADER_SECRET,
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
