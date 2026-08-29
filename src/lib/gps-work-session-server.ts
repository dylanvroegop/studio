import { createHash } from 'node:crypto';

import { resolveQuoteProjectAddress } from '@/lib/maps';
import {
  buildGpsSessionDrafts,
  detectStableStops,
  distanceMeters,
  type GpsQuoteCandidate,
  type GpsSite,
  type SupplierVisit,
} from '@/lib/gps-work-sessions';
import type { TrackingPoint } from '@/lib/tracking-analysis';
import { supabaseAdmin } from '@/lib/supabase-admin';

const TIMEZONE = 'Europe/Amsterdam';
const SUPPLIER_PATTERN = /bouwmaat|pontmeyer|jongeneel|stiho|st[iĳ]ho|hornbach|gamma|praxis|hubo|toolstation|warmteservice|technische unie|raab karcher|bouwcenter|bouwmaterialen|houthandel/i;
const KNOWN_SUPPLIER_ADDRESSES = [
  { name: 'Bouwmaat Amsterdam Sloterdijk XL', address: 'Gyroscoopweg 142, 1042 AZ Amsterdam' },
  { name: 'Bouwmaat Amsterdam Osdorp', address: 'Maroastraat 75, 1060 LG Amsterdam' },
  { name: 'Bouwmaat Purmerend', address: 'Voltastraat 8, 1446 VC Purmerend' },
  { name: 'Bouwmaat Huizen', address: 'Machineweg 4, 1271 EE Huizen' },
  { name: 'Bouwmaat Hilversum XL', address: '1e Loswal 13, 1216 BA Hilversum' },
  { name: 'Bouwmaat Utrecht XL', address: 'St. Laurensdreef 8, 3565 AK Utrecht' },
  { name: 'Bouwmaat Nieuwegein XL', address: 'Laagraven 42, 3439 LK Nieuwegein' },
  { name: 'Bouwmaat Amersfoort', address: 'Nijverheidsweg-Noord 102, 3812 PN Amersfoort' },
  { name: 'Bouwmaat Dordrecht', address: 'Vierlinghstraat 52, 3316 EL Dordrecht' },
  { name: 'Bouwmaat Almere', address: 'Koningsbeltweg 61, 1329 AE Almere' },
  { name: 'Bouwmaat Diemen', address: 'Stammerdijk 7A, 1112 AA Diemen' },
] as const;
let placesNearbyAvailable: boolean | null = null;
let knownSupplierLocationsPromise: Promise<Array<{ name: string; address: string; latitude: number; longitude: number }>> | null = null;

interface TraccarPosition {
  id?: number;
  latitude?: number;
  longitude?: number;
  speed?: number;
  accuracy?: number;
  deviceTime?: string;
  fixTime?: string;
  serverTime?: string;
}

interface TraccarDevice { id?: number; uniqueId?: string }

function dateOnly(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function rangeForDay(value: string): { from: string; to: string } {
  const [year, month, day] = value.split('-').map(Number);
  const offsetAt = (date: Date) => {
    const label = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, timeZoneName: 'longOffset' })
      .formatToParts(date).find((part) => part.type === 'timeZoneName')?.value || 'GMT+01:00';
    const match = label.match(/GMT([+-])(\d{2}):(\d{2})/);
    return match ? (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3])) : 60;
  };
  const currentNoon = new Date(Date.UTC(year, month - 1, day, 12));
  const nextNoon = new Date(Date.UTC(year, month - 1, day + 1, 12));
  return {
    from: new Date(Date.UTC(year, month - 1, day) - offsetAt(currentNoon) * 60_000).toISOString(),
    to: new Date(Date.UTC(year, month - 1, day + 1) - offsetAt(nextNoon) * 60_000).toISOString(),
  };
}

function normalizedAddress(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function deterministicUuid(value: string): string {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function googleKey(): string {
  return process.env.GOOGLE_GEOCODING_API_KEY?.trim()
    || process.env.GOOGLE_API_KEY?.trim()
    || process.env.ANTIGRAVITY_GOOGLE_API_KEY?.trim()
    || '';
}

async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
  const key = googleKey();
  if (!key) return null;
  const params = new URLSearchParams({ address, language: 'nl', region: 'nl', key });
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, { cache: 'force-cache' }).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json().catch(() => null) as {
    results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
  } | null;
  const location = payload?.results?.[0]?.geometry?.location;
  return Number.isFinite(location?.lat) && Number.isFinite(location?.lng)
    ? { latitude: Number(location!.lat), longitude: Number(location!.lng) }
    : null;
}

