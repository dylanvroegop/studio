import { createHash } from 'node:crypto';

import { resolveQuoteProjectAddress } from '@/lib/maps';
import { detectTrackingStops, matchTrackingPointToQuoteId, type QuoteWithAddress, type TrackingPoint } from '@/lib/tracking-analysis';
import { supabaseAdmin } from '@/lib/supabase-admin';

const AMSTERDAM_TIMEZONE = 'Europe/Amsterdam';

interface TraccarConfig { serverUrl: string; apiToken: string; deviceIdentifier: string }
interface Device { id?: number; uniqueId?: string }
interface Position { id?: number; latitude?: number; longitude?: number; speed?: number; deviceTime?: string; fixTime?: string; serverTime?: string }
interface QuoteLocation extends QuoteWithAddress { quoteId: string; address: string; priority: number; quoteNumber: number }

function config(): TraccarConfig {
  const apiToken = process.env.TRACCAR_API_TOKEN?.trim();
  const deviceIdentifier = process.env.TRACCAR_DEVICE_IDENTIFIER?.trim();
  if (!apiToken || !deviceIdentifier) throw new Error('Traccar is niet geconfigureerd.');
  return { serverUrl: (process.env.TRACCAR_SERVER_URL || '').replace(/\/$/, ''), apiToken, deviceIdentifier };
}

async function traccarGet<T>(value: TraccarConfig, path: string): Promise<T> {
  const response = await fetch(`${value.serverUrl}${path}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${value.apiToken}` }, cache: 'no-store' });
  if (!response.ok) throw new Error(`Traccar gaf HTTP ${response.status}.`);
  return response.json() as Promise<T>;
}

function localTime(value: string): string {
  return new Intl.DateTimeFormat('nl-NL', { timeZone: AMSTERDAM_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

function dayRange(dateOnly: string): { from: string; to: string } {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12));
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: AMSTERDAM_TIMEZONE, timeZoneName: 'longOffset' }).formatToParts(noonUtc).find((part) => part.type === 'timeZoneName')?.value || 'GMT+01:00';
  const match = offset.match(/GMT([+-])(\d{2}):(\d{2})/);
  const minutes = match ? (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3])) : 60;
  const from = new Date(Date.UTC(year, month - 1, day) - minutes * 60_000);
  const nextNoon = new Date(Date.UTC(year, month - 1, day + 1, 12));
  const nextOffset = new Intl.DateTimeFormat('en-US', { timeZone: AMSTERDAM_TIMEZONE, timeZoneName: 'longOffset' }).formatToParts(nextNoon).find((part) => part.type === 'timeZoneName')?.value || offset;
  const nextMatch = nextOffset.match(/GMT([+-])(\d{2}):(\d{2})/);
  const nextMinutes = nextMatch ? (nextMatch[1] === '+' ? 1 : -1) * (Number(nextMatch[2]) * 60 + Number(nextMatch[3])) : minutes;
  return { from: from.toISOString(), to: new Date(Date.UTC(year, month - 1, day + 1) - nextMinutes * 60_000).toISOString() };
}

async function reverseGeocode(point: TrackingPoint): Promise<TrackingPoint> {
  const key = process.env.GOOGLE_GEOCODING_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || process.env.ANTIGRAVITY_GOOGLE_API_KEY?.trim();
  if (!key) return point;
  const params = new URLSearchParams({ latlng: `${point.latitude},${point.longitude}`, language: 'nl', region: 'nl', key });
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, { cache: 'force-cache' }).catch(() => null);
  if (!response?.ok) return point;
  const payload = await response.json().catch(() => null) as { status?: string; error_message?: string; results?: Array<{ formatted_address?: string; address_components?: Array<{ long_name?: string; types?: string[] }> }> } | null;
  if (payload?.status && payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
    throw new Error(payload.error_message || `Google Geocoding gaf ${payload.status}.`);
  }
  const result = payload?.results?.[0];
  const component = (type: string) => result?.address_components?.find((item) => item.types?.includes(type))?.long_name || null;
  return {
    ...point,
    address: result?.formatted_address || null,
    street: component('route'),
    houseNumber: component('street_number'),
    city: component('locality') || component('postal_town') || component('administrative_area_level_2'),
  };
}

async function quoteLocations(firestore: FirebaseFirestore.Firestore, uid: string): Promise<QuoteLocation[]> {
  const snapshot = await firestore.collection('quotes').where('userId', '==', uid).get();
  const output: QuoteLocation[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (data.archived === true) continue;
    const status = String(data.status || '').toLowerCase();
    const priority = status === 'geaccepteerd' || status === 'accepted' ? 3 : status === 'verzonden' || status === 'sent' ? 2 : 1;
    const quoteNumber = Number(data.offerteNummer) || 0;
    const address = resolveQuoteProjectAddress({
      klantinformatie: data.klantinformatie as NonNullable<Parameters<typeof resolveQuoteProjectAddress>[0]>['klantinformatie'],
    });
    if (address) output.push({ quoteId: doc.id, id: doc.id, address, klantinformatie: data.klantinformatie as QuoteWithAddress['klantinformatie'], priority, quoteNumber });
  }
  return output.sort((left, right) => right.priority - left.priority || right.quoteNumber - left.quoteNumber);
}

