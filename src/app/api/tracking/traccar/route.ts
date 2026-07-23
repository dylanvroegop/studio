import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TraccarDevice = {
  id?: number;
  name?: string;
  uniqueId?: string;
};

type TraccarPosition = {
  id?: number;
  deviceId?: number;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  speed?: number;
  deviceTime?: string;
  fixTime?: string;
  serverTime?: string;
  [key: string]: unknown;
};

type TraccarApiPosition = TraccarPosition & {
  id: number;
  deviceId: number;
  latitude: number;
  longitude: number;
};

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
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

function getTraccarConfig(): { serverUrl: string; apiToken: string; deviceIdentifier: string } | null {
  const apiToken = process.env.TRACCAR_API_TOKEN?.trim();
  const deviceIdentifier = process.env.TRACCAR_DEVICE_IDENTIFIER?.trim();
  if (!apiToken || !deviceIdentifier) return null;

  const serverUrl = (process.env.TRACCAR_SERVER_URL || 'https://demo.traccar.org').replace(/\/$/, '');
  return { serverUrl, apiToken, deviceIdentifier };
}

async function traccarGet<T>(serverUrl: string, apiToken: string, path: string): Promise<T> {
  const response = await fetch(`${serverUrl}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Traccar gaf HTTP ${response.status}. Controleer de server en token.`);
  }

  return response.json() as Promise<T>;
}

async function getConfiguredDevice(config: { serverUrl: string; apiToken: string; deviceIdentifier: string }): Promise<TraccarDevice> {
  const devices = await traccarGet<TraccarDevice[]>(
    config.serverUrl,
    config.apiToken,
    `/api/devices?uniqueId=${encodeURIComponent(config.deviceIdentifier)}`,
  );
  const device = devices.find((candidate) => candidate.uniqueId === config.deviceIdentifier);
  if (!device?.id) throw new Error(`Traccar-device ${config.deviceIdentifier} is niet gevonden.`);
  return device;
}

function getDateRange(request: Request): { from: string; to: string } | { message: string } {
  const url = new URL(request.url);
  const from = url.searchParams.get('from')?.trim();
  const to = url.searchParams.get('to')?.trim();
  if (!from || !to) return { message: 'from en to zijn verplicht.' };

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate >= toDate) {
    return { message: 'from en to zijn ongeldig.' };
  }

  const maximumRangeMs = 48 * 60 * 60 * 1000;
  if (toDate.getTime() - fromDate.getTime() > maximumRangeMs) {
    return { message: 'De maximale periode is 48 uur.' };
  }

  return { from: fromDate.toISOString(), to: toDate.toISOString() };
}

function isValidCoordinate(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function getRecordedAt(position: TraccarPosition): string {
  const value = position.deviceTime || position.fixTime || position.serverTime;
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function toClientPosition(position: TraccarApiPosition, deviceIdentifier: string): TrackingPosition {
  const speedKmh = typeof position.speed === 'number' && Number.isFinite(position.speed)
    ? Math.max(0, position.speed * 1.852)
    : null;

  return {
    id: String(position.id),
    device_id: deviceIdentifier,
    latitude: position.latitude,
    longitude: position.longitude,
    accuracy_m: typeof position.accuracy === 'number' && Number.isFinite(position.accuracy) ? position.accuracy : null,
    speed_kmh: speedKmh,
    recorded_at: getRecordedAt(position),
    source: 'traccar',
    raw_payload: position,
  };
}

type TrackingPosition = {
  id: string;
  device_id: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  speed_kmh: number | null;
  recorded_at: string;
  source: string;
  raw_payload: Record<string, unknown>;
};

export async function GET(request: Request) {
  try {
    const access = await ensureUser(request);
    if (access instanceof NextResponse) return access;

    const config = getTraccarConfig();
    if (!config) {
      return NextResponse.json(
        { ok: false, message: 'Traccar is nog niet geconfigureerd op deze server.' },
        { status: 503 },
      );
    }

    const range = getDateRange(request);
    if ('message' in range) return NextResponse.json({ ok: false, message: range.message }, { status: 400 });

    const device = await getConfiguredDevice(config);
    const query = new URLSearchParams({
      deviceId: String(device.id),
      from: range.from,
      to: range.to,
    });
    const positions = await traccarGet<TraccarApiPosition[]>(
      config.serverUrl,
      config.apiToken,
      `/api/positions?${query.toString()}`,
    );

    const validPositions = positions
      .filter((position) => (
        isValidCoordinate(position.latitude, -90, 90)
        && isValidCoordinate(position.longitude, -180, 180)
        && typeof position.id === 'number'
      ))
      .sort((left, right) => getRecordedAt(left).localeCompare(getRecordedAt(right)))
      .map((position) => toClientPosition(position, config.deviceIdentifier));

    return NextResponse.json({
      ok: true,
      data: validPositions,
      device: { id: device.id, name: device.name, uniqueId: device.uniqueId },
      range,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Traccar-dagdata kon niet worden opgehaald.';
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await ensureUser(request);
    if (access instanceof NextResponse) return access;

    const config = getTraccarConfig();
    if (!config) {
      return NextResponse.json(
        { ok: false, message: 'Traccar is nog niet geconfigureerd op deze server.' },
        { status: 503 },
      );
    }

    const device = await getConfiguredDevice(config);

    const positions = await traccarGet<TraccarPosition[]>(
      config.serverUrl,
      config.apiToken,
      `/api/positions?deviceId=${device.id}`,
    );
    const position = positions
      .filter((candidate) => isValidCoordinate(candidate.latitude, -90, 90) && isValidCoordinate(candidate.longitude, -180, 180))
      .sort((left, right) => getRecordedAt(right).localeCompare(getRecordedAt(left)))[0];

    if (!position || !isValidCoordinate(position.latitude, -90, 90) || !isValidCoordinate(position.longitude, -180, 180)) {
      return NextResponse.json(
        { ok: false, message: 'Traccar heeft nog geen geldige positie voor dit device.' },
        { status: 404 },
      );
    }

    const speedKmh = typeof position.speed === 'number' && Number.isFinite(position.speed)
      ? Math.max(0, position.speed * 1.852)
      : null;

    const payload = {
      user_id: access.uid,
      device_id: config.deviceIdentifier,
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy_m: typeof position.accuracy === 'number' && Number.isFinite(position.accuracy) ? position.accuracy : null,
      speed_kmh: speedKmh,
      recorded_at: getRecordedAt(position),
      source: 'traccar',
      raw_payload: position,
    };

    const { data, error } = await supabaseAdmin
      .from('tracking_positions')
      .insert(payload)
      .select('*')
      .limit(1);

    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });

    const inserted = Array.isArray(data) ? data[0] : null;
    if (!inserted) return NextResponse.json({ ok: false, message: 'Kon Traccar-positie niet opslaan.' }, { status: 500 });

    return NextResponse.json({
      ok: true,
      data: inserted,
      device: { id: device.id, name: device.name, uniqueId: device.uniqueId },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Traccar-positie ophalen mislukt.';
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}
