import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Point = {
  id: string;
  latitude: number;
  longitude: number;
};

type GeocodeResult = {
  id: string;
  address: string | null;
  street: string | null;
  houseNumber: string | null;
  city: string | null;
};

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function component(
  components: Array<{ long_name?: string; types?: string[] }>,
  type: string,
): string | null {
  const item = components.find((candidate) => candidate.types?.includes(type));
  return item?.long_name?.trim() || null;
}

async function ensureUser(request: Request): Promise<NextResponse | { uid: string }> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

  const { auth } = initFirebaseAdmin();
  const decoded = await auth.verifyIdToken(token).catch(() => null);
  if (!decoded?.uid) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

  const trialBlockedResponse = await ensureDemoTrialActiveByUid(decoded.uid);
  if (trialBlockedResponse) return trialBlockedResponse;
  return { uid: decoded.uid };
}

async function lookupPoint(point: Point, apiKey: string): Promise<GeocodeResult> {
  const params = new URLSearchParams({
    latlng: `${point.latitude},${point.longitude}`,
    language: 'nl',
    region: 'nl',
    key: apiKey,
  });

  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`, {
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => null) as {
      status?: string;
      results?: Array<{
        formatted_address?: string;
        address_components?: Array<{ long_name?: string; types?: string[] }>;
      }>;
    } | null;
    const result = payload?.results?.[0];
    const components = result?.address_components || [];
    const street = component(components, 'route');
    const houseNumber = component(components, 'street_number');
    const city = component(components, 'locality')
      || component(components, 'postal_town')
      || component(components, 'administrative_area_level_2');

    return {
      id: point.id,
      address: result?.formatted_address || null,
      street,
      houseNumber,
      city,
    };
  } catch {
    return { id: point.id, address: null, street: null, houseNumber: null, city: null };
  }
}

export async function POST(request: Request) {
  try {
    const access = await ensureUser(request);
    if (access instanceof NextResponse) return access;

    const body = await request.json().catch(() => null) as { points?: unknown } | null;
    const rawPoints = Array.isArray(body?.points) ? body.points : [];
    const points = rawPoints
      .map((point): Point | null => {
        if (!point || typeof point !== 'object') return null;
        const value = point as Record<string, unknown>;
        const latitude = Number(value.latitude);
        const longitude = Number(value.longitude);
        if (!value.id || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
        return { id: String(value.id), latitude, longitude };
      })
      .filter((point): point is Point => point !== null)
      .slice(0, 80);

    if (points.length === 0) return NextResponse.json({ ok: true, data: [] });

    const apiKey = process.env.GOOGLE_GEOCODING_API_KEY?.trim()
      || process.env.GOOGLE_API_KEY?.trim()
      || process.env.ANTIGRAVITY_GOOGLE_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ ok: false, message: 'Google Geocoding is niet geconfigureerd.' }, { status: 503 });

    const results: GeocodeResult[] = [];
    for (let index = 0; index < points.length; index += 8) {
      const batch = points.slice(index, index + 8);
      results.push(...await Promise.all(batch.map((point) => lookupPoint(point, apiKey))));
    }

    return NextResponse.json({ ok: true, data: results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Adressen konden niet worden opgehaald.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
