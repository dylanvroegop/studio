// BESTAND: src/app/api/materialen/delete/route.ts
//
// DOEL:
// - Frontend stuurt { row_id: "uuid" } + Bearer Firebase token
// - Deze route verifieert token -> uid
// - Deze route roept n8n webhook aan met { uid, row_id }
// - n8n delete vervolgens de rij (bij voorkeur met extra check gebruikerid == uid)
//
// BELANGRIJK:
// - Je gebruikt GEEN .env.local. Dit werkt op Firebase App Hosting via apphosting.yaml env vars.

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

function isUuid(v: string): boolean {
  // UUID v4-ish check (genoeg strikt voor row_id)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
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
 * 1) Als N8N_MATERIALEN_DELETE_URL bestaat -> gebruik die.
 * 2) Anders: deriveer uit N8N_WEBHOOK_URL (die werkt al bij generate).
 *    Voorbeeld:
 *    https://n8n.dylan8n.org/webhook-test/offerte-test
 *    -> https://n8n.dylan8n.org/webhook-test/materialen-delete
 */
function bepaalN8nUrlVoorMaterialenDelete(): string {
    const direct = process.env.N8N_MATERIALEN_DELETE_URL;
    if (direct && direct.trim()) return direct.trim();
  
    // HARD FAIL -> geen fallback naar webhook-test
    throw new Error(
      'ENV ontbreekt: N8N_MATERIALEN_DELETE_URL (geen fallback toegestaan). ' +
      `N8N_WEBHOOK_URL=${process.env.N8N_WEBHOOK_URL || '(leeg)'}`
    );
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

    const secret = process.env.N8N_HEADER_SECRET;
    if (!secret || !secret.trim()) throw new Error('ENV ontbreekt: N8N_HEADER_SECRET');

    const n8nUrl = bepaalN8nUrlVoorMaterialenDelete();

    // 1) UID server-side bepalen
    const uid = await bepaalUid(req);

    // 2) row_id uit request body
    const row_id = normalizeString(body.row_id) || normalizeString(body.rowId);
    if (!row_id) {
      return NextResponse.json(
        { ok: false, message: 'row_id is verplicht' },
        { status: 400 }
      );
    }
    if (!isUuid(row_id)) {
      return NextResponse.json(
        { ok: false, message: 'row_id is geen geldige UUID' },
        { status: 400 }
      );
    }

    // 3) Call n8n
    const payload = { uid, row_id };

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

    // n8n kan JSON of tekst teruggeven
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
