const DEFAULT_N8N_DISTANCE_WEBHOOK_URL =
  'https://n8n.srv1553475.hstgr.cloud/webhook/93f03b58-6688-4f2b-8275-49799202b792';
const DISTANCE_WEBHOOK_TIMEOUT_MS = 25_000;
const GOOGLE_DISTANCE_TIMEOUT_MS = 15_000;

function getWebhookUrl(): string {
  return (
    process.env.N8N_DISTANCE_WEBHOOK_URL
    || process.env.NEXT_PUBLIC_N8N_DISTANCE_WEBHOOK_URL
    || DEFAULT_N8N_DISTANCE_WEBHOOK_URL
  ).trim();
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

async function getGoogleDistance(input: {
  originAddress: string;
  destinationAddress: string;
}): Promise<{
  distanceKmOneWay: number;
  distanceKmRoundTrip: number;
  durationMinOneWay: number;
  raw: Record<string, unknown>;
}> {
  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY?.trim()
    || process.env.GOOGLE_API_KEY?.trim()
    || process.env.ANTIGRAVITY_GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is niet geconfigureerd.');
  }

  const params = new URLSearchParams({
    origins: input.originAddress,
    destinations: input.destinationAddress,
    mode: 'driving',
    units: 'metric',
    language: 'nl',
    region: 'nl',
    key: apiKey,
  });

  let response: Response;
  try {
    response = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`, {
      signal: AbortSignal.timeout(GOOGLE_DISTANCE_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('Google Distance Matrix timeout.');
    }
    const message = error instanceof Error ? error.message : 'Onbekende Google Maps-fout';
    throw new Error(`Google Distance Matrix niet bereikbaar: ${message}`);
  }

  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) {
    throw new Error(`Google Distance Matrix HTTP ${response.status}.`);
  }
  if (!payload || payload.status !== 'OK') {
    throw new Error(`Google Distance Matrix mislukt: ${payload?.error_message || payload?.status || 'geen geldige response'}.`);
  }

  const element = payload.rows?.[0]?.elements?.[0];
  if (!element || element.status !== 'OK') {
    throw new Error(`Google Distance Matrix route mislukt: ${element?.status || 'geen route gevonden'}.`);
  }

  const meters = Number(element.distance?.value || 0);
  const seconds = Number(element.duration?.value || 0);
  const distanceKmOneWay = meters > 0 ? meters / 1000 : 0;
  const durationMinOneWay = seconds > 0 ? Math.round(seconds / 60) : 0;
  if (distanceKmOneWay <= 0) {
    throw new Error('Google Distance Matrix gaf geen geldige afstand terug.');
  }

  return {
    distanceKmOneWay,
    distanceKmRoundTrip: distanceKmOneWay * 2,
    durationMinOneWay,
    raw: {
      provider: 'google_distance_matrix',
      status: payload.status,
      originAddress: input.originAddress,
      destinationAddress: input.destinationAddress,
      distanceText: element.distance?.text || '',
      durationText: element.duration?.text || '',
    },
  };
}

function extractResult(payload: unknown): Record<string, unknown> {
  if (Array.isArray(payload) && payload.length > 0 && payload[0] && typeof payload[0] === 'object') {
    return payload[0] as Record<string, unknown>;
  }
  if (payload && typeof payload === 'object') {
    const row = payload as Record<string, unknown>;
    const nestedCandidates = [
      row.data,
      row.result,
      row.output,
      row.body,
      row.json,
      row.response,
    ];
    for (const candidate of nestedCandidates) {
      if (candidate && typeof candidate === 'object') {
        const nested = extractResult(candidate);
        if (Object.keys(nested).length > 0) return nested;
      }
      if (typeof candidate === 'string') {
        try {
          const nested = extractResult(JSON.parse(candidate));
          if (Object.keys(nested).length > 0) return nested;
        } catch {
          // keep original payload
        }
      }
    }
    return row;
  }
  return {};
}

export class DrivingDistanceError extends Error {
  constructor(message: string, readonly status = 502, readonly raw?: Record<string, unknown>) {
    super(message);
  }
}

export async function getDrivingDistance(input: {
  originAddress: string;
  destinationAddress: string;
  quoteId: string;
  userId: string;
  manualQuote: boolean;
}) {
  const { originAddress, destinationAddress, quoteId, userId, manualQuote } = input;
  const hasGoogleApiKey = Boolean(
    process.env.GOOGLE_GEOCODING_API_KEY?.trim()
    || process.env.GOOGLE_API_KEY?.trim()
    || process.env.ANTIGRAVITY_GOOGLE_API_KEY?.trim()
  );
  if (hasGoogleApiKey) {
    try {
      return await getGoogleDistance({ originAddress, destinationAddress });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google Distance Matrix mislukt';
      // Een ingestelde sleutel kan geen toegang hebben tot Distance Matrix.
      // Probeer dan de bestaande n8n-route voordat de berekening faalt.
      console.warn('Google Distance Matrix mislukt; probeer n8n:', message);
    }
  }

  const webhookUrl = getWebhookUrl();
  const webhookSecret = process.env.N8N_HEADER_SECRET?.trim();

  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISTANCE_WEBHOOK_TIMEOUT_MS);
  try {
    response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(webhookSecret ? { 'x-offertehulp-secret': webhookSecret } : {}),
      },
      signal: controller.signal,
      cache: 'no-store',
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
    if (error instanceof Error && error.name === 'AbortError') {
      throw new DrivingDistanceError('Distance webhook timeout. Probeer opnieuw.', 504);
    }
    const message = error instanceof Error ? error.message : 'Onbekende fetch-fout';
    throw new DrivingDistanceError(`Distance webhook niet bereikbaar: ${message}`);
  } finally {
    clearTimeout(timeout);
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
    throw new DrivingDistanceError(`Distance webhook mislukt (n8n ${response.status})${detail ? `: ${detail}` : ''}`);
  }

  let parsedPayload: unknown = responseText;
  try {
    parsedPayload = JSON.parse(responseText);
  } catch {
    // Keep plain text.
  }

  const result = extractResult(parsedPayload);
  let distanceKmOneWay = toNumber(
    result.distanceKmOneWay
    ?? result.distanceKm
    ?? result.distance_km_one_way
    ?? result.distance_km
  );
  let distanceKmRoundTrip = toNumber(
    result.distanceKmRoundTrip
    ?? result.roundTripDistanceKm
    ?? result.distance_km_round_trip
    ?? (distanceKmOneWay * 2)
  );
  const durationMinOneWay = parseDurationMinutes(
    result.durationMinOneWay
    ?? result.durationMinutes
    ?? result.durationMin
    ?? result.duration_min
    ?? result.duration_min_one_way
    ?? result.durationText
    ?? result.duration
  );

  if (distanceKmOneWay <= 0 && distanceKmRoundTrip <= 0) {
    throw new DrivingDistanceError('Distance webhook gaf geen geldige afstand terug.', 502, result);
  }

  if (distanceKmOneWay <= 0) distanceKmOneWay = distanceKmRoundTrip / 2;
  if (distanceKmRoundTrip <= 0) distanceKmRoundTrip = distanceKmOneWay * 2;

  return { distanceKmOneWay, distanceKmRoundTrip, durationMinOneWay, raw: result };
}