async function knownSupplierLocations(): Promise<Array<{ name: string; address: string; latitude: number; longitude: number }>> {
  if (!knownSupplierLocationsPromise) {
    knownSupplierLocationsPromise = Promise.all(KNOWN_SUPPLIER_ADDRESSES.map(async (supplier) => {
      const location = await geocodeAddress(supplier.address);
      return location ? { ...supplier, ...location } : null;
    })).then((locations) => locations.filter((location): location is NonNullable<typeof location> => location !== null));
  }
  return knownSupplierLocationsPromise;
}

async function knownSupplierVisits(stops: ReturnType<typeof detectStableStops>): Promise<SupplierVisit[]> {
  const locations = await knownSupplierLocations();
  return stops.flatMap((stop) => {
    const nearest = locations
      .map((location) => ({ location, distance: distanceMeters(stop.point, location) }))
      .filter((candidate) => candidate.distance <= 300)
      .sort((left, right) => left.distance - right.distance)[0]?.location;
    if (!nearest) return [];
    return [{
      name: nearest.name,
      address: nearest.address,
      startAt: stop.startAt,
      endAt: stop.endAt,
      minutes: stop.minutes,
      latitude: nearest.latitude,
      longitude: nearest.longitude,
    }];
  });
}

function quoteCandidate(id: string, data: Record<string, unknown>): GpsQuoteCandidate {
  const info = (data.klantinformatie || {}) as Record<string, unknown>;
  const personalName = [info.voornaam, info.achternaam].map((value) => String(value || '').trim()).filter(Boolean).join(' ');
  const clientName = String(info.bedrijfsnaam || info.bedrijfsNaam || info.naam || info.name || personalName || 'Onbekende klant');
  const quoteNumber = String(data.offerteNummer || data.quoteNumber || '');
  const projectTitle = String(data.hoofdtitel || data.titel || data.title || 'Klus');
  const storedAmount = Number(data.totaalbedrag ?? data.amount ?? 0);
  const timestamp = data.createdAt as { toDate?: () => Date } | undefined;
  const quoteDate = timestamp?.toDate?.().toISOString() || '';
  return {
    id,
    quoteNumber,
    clientName,
    projectTitle,
    quoteAmount: Number.isFinite(storedAmount) && storedAmount > 0 ? storedAmount : undefined,
    quoteDate,
    status: String(data.status || ''),
  };
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function findProjectTitle(value: unknown, depth = 0): string {
  const parsed = parseJson(value);
  if (depth > 7 || !parsed || typeof parsed !== 'object') return '';
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const found = findProjectTitle(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  const record = parsed as Record<string, unknown>;
  for (const key of ['korteTitel', 'hoofdtitel', 'projectTitel', 'titel', 'title']) {
    const text = typeof record[key] === 'string' ? record[key].trim() : '';
    if (text) return text;
  }
  for (const nested of Object.values(record)) {
    const found = findProjectTitle(nested, depth + 1);
    if (found) return found;
  }
  return '';
}

async function quoteSites(firestore: FirebaseFirestore.Firestore, uid: string): Promise<GpsSite[]> {
  const snapshot = await firestore.collection('quotes').where('userId', '==', uid).get();
  const grouped = new Map<string, { address: string; quotes: GpsQuoteCandidate[] }>();
  snapshot.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    if (data.archived === true) return;
    const status = String(data.status || '').toLowerCase();
    if (!['geaccepteerd', 'accepted', 'verzonden', 'sent', 'in_behandeling'].includes(status)) return;
    const address = resolveQuoteProjectAddress({
      klantinformatie: data.klantinformatie as Parameters<typeof resolveQuoteProjectAddress>[0] extends { klantinformatie?: infer T } ? T : never,
    });
    const key = normalizedAddress(address);
    if (!key) return;
    const current = grouped.get(key) || { address, quotes: [] };
    current.quotes.push(quoteCandidate(doc.id, data));
    grouped.set(key, current);
  });

  const quoteIds = Array.from(grouped.values()).flatMap((value) => value.quotes.map((quote) => quote.id));
  const titleByQuoteId = new Map<string, string>();
  for (let index = 0; index < quoteIds.length; index += 50) {
    const { data } = await supabaseAdmin.from('quotes_collection').select('quoteid,data_json').in('quoteid', quoteIds.slice(index, index + 50));
    (data || []).forEach((row) => {
      const quoteId = String(row.quoteid || '');
      if (!quoteId || titleByQuoteId.has(quoteId)) return;
      const title = findProjectTitle(row.data_json);
      if (title) titleByQuoteId.set(quoteId, title);
    });
  }
  grouped.forEach((value) => {
    value.quotes = value.quotes.map((quote) => ({
      ...quote,
      projectTitle: titleByQuoteId.get(quote.id) || quote.projectTitle,
    }));
  });

  const sites: GpsSite[] = [];
  for (const [key, value] of grouped) {
    const location = await geocodeAddress(value.address);
    if (!location) continue;
    sites.push({ key, address: value.address, ...location, quotes: value.quotes });
  }
  return sites;
}

