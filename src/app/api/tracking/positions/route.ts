import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isMissingRelationError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('does not exist')
    || lower.includes('relation')
    || lower.includes('not found')
    || lower.includes('schema cache')
    || lower.includes('could not find the table')
    || lower.includes('not find the table')
  );
}

async function getUid(request: Request): Promise<string | null> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) return null;

  const { auth } = initFirebaseAdmin();
  const decoded = await auth.verifyIdToken(token).catch(() => null);
  return decoded?.uid || null;
}

async function ensureUser(request: Request): Promise<{ uid: string } | NextResponse> {
  const uid = await getUid(request);
  if (!uid) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

  const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
  if (trialBlockedResponse) return trialBlockedResponse;

  return { uid };
}

function validatePosition(body: Record<string, unknown>): {
  deviceId: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  speedKmh: number | null;
  recordedAt: string;
} | { message: string } {
  const deviceId = safeString(body.deviceId || body.device_id);
  const latitude = safeNumber(body.latitude ?? body.lat);
  const longitude = safeNumber(body.longitude ?? body.lon ?? body.lng);
  const accuracyM = safeNumber(body.accuracyM ?? body.accuracy_m ?? body.accuracy);
  const speedKmh = safeNumber(body.speedKmh ?? body.speed_kmh ?? body.speed);
  const recordedAtRaw = safeString(body.recordedAt || body.recorded_at || body.timestamp);
  const recordedAtDate = recordedAtRaw ? new Date(recordedAtRaw) : new Date();

  if (!deviceId) return { message: 'deviceId is verplicht' };
  if (latitude === null || latitude < -90 || latitude > 90) {
    return { message: 'latitude is ongeldig' };
  }
  if (longitude === null || longitude < -180 || longitude > 180) {
    return { message: 'longitude is ongeldig' };
  }
  if (accuracyM !== null && accuracyM < 0) return { message: 'accuracyM is ongeldig' };
  if (speedKmh !== null && speedKmh < 0) return { message: 'speedKmh is ongeldig' };
  if (Number.isNaN(recordedAtDate.getTime())) return { message: 'recordedAt is ongeldig' };

  return {
    deviceId,
    latitude,
    longitude,
    accuracyM,
    speedKmh,
    recordedAt: recordedAtDate.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const access = await ensureUser(request);
    if (access instanceof NextResponse) return access;

    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get('limit') || 25);
    const limit = Math.min(100, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 25));

    const { data, error } = await supabaseAdmin
      .from('tracking_positions')
      .select('*')
      .eq('user_id', access.uid)
      // created_at is het moment waarop Calvora het punt ontving. Zo wordt
      // een oude GPS-tijd niet verborgen achter een nieuwere handmatige testregel.
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error && isMissingRelationError(error.message)) {
      return NextResponse.json(
        { ok: false, message: 'Tracking tabel ontbreekt. Voer de tracking-migratie uit.' },
        { status: 409 },
      );
    }
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Trackingposities laden mislukt.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await ensureUser(request);
    if (access instanceof NextResponse) return access;

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, message: 'Body ontbreekt' }, { status: 400 });

    const position = validatePosition(body);
    if ('message' in position) {
      return NextResponse.json({ ok: false, message: position.message }, { status: 400 });
    }

    const payload = {
      user_id: access.uid,
      device_id: position.deviceId,
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy_m: position.accuracyM,
      speed_kmh: position.speedKmh,
      recorded_at: position.recordedAt,
      source: safeString(body.source) || 'test',
      raw_payload: body,
    };

    const { data, error } = await supabaseAdmin
      .from('tracking_positions')
      .insert(payload)
      .select('*')
      .limit(1);

    if (error && isMissingRelationError(error.message)) {
      return NextResponse.json(
        { ok: false, message: 'Tracking tabel ontbreekt. Voer de tracking-migratie uit.' },
        { status: 409 },
      );
    }
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });

    const inserted = Array.isArray(data) ? data[0] : null;
    if (!inserted) return NextResponse.json({ ok: false, message: 'Kon trackingpositie niet opslaan.' }, { status: 500 });

    return NextResponse.json({ ok: true, data: inserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Trackingpositie opslaan mislukt.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