function deterministicId(uid: string, quoteId: string, date: string): string {
  const bytes = createHash('sha256').update(`gps_tracking_auto:${uid}:${quoteId}:${date}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function syncGpsHoursForDates(firestore: FirebaseFirestore.Firestore, uid: string, dates: string[]) {
  const value = config();
  const devices = await traccarGet<Device[]>(value, `/api/devices?uniqueId=${encodeURIComponent(value.deviceIdentifier)}`);
  const device = devices.find((item) => item.uniqueId === value.deviceIdentifier && item.id);
  if (!device?.id) throw new Error('Traccar-device niet gevonden.');
  const quotes = await quoteLocations(firestore, uid);
  let synced = 0; let skipped = 0; let detectedStops = 0; let matchedStops = 0;
  for (const date of dates) {
    const range = dayRange(date);
    const query = new URLSearchParams({ deviceId: String(device.id), from: range.from, to: range.to });
    const raw = await traccarGet<Position[]>(value, `/api/positions?${query}`);
    const points = raw.map((position): TrackingPoint | null => {
      const recordedAt = position.deviceTime || position.fixTime || position.serverTime;
      if (!position.id || !recordedAt || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) return null;
      return { id: String(position.id), latitude: position.latitude!, longitude: position.longitude!, speed_kmh: Number.isFinite(position.speed) ? position.speed! * 1.852 : null, recorded_at: recordedAt };
    }).filter((point): point is TrackingPoint => point !== null);
    const visits = new Map<string, ReturnType<typeof detectTrackingStops>>();
    const dayStops = detectTrackingStops(points);
    detectedStops += dayStops.length;
    for (const stop of dayStops) {
      const enrichedPoint = await reverseGeocode(stop.point);
      const textQuoteId = matchTrackingPointToQuoteId(enrichedPoint, quotes);
      const match = quotes.find((quote) => quote.quoteId === textQuoteId);
      if (!match) continue;
      matchedStops += 1;
      visits.set(match.quoteId, [...(visits.get(match.quoteId) || []), stop]);
    }
    const quoteIds = Array.from(visits.keys());
    if (!quoteIds.length) continue;
    const { data: manualRows, error: manualError } = await supabaseAdmin.from('time_entries').select('quote_id').eq('user_id', uid).eq('work_date', date).in('quote_id', quoteIds).neq('source', 'gps_tracking_auto');
    if (manualError) throw new Error(manualError.message);
    const manuallyBooked = new Set((manualRows || []).map((row) => String(row.quote_id)));
    const rows = Array.from(visits.entries()).filter(([quoteId]) => !manuallyBooked.has(quoteId)).map(([quoteId, stops]) => {
      const minutes = Math.round(stops.reduce((sum, stop) => sum + stop.durationMinutes, 0));
      return { id: deterministicId(uid, quoteId, date), user_id: uid, quote_id: quoteId, work_date: date, worked_hours: Number((minutes / 60).toFixed(2)), worked_days: Number((minutes / 480).toFixed(2)), source: 'gps_tracking_auto', note: `Automatisch gekoppeld via GPS (${stops.length} bezoek${stops.length === 1 ? '' : 'en'})`, start_time: localTime(stops[0].start), end_time: localTime(stops[stops.length - 1].end), exact_minutes: minutes, rounding_rule: 'GPS-klantlocatie binnen 100 meter', updated_at: new Date().toISOString() };
    }).filter((row) => row.exact_minutes >= 8);
    skipped += manuallyBooked.size;
    if (rows.length) {
      const desiredIds = new Set(rows.map((row) => row.id));
      const { data: currentAutoRows, error: currentAutoError } = await supabaseAdmin
        .from('time_entries').select('id').eq('user_id', uid).eq('work_date', date).eq('source', 'gps_tracking_auto');
      if (currentAutoError) throw new Error(currentAutoError.message);
      const staleIds = (currentAutoRows || []).map((row) => String(row.id)).filter((id) => !desiredIds.has(id));
      if (staleIds.length) {
        const { error: deleteError } = await supabaseAdmin.from('time_entries').delete().eq('user_id', uid).in('id', staleIds);
        if (deleteError) throw new Error(deleteError.message);
      }
      const { error } = await supabaseAdmin.from('time_entries').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      synced += rows.length;
    }
  }
  return { synced, skipped, dates: dates.length, quotes: quotes.length, detectedStops, matchedStops };
}

export function dateSequence(from: string, to: string): string[] {
  const dates: string[] = []; const cursor = new Date(`${from}T12:00:00Z`); const end = new Date(`${to}T12:00:00Z`);
  while (cursor <= end) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); }
  return dates;
}