function traccarConfig(): { serverUrl: string; token: string; identifier: string } {
  const serverUrl = (process.env.TRACCAR_SERVER_URL || '').trim().replace(/\/$/, '');
  const token = (process.env.TRACCAR_API_TOKEN || '').trim();
  const identifier = (process.env.TRACCAR_DEVICE_IDENTIFIER || '').trim();
  if (!serverUrl || !token || !identifier) throw new Error('Traccar is niet geconfigureerd.');
  return { serverUrl, token, identifier };
}

async function traccarGet<T>(path: string): Promise<T> {
  const config = traccarConfig();
  const response = await fetch(`${config.serverUrl}${path}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${config.token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Traccar gaf HTTP ${response.status}.`);
  return response.json() as Promise<T>;
}

async function dayPoints(workDate: string): Promise<TrackingPoint[]> {
  const config = traccarConfig();
  const devices = await traccarGet<TraccarDevice[]>(`/api/devices?uniqueId=${encodeURIComponent(config.identifier)}`);
  const device = devices.find((candidate) => candidate.uniqueId === config.identifier && candidate.id);
  if (!device?.id) throw new Error('Traccar-device niet gevonden.');
  const range = rangeForDay(workDate);
  const query = new URLSearchParams({ deviceId: String(device.id), from: range.from, to: range.to });
  const positions = await traccarGet<TraccarPosition[]>(`/api/positions?${query}`);
  return positions.map((position): TrackingPoint | null => {
    const recordedAt = position.deviceTime || position.fixTime || position.serverTime;
    if (!position.id || !recordedAt || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) return null;
    return {
      id: String(position.id),
      latitude: Number(position.latitude),
      longitude: Number(position.longitude),
      speed_kmh: Number.isFinite(position.speed) ? Number(position.speed) * 1.852 : null,
      recorded_at: recordedAt,
    };
  }).filter((point): point is TrackingPoint => point !== null);
}

async function nearbySupplier(stop: ReturnType<typeof detectStableStops>[number]): Promise<SupplierVisit | null> {
  const key = googleKey();
  if (!key || placesNearbyAvailable === false) return null;
  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.primaryType',
    },
    body: JSON.stringify({
      maxResultCount: 10,
      rankPreference: 'DISTANCE',
      locationRestriction: {
        circle: {
          center: { latitude: stop.point.latitude, longitude: stop.point.longitude },
          radius: 140,
        },
      },
    }),
    cache: 'no-store',
  }).catch(() => null);
  if (!response?.ok) {
    if (response?.status === 403) placesNearbyAvailable = false;
    return null;
  }
  placesNearbyAvailable = true;
  const payload = await response.json().catch(() => null) as {
    places?: Array<{
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      primaryType?: string;
    }>;
  } | null;
  const place = payload?.places?.find((candidate) => SUPPLIER_PATTERN.test([
    candidate.displayName?.text,
    candidate.formattedAddress,
    candidate.primaryType,
  ].filter(Boolean).join(' ')));
  if (!place) return null;
  return {
    name: place.displayName?.text || 'Leverancier',
    address: place.formattedAddress || '',
    startAt: stop.startAt,
    endAt: stop.endAt,
    minutes: stop.minutes,
    latitude: Number(place.location?.latitude ?? stop.point.latitude),
    longitude: Number(place.location?.longitude ?? stop.point.longitude),
  };
}

