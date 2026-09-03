import { resolveQuoteProjectAddress } from '@/lib/maps';
import { gpsClientNameFromInfo, isExcludedGpsClientName } from '@/lib/gps-excluded-clients';

export interface TrackingPoint {
  id: string;
  latitude: number;
  longitude: number;
  speed_kmh?: number | null;
  recorded_at: string;
  address?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  city?: string | null;
}

export interface TrackingStop {
  id: string;
  start: string;
  end: string;
  durationMinutes: number;
  point: TrackingPoint;
}

export interface QuoteWithAddress {
  id: string;
  klantinformatie?: Record<string, unknown> | null;
}

export interface ClientTimeSummary {
  workedMinutes: number;
  driveMinutes: number;
}

function distanceBetweenKm(left: TrackingPoint, right: TrackingPoint): number {
  const earthRadiusKm = 6371;
  const lat1 = left.latitude * Math.PI / 180;
  const lat2 = right.latitude * Math.PI / 180;
  const deltaLat = (right.latitude - left.latitude) * Math.PI / 180;
  const deltaLon = (right.longitude - left.longitude) * Math.PI / 180;
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function positionText(point: TrackingPoint): string {
  return normalize([
    point.address,
    point.street,
    point.houseNumber,
    point.city,
  ].filter(Boolean).join(' '));
}

export function matchTrackingPointToQuoteId(point: TrackingPoint, quotes: QuoteWithAddress[]): string | null {
  const location = positionText(point);
  if (!location) return null;

  for (const quote of quotes) {
    if (isExcludedGpsClientName(gpsClientNameFromInfo(quote.klantinformatie))) continue;
    const address = normalize(resolveQuoteProjectAddress(quote));
    const info = quote.klantinformatie || {};
    const candidates = [
      { street: info.projectStraat, number: info.projectHuisnummer, city: info.projectPlaats },
      { street: info.straat, number: info.huisnummer, city: info.plaats },
    ];
    const fieldsMatch = candidates.some((candidate) => {
      const street = normalize(String(candidate.street ?? '')).split(' ').filter(Boolean);
      const houseNumber = normalize(String(candidate.number ?? ''));
      const city = normalize(String(candidate.city ?? ''));
      const streetMatches = street.length > 0 && street.every((word) => location.includes(word));
      const numberMatches = houseNumber.length > 0 && location.includes(houseNumber);
      const cityMatches = city.length > 0 && location.includes(city);
      return (streetMatches && numberMatches) || (streetMatches && cityMatches);
    });
    if (fieldsMatch || (address && location.includes(address))) {
      return quote.id;
    }
  }

  return null;
}

export function detectTrackingStops(points: TrackingPoint[]): TrackingStop[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort(
    (left, right) => new Date(left.recorded_at).getTime() - new Date(right.recorded_at).getTime(),
  );
  const stops: TrackingStop[] = [];
  let startIndex: number | null = null;

  const flush = (endIndex: number) => {
    if (startIndex === null) return;
    const start = sorted[startIndex];
    const end = sorted[endIndex];
    const durationMinutes = Math.max(
      0,
      (new Date(end.recorded_at).getTime() - new Date(start.recorded_at).getTime()) / 60_000,
    );
    if (durationMinutes >= 8) {
      stops.push({
        id: `${start.id}-${end.id}`,
        start: start.recorded_at,
        end: end.recorded_at,
        durationMinutes,
        point: sorted[Math.floor((startIndex + endIndex) / 2)],
      });
    }
    startIndex = null;
  };

  sorted.forEach((point, index) => {
    const previous = sorted[index - 1];
    const distance = previous ? distanceBetweenKm(previous, point) : 0;
    const speed = point.speed_kmh ?? 0;
    const stationary = speed <= 7 && distance <= 0.08;
    if (stationary && startIndex === null) startIndex = index;
    if (!stationary && startIndex !== null) flush(index - 1);
  });
  if (startIndex !== null) flush(sorted.length - 1);

  return stops
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())
    .filter((stop, index, all) => (
      index === 0
      || new Date(stop.start).getTime() - new Date(all[index - 1].end).getTime() > 2 * 60_000
    ));
}

export function getClientTimeSummaries(
  stops: TrackingStop[],
  quotes: QuoteWithAddress[],
): Record<string, ClientTimeSummary> {
  const matchedStops = stops.map((stop) => ({
    ...stop,
    quoteId: matchTrackingPointToQuoteId(stop.point, quotes),
  }));
  const result: Record<string, ClientTimeSummary> = {};

  matchedStops.forEach((stop) => {
    if (!stop.quoteId) return;
    const current = result[stop.quoteId] || { workedMinutes: 0, driveMinutes: 0 };
    current.workedMinutes += stop.durationMinutes;
    result[stop.quoteId] = current;
  });

  for (let index = 0; index < matchedStops.length - 1; index += 1) {
    const current = matchedStops[index];
    const next = matchedStops[index + 1];
    const gapMinutes = Math.max(
      0,
      (new Date(next.start).getTime() - new Date(current.end).getTime()) / 60_000,
    );
    if (gapMinutes <= 0 || gapMinutes > 240) continue;

    const quoteId = next.quoteId || current.quoteId;
    if (!quoteId) continue;
    const summary = result[quoteId] || { workedMinutes: 0, driveMinutes: 0 };
    summary.driveMinutes += gapMinutes;
    result[quoteId] = summary;
  }

  Object.values(result).forEach((summary) => {
    summary.workedMinutes = Math.round(summary.workedMinutes);
    summary.driveMinutes = Math.round(summary.driveMinutes);
  });
  return result;
}
