import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_N8N_DISTANCE_WEBHOOK_URL =
  'https://n8n.srv1553475.hstgr.cloud/webhook-test/93f03b58-6688-4f2b-8275-49799202b792';

function getWebhookUrl(): string {
  return (
    process.env.N8N_DISTANCE_WEBHOOK_URL
    || process.env.NEXT_PUBLIC_N8N_DISTANCE_WEBHOOK_URL
    || DEFAULT_N8N_DISTANCE_WEBHOOK_URL
  ).trim();
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseDurationMinutes(value: unknown): number {
  if (typeof value === 'number') return Math.max(0, Math.round(value));
  if (typeof value !== 'string') return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (trimmed.endsWith('s')) {
    const seconds = Number(trimmed.slice(0, -1));
    return Number.isFinite(seconds) ? Math.max(0, Math.round(seconds / 60)) : 0;
  }
  const numeric = Number(trimmed.replace(',', '.'));
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

function extractResult(payload: unknown): Record<string, unknown> {
  if (Array.isArray(payload) && payload.length > 0 && payload[0] && typeof payload[0] === 'object') {
    return payload[0] as Record<string, unknown>;
  }
  if (payload && typeof payload === 'object') return payload as Record<string, unknown>;
  return {};
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { auth } = initFirebaseAdmin();
    let userId = '';
    try {
      const decoded = await auth.verifyIdToken(token);
      userId = decoded.uid;
      const trialBlockedResponse = await ensureDemoTrialActiveByUid(decoded.uid);
      if (trialBlockedResponse) return trialBlockedResponse;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const rawBody = await request.json().catch(() => null) as {
      quoteId?: unknown;
      originAddress?: unknown;
      destinationAddress?: unknown;
      manualQuote?: unknown;
    } | null;

    const quoteId = typeof rawBody?.quoteId === 'string' ? rawBody.quoteId.trim() : '';
    const originAddress = typeof rawBody?.originAddress === 'string' ? rawBody.originAddress.trim() : '';
    const destinationAddress = typeof rawBody?.destinationAddress === 'string' ? rawBody.destinationAddress.trim() : '';
    const manualQuote = Boolean(rawBody?.manualQuote);

    if (!originAddress || !destinationAddress) {
      return NextResponse.json({ error: 'originAddress en destinationAddress zijn verplicht.' }, { status: 400 });
    }

    const webhookUrl = getWebhookUrl();
    const webhookSecret = process.env.N8N_HEADER_SECRET?.trim();

    let response: Response;
    try {
      response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(webhookSecret ? { 'x-offertehulp-secret': webhookSecret } : {}),
        },
        body: JSON.stringify({
          action: 'google_distance',
          originAddress,
          destinationAddress,
          quoteId,
          userId,
          userid: userId,
          manualQuote,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Onbekende fetch-fout';
      return NextResponse.json({ error: `Distance webhook niet bereikbaar: ${message}` }, { status: 502 });
    }

    const responseText = await response.text();
    if (!response.ok) {
      let detail = responseText.trim();
      try {
        const parsed = JSON.parse(responseText) as { message?: string; error?: string };
        detail = parsed.message || parsed.error || detail;
      } catch {
        // keep raw detail
      }
      return NextResponse.json({
        error: `Distance webhook mislukt (n8n ${response.status})${detail ? `: ${detail}` : ''}`,
      }, { status: 502 });
    }

    let parsedPayload: unknown = responseText;
    try {
      parsedPayload = JSON.parse(responseText);
    } catch {
      // Keep plain text.
    }

    const result = extractResult(parsedPayload);
    const distanceKmOneWay = toNumber(
      result.distanceKmOneWay
      ?? result.distanceKm
      ?? result.distance_km_one_way
      ?? result.distance_km
    );
    const distanceKmRoundTrip = toNumber(
      result.distanceKmRoundTrip
      ?? result.roundTripDistanceKm
      ?? result.distance_km_round_trip
      ?? (distanceKmOneWay * 2)
    );
    const durationMinOneWay = parseDurationMinutes(
      result.durationMinOneWay
      ?? result.durationMinutes
      ?? result.durationText
      ?? result.duration
    );

    return NextResponse.json({
      ok: true,
      quoteId,
      userId,
      originAddress,
      destinationAddress,
      distanceKmOneWay,
      distanceKmRoundTrip,
      durationMinOneWay,
      raw: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Distance genereren mislukt';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