async function overpassSuppliers(stops: ReturnType<typeof detectStableStops>): Promise<SupplierVisit[]> {
  if (stops.length === 0) return [];
  const brandRegex = 'Bouwmaat|PontMeyer|Jongeneel|Stiho|Hornbach|Gamma|Praxis|Hubo|Toolstation|Warmteservice|Technische Unie|Raab Karcher|Bouwcenter';
  const clauses = stops.map((stop) => (
    `nwr(around:180,${stop.point.latitude},${stop.point.longitude})["name"~"${brandRegex}",i];`
  )).join('');
  const query = `[out:json][timeout:20];(${clauses});out center tags;`;
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': 'Calvora-GPS-Worktime/1.0',
    },
    body: new URLSearchParams({ data: query }),
    cache: 'no-store',
    signal: AbortSignal.timeout(25_000),
  }).catch(() => null);
  if (!response?.ok) return [];
  const payload = await response.json().catch(() => null) as {
    elements?: Array<{
      lat?: number;
      lon?: number;
      center?: { lat?: number; lon?: number };
      tags?: Record<string, string>;
    }>;
  } | null;
  const places = (payload?.elements || []).map((element) => ({
    latitude: Number(element.lat ?? element.center?.lat),
    longitude: Number(element.lon ?? element.center?.lon),
    tags: element.tags || {},
  })).filter((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude));

  return stops.flatMap((stop) => {
    const nearest = places
      .map((place) => ({ place, distance: distanceMeters(stop.point, place) }))
      .filter((candidate) => candidate.distance <= 200)
      .sort((left, right) => left.distance - right.distance)[0]?.place;
    if (!nearest) return [];
    const tags = nearest.tags;
    const name = tags.name || tags.brand || tags.operator || 'Leverancier';
    const address = [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']].filter(Boolean).join(' ');
    return [{
      name,
      address,
      startAt: stop.startAt,
      endAt: stop.endAt,
      minutes: stop.minutes,
      latitude: nearest.latitude,
      longitude: nearest.longitude,
    }];
  });
}

async function supplierVisitsForDay(points: TrackingPoint[], sites: GpsSite[]): Promise<SupplierVisit[]> {
  const stops = detectStableStops(points)
    .filter((stop) => stop.minutes >= 7)
    .filter((stop) => sites.every((site) => distanceMeters(stop.point, site) > 180));
  const known = await knownSupplierVisits(stops);
  if (known.length > 0) return known;
  const output: SupplierVisit[] = [];
  for (const stop of stops.slice(0, 24)) {
    const supplier = await nearbySupplier(stop);
    if (supplier) output.push(supplier);
  }
  if (output.length > 0) return output;
  return overpassSuppliers(stops.slice(0, 24));
}

async function ensureSettings(uid: string): Promise<{ enabledFrom: string; lastAnalyzedDate: string | null }> {
  const { data, error } = await supabaseAdmin.from('gps_work_settings').select('enabled_from,last_analyzed_date').eq('user_id', uid).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return { enabledFrom: String(data.enabled_from), lastAnalyzedDate: data.last_analyzed_date ? String(data.last_analyzed_date) : null };
  const today = dateOnly(new Date());
  const { error: insertError } = await supabaseAdmin.from('gps_work_settings').insert({ user_id: uid, enabled_from: today });
  if (insertError) throw new Error(insertError.message);
  return { enabledFrom: today, lastAnalyzedDate: null };
}

