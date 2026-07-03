import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GOOGLE_GEOCODING_TIMEOUT_MS = 12_000;

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function normalizePostcode(value: string): string {
  const clean = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (clean.length === 6) return `${clean.slice(0, 4)} ${clean.slice(4)}`;
  return clean;
}

function getAddressComponent(
  components: Array<{ long_name?: string; short_name?: string; types?: string[] }>,
  type: string,
): string {
  const component = components.find((item) => Array.isArray(item.types) && item.types.includes(type));
  return String(component?.long_name || component?.short_name || '').trim();
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { auth } = initFirebaseAdmin();
    try {
      const decoded = await auth.verifyIdToken(token);
      const trialBlockedResponse = await ensureDemoTrialActiveByUid(decoded.uid);
      if (trialBlockedResponse) return trialBlockedResponse;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as {
      straat?: unknown;
      huisnummer?: unknown;
      plaats?: unknown;
    } | null;
    const straat = typeof body?.straat === 'string' ? body.straat.trim() : '';
    const huisnummer = typeof body?.huisnummer === 'string' ? body.huisnummer.trim() : '';
    const plaats = typeof body?.plaats === 'string' ? body.plaats.trim() : '';

    if (!straat || !huisnummer || !plaats) {
      return NextResponse.json({ error: 'Straat, huisnummer en plaats zijn verplicht.' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_API_KEY?.trim()
      || process.env.ANTIGRAVITY_GOOGLE_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'GOOGLE_API_KEY is niet geconfigureerd.' }, { status: 500 });
    }

    const params = new URLSearchParams({
      address: `${straat} ${huisnummer}, ${plaats}, Nederland`,
      components: 'country:NL',
      language: 'nl',
      region: 'nl',
      key: apiKey,
    });

    let response: Response;
    try {
      response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`, {
        signal: AbortSignal.timeout(GOOGLE_GEOCODING_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        return NextResponse.json({ error: 'Adreslookup timeout.' }, { status: 504 });
      }
      return NextResponse.json({ error: 'Adreslookup niet bereikbaar.' }, { status: 502 });
    }

    const payload = await response.json().catch(() => null) as {
      status?: string;
      error_message?: string;
      results?: Array<{
        formatted_address?: string;
        address_components?: Array<{ long_name?: string; short_name?: string; types?: string[] }>;
      }>;
    } | null;

    if (!response.ok) {
      return NextResponse.json({ error: `Google Geocoding HTTP ${response.status}.` }, { status: 502 });
    }
    if (!payload || payload.status !== 'OK') {
      return NextResponse.json({
        error: payload?.error_message || payload?.status || 'Geen adres gevonden.',
      }, { status: 404 });
    }

    const result = payload.results?.[0];
    const components = result?.address_components || [];
    const postcode = normalizePostcode(getAddressComponent(components, 'postal_code'));
    const resolvedPlace =
      getAddressComponent(components, 'locality')
      || getAddressComponent(components, 'postal_town')
      || getAddressComponent(components, 'administrative_area_level_2')
      || plaats;

    if (!/^\d{4}\s?[A-Z]{2}$/.test(postcode)) {
      return NextResponse.json({ error: 'Geen geldige Nederlandse postcode gevonden.' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      postcode,
      plaats: resolvedPlace,
      formattedAddress: result?.formatted_address || '',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Adreslookup mislukt.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
