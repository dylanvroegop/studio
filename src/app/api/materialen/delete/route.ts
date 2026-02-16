/* eslint-disable @typescript-eslint/no-explicit-any */
// BESTAND: src/app/api/materialen/delete/route.ts
//
// DOEL:
// - Frontend stuurt { row_id: "uuid" } + Bearer Firebase token
// - Deze route verifieert token -> uid
// - Deze route verwijdert direct in Supabase (gebruikerid == uid)
//
// BELANGRIJK:
// - Je gebruikt GEEN .env.local. Dit werkt op Firebase App Hosting via apphosting.yaml env vars.

import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Firebase Admin via ADC (werkt op Firebase App Hosting) */
function krijgFirebaseAdminApp() {
  if (admin.apps.length > 0) return admin.app();
  const projectId =
    process.env.FIREBASE_PROJECT_ID
    || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    || 'studio-6011690104-60fbf';
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
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

async function hasOwnedMaterialRow(rowId: string, uid: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('main_material_list')
    .select('row_id')
    .eq('row_id', rowId)
    .eq('gebruikerid', uid)
    .maybeSingle();

  if (error) throw new Error(error.message || 'Kon materiaal niet valideren voor verwijderen.');
  return Boolean(data?.row_id);
}

async function deleteOwnedMaterialRow(rowId: string, uid: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('main_material_list')
    .delete()
    .eq('row_id', rowId)
    .eq('gebruikerid', uid)
    .select('row_id')
    .maybeSingle();

  if (error) throw new Error(error.message || 'Kon materiaal niet verwijderen.');
  return Boolean(data?.row_id);
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

    // 2.5) Enforce owner check server-side before calling n8n.
    const ownsRow = await hasOwnedMaterialRow(row_id, uid);
    if (!ownsRow) {
      return NextResponse.json(
        { ok: false, message: 'Materiaal niet gevonden of geen toegang.' },
        { status: 404 }
      );
    }

    // 3) Direct delete in Supabase
    const deleted = await deleteOwnedMaterialRow(row_id, uid);
    if (!deleted) {
      return NextResponse.json(
        { ok: false, message: 'Materiaal verwijderen mislukt of al verwijderd.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, row_id });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: e?.message || 'Onbekende serverfout' },
      { status: 500 }
    );
  }
}