async function analyzeDate(firestore: FirebaseFirestore.Firestore, uid: string, workDate: string, sites: GpsSite[]): Promise<number> {
  const points = await dayPoints(workDate);
  if (points.length < 2 || sites.length === 0) return 0;
  const suppliers = await supplierVisitsForDay(points, sites);
  const drafts = buildGpsSessionDrafts(points, sites, suppliers);
  if (drafts.length === 0) return 0;
  const groupedDrafts = new Map<string, typeof drafts>();
  drafts.forEach((draft) => groupedDrafts.set(draft.site.key, [...(groupedDrafts.get(draft.site.key) || []), draft]));
  const rows = Array.from(groupedDrafts.values()).map((siteDrafts) => {
    const draft = siteDrafts[0];
    const startAt = siteDrafts.reduce((value, item) => item.startAt < value ? item.startAt : value, draft.startAt);
    const endAt = siteDrafts.reduce((value, item) => item.endAt > value ? item.endAt : value, draft.endAt);
    const onsiteMinutes = siteDrafts.reduce((sum, item) => sum + item.onsiteMinutes, 0);
    const outboundTravelMinutes = siteDrafts.reduce((sum, item) => sum + item.outboundTravelMinutes, 0);
    const returnTravelMinutes = siteDrafts.reduce((sum, item) => sum + item.returnTravelMinutes, 0);
    const supplierTravelMinutes = siteDrafts.reduce((sum, item) => sum + item.supplierTravelMinutes, 0);
    const supplierStopMinutes = siteDrafts.reduce((sum, item) => sum + item.supplierStopMinutes, 0);
    const supplierVisits = siteDrafts.flatMap((item) => item.supplierVisits).filter((visit, index, all) => (
      all.findIndex((candidate) => candidate.name === visit.name && candidate.startAt === visit.startAt) === index
    ));
    const included = onsiteMinutes
      + outboundTravelMinutes
      + returnTravelMinutes
      + supplierTravelMinutes
      + supplierStopMinutes;
    return {
      id: deterministicUuid(`gps-work-session:${uid}:${workDate}:${draft.site.key}`),
      user_id: uid,
      work_date: workDate,
      address_key: draft.site.key,
      address_label: draft.site.address,
      candidate_quotes: draft.site.quotes,
      status: 'pending',
      start_at: startAt,
      end_at: endAt,
      onsite_minutes: onsiteMinutes,
      outbound_travel_minutes: outboundTravelMinutes,
      return_travel_minutes: returnTravelMinutes,
      supplier_travel_minutes: supplierTravelMinutes,
      supplier_stop_minutes: supplierStopMinutes,
      supplier_visits: supplierVisits,
      included_minutes: included,
      updated_at: new Date().toISOString(),
    };
  });
  const rowIds = rows.map((row) => row.id);
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('gps_work_sessions')
    .select('id,status')
    .in('id', rowIds);
  if (existingError) throw new Error(existingError.message);
  const processedIds = new Set((existing || [])
    .filter((row) => row.status === 'confirmed' || row.status === 'dismissed')
    .map((row) => String(row.id)));
  const writableRows = rows.filter((row) => !processedIds.has(row.id));
  if (writableRows.length === 0) return 0;
  const { error } = await supabaseAdmin.from('gps_work_sessions').upsert(writableRows, {
    onConflict: 'id',
  });
  if (error) throw new Error(error.message);
  return writableRows.length;
}

export async function prepareGpsWorkSessions(firestore: FirebaseFirestore.Firestore, uid: string): Promise<void> {
  const settings = await ensureSettings(uid);
  const yesterday = addDays(dateOnly(new Date()), -1);
  let cursor = settings.lastAnalyzedDate ? addDays(settings.lastAnalyzedDate, 1) : settings.enabledFrom;
  if (cursor > yesterday) return;
  const sites = await quoteSites(firestore, uid);
  let processed = 0;
  let lastProcessed: string | null = null;
  while (cursor <= yesterday && processed < 7) {
    await analyzeDate(firestore, uid, cursor, sites);
    lastProcessed = cursor;
    cursor = addDays(cursor, 1);
    processed += 1;
  }
  if (lastProcessed) {
    const { error } = await supabaseAdmin.from('gps_work_settings')
      .update({ last_analyzed_date: lastProcessed, updated_at: new Date().toISOString() })
      .eq('user_id', uid);
    if (error) throw new Error(error.message);
  }
}

export async function backfillGpsWorkSessions(
  firestore: FirebaseFirestore.Firestore,
  uid: string,
  dates: string[],
): Promise<{ dates: number; sessions: number }> {
  const sites = await quoteSites(firestore, uid);
  let sessions = 0;
  for (const workDate of dates) sessions += await analyzeDate(firestore, uid, workDate, sites);
  return { dates: dates.length, sessions };
}

export async function backfillGpsWorkSessionsForQuoteIds(
  firestore: FirebaseFirestore.Firestore,
  uid: string,
  dates: string[],
  quoteIds: string[],
): Promise<{ dates: number; sessions: number }> {
  const requested = new Set(quoteIds);
  const sites = (await quoteSites(firestore, uid)).filter((site) => (
    site.quotes.some((quote) => requested.has(quote.id))
  ));
  let sessions = 0;
  for (const workDate of dates) sessions += await analyzeDate(firestore, uid, workDate, sites);
  return { dates: dates.length, sessions };
}

export async function refreshGpsWorkSessionCandidates(
  firestore: FirebaseFirestore.Firestore,
  uid: string,
): Promise<number> {
  const sites = await quoteSites(firestore, uid);
  let updated = 0;
  for (const site of sites) {
    const { data, error } = await supabaseAdmin.from('gps_work_sessions')
      .update({ candidate_quotes: site.quotes, address_label: site.address, updated_at: new Date().toISOString() })
      .eq('user_id', uid)
      .eq('status', 'pending')
      .eq('address_key', site.key)
      .select('id');
    if (error) throw new Error(error.message);
    updated += data?.length || 0;
  }
  return updated;
}

export function sessionTimeEntryId(uid: string, sessionId: string): string {
  return deterministicUuid(`gps-work-time-entry:${uid}:${sessionId}`);
}
