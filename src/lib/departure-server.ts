import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveQuoteProjectAddress } from '@/lib/maps';
import { type RouteEntry, type RouteOrigin, routeDate } from '@/lib/departure-planning';

export interface DepartureSettings {
  remindersEnabled: boolean;
  originDate: string;
  originAddress: string;
}

export async function readDepartureSettings(uid: string): Promise<DepartureSettings> {
  const data = (await initFirebaseAdmin().firestore.collection('departure_settings').doc(uid).get()).data();
  return { remindersEnabled: data?.remindersEnabled !== false,
    originDate: typeof data?.originDate === 'string' ? data.originDate : '',
    originAddress: typeof data?.originAddress === 'string' ? data.originAddress : '' };
}

export async function readRouteEntries(uid: string): Promise<RouteEntry[]> {
  const snapshot = await initFirebaseAdmin().firestore.collection('planning_entries').where('userId', '==', uid).get();
  const iso = (value: unknown): string => {
    const date = value && typeof (value as { toDate?: unknown }).toDate === 'function'
      ? (value as { toDate: () => Date }).toDate() : new Date(value as string);
    return Number.isFinite(date.getTime()) ? date.toISOString() : '';
  };
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return { id: doc.id, quoteId: String(data.quoteId || ''), start: iso(data.startDate), end: iso(data.endDate),
      status: String(data.status || 'scheduled'), planningType: data.planningType,
      isAllDay: data.isAllDay === true, isGoogleCalendarHistory: data.isGoogleCalendarHistory === true,
      parentEntryId: data.parentEntryId, clientName: String(data.cache?.clientName || data.cache?.projectTitle || 'Klant'),
      address: String(data.cache?.projectAddress || '').trim() };
  }).filter(entry => entry.start && entry.end);
}

export async function fillRouteAddress(uid: string, entry: RouteEntry): Promise<RouteEntry> {
  if (entry.address || !entry.quoteId) return entry;
  const quote = (await initFirebaseAdmin().firestore.collection('quotes').doc(entry.quoteId).get()).data();
  if (!quote || (quote.userId !== uid && quote.klantinformatie?.userId !== uid)) return entry;
  return { ...entry, address: resolveQuoteProjectAddress(quote) };
}

export function validRecentOrigin(point: {
  latitude?: unknown; longitude?: unknown; recordedAt?: string; accuracy?: unknown; valid?: boolean;
  speed?: number; attributes?: { motion?: boolean };
}, now: Date): RouteOrigin | null {
  const lat = point.latitude, lon = point.longitude, recorded = Date.parse(point.recordedAt || '');
  const stationary = point.attributes?.motion === false && (point.speed === undefined || point.speed === 0);
  const maximumAge = (stationary ? 24 * 60 : 30) * 60_000;
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)
    || Math.abs(lat) > 90 || Math.abs(lon) > 180 || point.valid === false
    || !Number.isFinite(recorded) || recorded > now.getTime() + 60_000 || now.getTime() - recorded >= maximumAge
    || (typeof point.accuracy === 'number' && point.accuracy > 500)) return null;
  return { latitude: lat, longitude: lon, recordedAt: new Date(recorded).toISOString(),
    label: now.getTime() - recorded > 30 * 60_000 ? 'laatst gemelde stilstandplek (aangenomen vertrekplek)' : 'laatste GPS-locatie' };
}

async function trackerOrigin(uid: string, now: Date): Promise<RouteOrigin | null> {
  // De servertracker is één apparaat: uitsluitend beschikbaar voor de ingestelde eigenaar.
  if (uid !== process.env.CALVORA_USER_ID?.trim()) return null;
  const server = process.env.TRACCAR_SERVER_URL?.trim().replace(/\/$/, '');
  const token = process.env.TRACCAR_API_TOKEN?.trim(), identifier = process.env.TRACCAR_DEVICE_IDENTIFIER?.trim();
  if (!server || !token || !identifier) return null;
  const get = async (path: string) => {
    const response = await fetch(server + path, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('GPS niet bereikbaar');
    return response.json();
  };
  const devices = await get(`/api/devices?uniqueId=${encodeURIComponent(identifier)}`);
  const device = devices.find((row: { uniqueId?: string }) => row.uniqueId === identifier);
  if (!device?.positionId) return null;
  const positions = await get(`/api/positions?id=${encodeURIComponent(device.positionId)}`);
  const point = positions.find((row: { deviceId?: number }) => row.deviceId === device.id);
  return point ? validRecentOrigin({ ...point, recordedAt: point.fixTime || point.deviceTime }, now) : null;
}

export async function readRouteOrigin(uid: string, date: string, now: Date, useSavedAddress: boolean): Promise<RouteOrigin> {
  if (useSavedAddress) {
    const settings = await readDepartureSettings(uid);
    if (settings.originDate === date && settings.originAddress) return { address: settings.originAddress, label: settings.originAddress };
  }
  const live = await trackerOrigin(uid, now).catch(() => null);
  if (live) return live;
  // Geen testregels, toekomstpunten of oude fixes gebruiken als actuele vertrekplek.
  const result = await supabaseAdmin.from('tracking_positions')
    .select('latitude,longitude,recorded_at,accuracy_m,raw_payload')
    .eq('user_id', uid).eq('source', 'traccar')
    .gte('recorded_at', new Date(now.getTime() - 24 * 60 * 60_000).toISOString())
    .lte('recorded_at', new Date(now.getTime() + 60_000).toISOString())
    .order('recorded_at', { ascending: false }).limit(5);
  for (const point of result.data || []) {
    const raw = point.raw_payload && typeof point.raw_payload === 'object' ? point.raw_payload as Record<string, unknown> : {};
    const attributes = raw.attributes && typeof raw.attributes === 'object' ? raw.attributes as Record<string, unknown> : {};
    const recordedAt = typeof raw.fixTime === 'string' ? raw.fixTime : typeof point.recorded_at === 'string' ? point.recorded_at : '';
    const speed = typeof raw.speed === 'number' ? raw.speed : undefined;
    const motion = typeof attributes.motion === 'boolean' ? attributes.motion : undefined;
    const origin = validRecentOrigin({ ...point, recordedAt, accuracy: point.accuracy_m,
      valid: raw.valid !== false, speed, attributes: { motion } }, now);
    if (origin) return origin;
    // Een later punt dat beweging aangeeft maakt een oude stilstandaanname ongeldig.
    if (motion === true || (speed !== undefined && speed > 0)) break;
  }
  throw new Error(date === routeDate(now)
    ? 'Geen recente GPS-locatie. Gebruik je telefoonlocatie of kies direct naar de klant.'
    : 'Geen recente GPS-locatie. Vul in Planning je vertrekplek voor morgen in om de vertrektijd te berekenen.');
}
