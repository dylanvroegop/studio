import { NextResponse } from 'next/server';

import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { PendingHourPrompt } from '@/lib/time-entries';
import { resolveQuoteProjectAddress } from '@/lib/maps';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AMSTERDAM_TIMEZONE = 'Europe/Amsterdam';
const GPS_MATCH_RADIUS_M = 100;
const GPS_MIN_VISIT_MINUTES = 15;
const GPS_ACTIVE_VISIT_GRACE_MINUTES = 30;
const GPS_MAX_LOOKBACK_DAYS = 3;

type GeoPoint = {
  latitude: number;
  longitude: number;
};

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
};

type GpsPoint = {
  id: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  recordedAt: string;
  workDate: string;
};

type QuoteLocationCandidate = QuoteMeta & {
  quoteId: string;
  quoteLabel: string;
  address: string;
  location: GeoPoint;
};

interface PlanningRow {
  id: string;
  quoteId?: unknown;
  scheduledHours?: unknown;
  startDate?: Timestamp | { toDate?: () => Date } | unknown;
  endDate?: Timestamp | { toDate?: () => Date } | unknown;
  planningType?: unknown;
  status?: unknown;
  cache?: unknown;
}

interface DayPendingItem {
  promptKey: string;
  quoteId: string;
  quoteLabel: string;
  workDate: string;
  suggestedHours: number;
  quoteTotalHours: number | null;
  planningType: 'job' | 'werkbespreking';
  plannedEntryRefs: string[];
}

interface QuoteMeta {
  quoteNumber: string | null;
  clientName: string | null;
  projectTitle: string | null;
  archived: boolean;
}

function normalizePlanningType(value: unknown): 'job' | 'werkbespreking' {
  const raw = safeString(value).toLowerCase();
  return raw === 'werkbespreking' ? 'werkbespreking' : 'job';
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function isValidCoordinate(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
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
    throw new Error(`Traccar gaf HTTP ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

async function getConfiguredDevice(config: { serverUrl: string; apiToken: string; deviceIdentifier: string }): Promise<TraccarDevice | null> {
  const devices = await traccarGet<TraccarDevice[]>(
    config.serverUrl,
    config.apiToken,
    `/api/devices?uniqueId=${encodeURIComponent(config.deviceIdentifier)}`,
  );
  return devices.find((candidate) => candidate.uniqueId === config.deviceIdentifier && candidate.id) || null;
}

function getRecordedAt(position: TraccarPosition): string {
  const value = position.deviceTime || position.fixTime || position.serverTime;
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function dateOnlyToLocalStartIso(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
}

function formatTimeInTimezone(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('nl-NL', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === 'hour')?.value || '00';
  const minute = parts.find((part) => part.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
}

function distanceMeters(left: GeoPoint, right: GeoPoint): number {
  const earthRadiusM = 6371000;
  const lat1 = left.latitude * Math.PI / 180;
  const lat2 = right.latitude * Math.PI / 180;
  const deltaLat = (right.latitude - left.latitude) * Math.PI / 180;
  const deltaLon = (right.longitude - left.longitude) * Math.PI / 180;
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildQuoteLabelFromMeta(meta: QuoteMeta, quoteId: string, address: string): string {
  if (meta.clientName && meta.projectTitle) return `${meta.clientName} - ${meta.projectTitle}`;
  if (meta.projectTitle) return meta.projectTitle;
  if (meta.clientName) return meta.clientName;
  return address || quoteId;
}

function isMissingRelationError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('does not exist') ||
    lower.includes('relation') ||
    lower.includes('not found') ||
    lower.includes('schema cache') ||
    lower.includes('could not find the table') ||
    lower.includes('not find the table')
  );
}

function formatDateInTimezone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value || '1970';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

function addDays(dateOnly: string, amount: number): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + amount);
  return utc.toISOString().slice(0, 10);
}

function minDateOnly(a: string, b: string): string {
  return a <= b ? a : b;
}

function isDateOnlyBeforeOrEqual(a: string, b: string): boolean {
  return a <= b;
}

function eachDateOnlyInclusive(startDateOnly: string, endDateOnly: string): string[] {
  const dates: string[] = [];
  let cursor = startDateOnly;
  while (isDateOnlyBeforeOrEqual(cursor, endDateOnly)) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function daysBetweenInclusive(startDateOnly: string, endDateOnly: string): number {
  const start = Date.parse(`${startDateOnly}T00:00:00.000Z`);
  const end = Date.parse(`${endDateOnly}T00:00:00.000Z`);
  const diffMs = Math.max(0, end - start);
  return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
}

function dateOnlyFromPlanningTimestamp(value: unknown): Date | null {
  if (!value || typeof value !== 'object') return null;
  if (value instanceof Timestamp) return value.toDate();
  const row = value as { toDate?: () => Date };
  if (typeof row.toDate === 'function') {
    try {
      return row.toDate();
    } catch {
      return null;
    }
  }
  return null;
}

function getQuoteLabel(cache: unknown, quoteId: string): string {
  if (!cache || typeof cache !== 'object') return quoteId;
  const row = cache as Record<string, unknown>;
  const projectTitle = safeString(row.projectTitle);
  const clientName = safeString(row.clientName);
  const address = safeString(row.projectAddress);
  if (projectTitle && clientName) return `${clientName} - ${projectTitle}`;
  if (projectTitle && address) return `${projectTitle} - ${address}`;
  return projectTitle || clientName || quoteId;
}

function getQuoteTotalHours(cache: unknown): number | null {
  if (!cache || typeof cache !== 'object') return null;
  const row = cache as Record<string, unknown>;
  const total = safeNumber(row.totalQuoteHours);
  if (!Number.isFinite(total) || total <= 0) return null;
  return total;
}

function getQuoteTotalHoursFromQuoteDoc(data: Record<string, unknown>): number | null {
  const direct = safeNumber(data.totaal_uren);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const totals = data.totals;
  if (totals && typeof totals === 'object') {
    const totalsRow = totals as Record<string, unknown>;
    const fallback = safeNumber(totalsRow.totalHours);
    if (Number.isFinite(fallback) && fallback > 0) return fallback;
  }

  return null;
}

function getQuoteMetaFromQuoteDoc(data: Record<string, unknown>): QuoteMeta {
  const quoteNumberRaw = data.offerteNummer;
  const quoteNumber = quoteNumberRaw == null ? '' : String(quoteNumberRaw).trim();
  const projectTitle = safeString(data.titel);
  const clientInfo = (data.klantinformatie && typeof data.klantinformatie === 'object')
    ? (data.klantinformatie as Record<string, unknown>)
    : null;
  const clientName = clientInfo
    ? (
      safeString(clientInfo.bedrijfsnaam)
      || `${safeString(clientInfo.voornaam)} ${safeString(clientInfo.achternaam)}`.trim()
    )
    : '';

  return {
    quoteNumber: quoteNumber || null,
    clientName: clientName || null,
    projectTitle: projectTitle || null,
    archived: data.archived === true,
  };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function cleanupOrphanPlanningEntries(
  firestore: FirebaseFirestore.Firestore,
  uid: string,
  quoteIdsToCleanup: string[],
): Promise<void> {
  for (const quoteId of quoteIdsToCleanup) {
    const snapshot = await firestore
      .collection('planning_entries')
      .where('userId', '==', uid)
      .where('quoteId', '==', quoteId)
      .get();

    if (snapshot.empty) continue;

    const docs = snapshot.docs;
    for (const chunk of chunkArray(docs, 400)) {
      const batch = firestore.batch();
      chunk.forEach((document) => batch.delete(document.ref));
      await batch.commit();
    }
  }
}

async function getUid(request: Request): Promise<string | null> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) return null;
  const { auth } = initFirebaseAdmin();
  const decoded = await auth.verifyIdToken(token).catch(() => null);
  return decoded?.uid || null;
}

async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY?.trim()
    || process.env.GOOGLE_API_KEY?.trim()
    || process.env.ANTIGRAVITY_GOOGLE_API_KEY?.trim();
  if (!apiKey) return null;

  const params = new URLSearchParams({
    address: `${address}, Nederland`,
    components: 'country:NL',
    language: 'nl',
    region: 'nl',
    key: apiKey,
  });

  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`, {
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  if (!response?.ok) return null;

  const payload = await response.json().catch(() => null) as {
    status?: string;
    error_message?: string;
    results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
  } | null;
  if (payload?.status === 'REQUEST_DENIED') {
    throw new Error(payload.error_message || 'Google Geocoding API key is niet bevoegd voor deze API.');
  }
  const location = payload?.status === 'OK' ? payload.results?.[0]?.geometry?.location : null;
  if (!isValidCoordinate(location?.lat, -90, 90) || !isValidCoordinate(location?.lng, -180, 180)) {
    return null;
  }

  return { latitude: location.lat, longitude: location.lng };
}

async function fetchRecentTraccarPoints(todayInAmsterdam: string): Promise<GpsPoint[]> {
  const config = getTraccarConfig();
  if (!config) return [];

  const device = await getConfiguredDevice(config).catch(() => null);
  if (!device?.id) return [];

  const fromDate = addDays(todayInAmsterdam, -GPS_MAX_LOOKBACK_DAYS);
  const query = new URLSearchParams({
    deviceId: String(device.id),
    from: dateOnlyToLocalStartIso(fromDate),
    to: new Date().toISOString(),
  });
  const positions = await traccarGet<TraccarPosition[]>(
    config.serverUrl,
    config.apiToken,
    `/api/positions?${query.toString()}`,
  ).catch(() => []);

  return positions
    .filter((position) => (
      isValidCoordinate(position.latitude, -90, 90)
      && isValidCoordinate(position.longitude, -180, 180)
      && typeof position.id === 'number'
    ))
    .map((position) => {
      const recordedAt = getRecordedAt(position);
      return {
        id: String(position.id),
        latitude: position.latitude as number,
        longitude: position.longitude as number,
        accuracyM: typeof position.accuracy === 'number' && Number.isFinite(position.accuracy) ? position.accuracy : null,
        recordedAt,
        workDate: formatDateInTimezone(new Date(recordedAt), AMSTERDAM_TIMEZONE),
      };
    })
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
}

async function getQuoteLocationCandidates(
  firestore: FirebaseFirestore.Firestore,
  uid: string,
): Promise<QuoteLocationCandidate[]> {
  const quoteSnapshot = await firestore
    .collection('quotes')
    .where('userId', '==', uid)
    .get();

  const output: QuoteLocationCandidate[] = [];
  const geocodeCache = new Map<string, GeoPoint | null>();
  for (const quoteDoc of quoteSnapshot.docs) {
    const quoteData = quoteDoc.data() as Record<string, unknown>;
    const meta = getQuoteMetaFromQuoteDoc(quoteData);
    if (meta.archived) continue;

    const address = resolveQuoteProjectAddress({ klantinformatie: quoteData.klantinformatie as any });
    if (!address) continue;

    if (!geocodeCache.has(address)) {
      geocodeCache.set(address, await geocodeAddress(address));
    }
    const location = geocodeCache.get(address);
    if (!location) continue;

    output.push({
      ...meta,
      quoteId: quoteDoc.id,
      quoteLabel: buildQuoteLabelFromMeta(meta, quoteDoc.id, address),
      address,
      location,
    });
  }

  return output;
}

function getGpsVisitsForQuote(
  points: GpsPoint[],
  quote: QuoteLocationCandidate,
  todayInAmsterdam: string,
): PendingHourPrompt[] {
  const byDate = new Map<string, Array<GpsPoint & { distanceM: number }>>();
  points.forEach((point) => {
    const distanceM = distanceMeters(point, quote.location);
    if (distanceM > GPS_MATCH_RADIUS_M) return;
    if (point.accuracyM !== null && point.accuracyM > 100) return;
    const current = byDate.get(point.workDate) || [];
    current.push({ ...point, distanceM });
    byDate.set(point.workDate, current);
  });

  const nowMs = Date.now();
  return Array.from(byDate.entries()).flatMap(([workDate, matchedPoints]) => {
    if (matchedPoints.length < 2) return [];

    const firstPoint = matchedPoints[0];
    const lastPoint = matchedPoints[matchedPoints.length - 1];
    const startMs = new Date(firstPoint.recordedAt).getTime();
    const endMs = new Date(lastPoint.recordedAt).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];

    const durationMinutes = Math.round((endMs - startMs) / 60_000);
    if (durationMinutes < GPS_MIN_VISIT_MINUTES) return [];
    if (workDate === todayInAmsterdam && nowMs - endMs < GPS_ACTIVE_VISIT_GRACE_MINUTES * 60_000) return [];

    const suggestedHours = Number((durationMinutes / 60).toFixed(2));
    const nearestDistance = Math.min(...matchedPoints.map((point) => point.distanceM));
    return [{
      promptKey: `gps:${quote.quoteId}:${workDate}`,
      quoteId: quote.quoteId,
      quoteLabel: quote.quoteLabel,
      quoteNumber: quote.quoteNumber || undefined,
      clientName: quote.clientName || undefined,
      projectTitle: quote.projectTitle || quote.address,
      planningType: 'job' as const,
      promptSource: 'gps_tracking' as const,
      workDate,
      suggestedHours,
      startTime: formatTimeInTimezone(firstPoint.recordedAt, AMSTERDAM_TIMEZONE),
      endTime: formatTimeInTimezone(lastPoint.recordedAt, AMSTERDAM_TIMEZONE),
      matchedDistanceM: Number(nearestDistance.toFixed(1)),
      gpsPointCount: matchedPoints.length,
      pendingDaysCount: 1,
      pendingDates: [{
        workDate,
        suggestedHours,
        dayPromptKey: `gps:${quote.quoteId}:${workDate}`,
      }],
      plannedEntryRefs: matchedPoints.slice(0, 20).map((point) => `traccar:${point.id}`),
    }];
  });
}

async function buildGpsTrackingPrompts(
  firestore: FirebaseFirestore.Firestore,
  uid: string,
  todayInAmsterdam: string,
): Promise<PendingHourPrompt[]> {
  const points = await fetchRecentTraccarPoints(todayInAmsterdam);
  if (points.length === 0) return [];

  const quotes = await getQuoteLocationCandidates(firestore, uid);
  if (quotes.length === 0) return [];

  const rawItems = quotes.flatMap((quote) => getGpsVisitsForQuote(points, quote, todayInAmsterdam));
  if (rawItems.length === 0) return [];

  const promptKeys = rawItems.map((item) => item.promptKey);
  const quoteIds = Array.from(new Set(rawItems.map((item) => item.quoteId)));
  const earliestWorkDate = rawItems.reduce((min, item) => minDateOnly(min, item.workDate), rawItems[0].workDate);

  const [{ data: existingEntries, error: existingEntriesError }, { data: promptStates, error: promptStatesError }] = await Promise.all([
    supabaseAdmin
      .from('time_entries')
      .select('quote_id, work_date')
      .eq('user_id', uid)
      .gte('work_date', earliestWorkDate)
      .in('quote_id', quoteIds),
    supabaseAdmin
      .from('time_entry_prompt_state')
      .select('prompt_key, action, snooze_until')
      .eq('user_id', uid)
      .in('prompt_key', promptKeys),
  ]);

  if (existingEntriesError || promptStatesError) return [];

  const existingPromptKeys = new Set(
    (existingEntries || [])
      .map((row) => {
        const record = row as Record<string, unknown>;
        const quoteId = safeString(record.quote_id);
        const workDate = safeString(record.work_date);
        return quoteId && workDate ? `gps:${quoteId}:${workDate}` : '';
      })
      .filter(Boolean),
  );
  const stateByKey = new Map<string, { action: string; snoozeUntil: string }>();
  (promptStates || []).forEach((row) => {
    const record = row as Record<string, unknown>;
    const key = safeString(record.prompt_key);
    if (!key) return;
    stateByKey.set(key, {
      action: safeString(record.action),
      snoozeUntil: safeString(record.snooze_until),
    });
  });

  return rawItems
    .filter((item) => !existingPromptKeys.has(item.promptKey))
    .filter((item) => {
      const state = stateByKey.get(item.promptKey);
      if (!state) return true;
      if (state.action === 'not_worked') return false;
      if (state.action === 'later' && state.snoozeUntil && state.snoozeUntil > new Date().toISOString()) return false;
      return true;
    });
}

export async function GET(request: Request) {
  try {
    const uid = await getUid(request);
    if (!uid) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const todayInAmsterdam = formatDateInTimezone(new Date(), AMSTERDAM_TIMEZONE);
    const cutoffWorkDate = addDays(todayInAmsterdam, -2);

    const { firestore } = initFirebaseAdmin();
    const planningSnapshot = await firestore
      .collection('planning_entries')
      .where('userId', '==', uid)
      .get();

    const dayAggregation = new Map<string, DayPendingItem>();
    const scheduledHoursByQuote = new Map<string, number>();
    planningSnapshot.docs.forEach((document) => {
      const row = { id: document.id, ...document.data() } as PlanningRow;
      if (safeString(row.status).toLowerCase() === 'cancelled') return;

      const quoteId = safeString(row.quoteId);
      if (!quoteId) return;

      const startDate = dateOnlyFromPlanningTimestamp(row.startDate);
      const endDate = dateOnlyFromPlanningTimestamp(row.endDate);
      if (!startDate || !endDate) return;

      const startDateOnly = formatDateInTimezone(startDate, AMSTERDAM_TIMEZONE);
      const endDateOnly = formatDateInTimezone(endDate, AMSTERDAM_TIMEZONE);

      if (startDateOnly > cutoffWorkDate) return;

      const daysCount = daysBetweenInclusive(startDateOnly, endDateOnly);
      const scheduledHours = safeNumber(row.scheduledHours);
      if (scheduledHours <= 0) return;
      const suggestedHours = Number((scheduledHours / Math.max(1, daysCount)).toFixed(2));
      if (suggestedHours <= 0) return;

      const quoteLabel = getQuoteLabel(row.cache, quoteId);
      const quoteTotalHours = getQuoteTotalHours(row.cache);
      const planningType = normalizePlanningType(row.planningType);
      if (planningType === 'werkbespreking') return;

      const currentScheduledForQuote = scheduledHoursByQuote.get(quoteId) || 0;
      scheduledHoursByQuote.set(
        quoteId,
        Number((currentScheduledForQuote + scheduledHours).toFixed(2)),
      );

      const lastEligibleDate = minDateOnly(endDateOnly, cutoffWorkDate);
      eachDateOnlyInclusive(startDateOnly, lastEligibleDate).forEach((workDate) => {
        const promptKey = `${quoteId}:${workDate}`;
        const existing = dayAggregation.get(promptKey);
        if (!existing) {
          dayAggregation.set(promptKey, {
            promptKey,
            quoteId,
            quoteLabel,
            workDate,
            suggestedHours,
            quoteTotalHours,
            planningType,
            plannedEntryRefs: [row.id],
          });
          return;
        }

        existing.suggestedHours = Number((existing.suggestedHours + suggestedHours).toFixed(2));
        if (quoteTotalHours && (!existing.quoteTotalHours || quoteTotalHours > existing.quoteTotalHours)) {
          existing.quoteTotalHours = quoteTotalHours;
        }
        existing.plannedEntryRefs.push(row.id);
      });
    });

    if (dayAggregation.size === 0) {
      let gpsItems: PendingHourPrompt[] = [];
      try {
        gpsItems = await buildGpsTrackingPrompts(firestore, uid, todayInAmsterdam);
      } catch (gpsError) {
        const message = gpsError instanceof Error ? gpsError.message : 'GPS-uren konden niet worden bepaald.';
        return NextResponse.json({ ok: false, message }, { status: 502 });
      }
      return NextResponse.json({ ok: true, items: gpsItems });
    }

    const dayPromptKeys = Array.from(dayAggregation.keys());
    const quoteIds = Array.from(new Set(Array.from(dayAggregation.values()).map((item) => item.quoteId)));

    const canonicalQuoteHoursByQuoteId = new Map<string, number>();
    const quoteMetaByQuoteId = new Map<string, QuoteMeta>();
    for (const chunk of chunkArray(quoteIds, 10)) {
      if (chunk.length === 0) continue;
      const quoteSnapshot = await firestore
        .collection('quotes')
        .where('userId', '==', uid)
        .where(FieldPath.documentId(), 'in', chunk)
        .get();

      quoteSnapshot.docs.forEach((quoteDoc) => {
        const quoteData = quoteDoc.data() as Record<string, unknown>;
        const quoteHours = getQuoteTotalHoursFromQuoteDoc(quoteData);
        if (quoteHours && quoteHours > 0) {
          canonicalQuoteHoursByQuoteId.set(quoteDoc.id, quoteHours);
        }
        quoteMetaByQuoteId.set(quoteDoc.id, getQuoteMetaFromQuoteDoc(quoteData));
      });
    }

    const orphanQuoteIds = quoteIds.filter((quoteId) => !quoteMetaByQuoteId.has(quoteId));
    const archivedQuoteIds = quoteIds.filter((quoteId) => quoteMetaByQuoteId.get(quoteId)?.archived === true);
    const cleanupQuoteIds = Array.from(new Set([...orphanQuoteIds, ...archivedQuoteIds]));
    if (cleanupQuoteIds.length > 0) {
      await cleanupOrphanPlanningEntries(firestore, uid, cleanupQuoteIds);
    }

    const [{ data: existingEntries, error: existingEntriesError }, { data: promptStates, error: promptStatesError }] = await Promise.all([
      supabaseAdmin
        .from('time_entries')
        .select('quote_id, work_date, worked_hours')
        .eq('user_id', uid)
        .lte('work_date', cutoffWorkDate)
        .in('quote_id', quoteIds),
      supabaseAdmin
        .from('time_entry_prompt_state')
        .select('prompt_key, action, snooze_until')
        .eq('user_id', uid)
        .in('prompt_key', dayPromptKeys),
    ]);

    if (existingEntriesError && isMissingRelationError(existingEntriesError.message)) {
      return NextResponse.json(
        { ok: false, message: 'Database tabel voor uren ontbreekt. Voer de uren-migratie uit.' },
        { status: 409 }
      );
    }
    if (existingEntriesError) {
      return NextResponse.json({ ok: false, message: existingEntriesError.message }, { status: 500 });
    }
    if (promptStatesError && isMissingRelationError(promptStatesError.message)) {
      return NextResponse.json(
        { ok: false, message: 'Database tabel voor uren ontbreekt. Voer de uren-migratie uit.' },
        { status: 409 }
      );
    }
    if (promptStatesError) {
      return NextResponse.json({ ok: false, message: promptStatesError.message }, { status: 500 });
    }

    const existingPromptKeys = new Set(
      (existingEntries || [])
        .map((row) => {
          const record = row as Record<string, unknown>;
          const quoteId = safeString(record.quote_id);
          const workDate = safeString(record.work_date);
          if (!quoteId || !workDate) return '';
          return `${quoteId}:${workDate}`;
        })
        .filter(Boolean),
    );

    const loggedHoursByQuote = new Map<string, number>();
    (existingEntries || []).forEach((row) => {
      const record = row as Record<string, unknown>;
      const quoteId = safeString(record.quote_id);
      if (!quoteId) return;
      const worked = Math.max(0, safeNumber(record.worked_hours));
      const current = loggedHoursByQuote.get(quoteId) || 0;
      loggedHoursByQuote.set(quoteId, Number((current + worked).toFixed(2)));
    });

    const dayPromptStateByKey = new Map<string, { action: string; snoozeUntil: string }>();
    (promptStates || []).forEach((row) => {
      const record = row as Record<string, unknown>;
      const key = safeString(record.prompt_key);
      if (!key) return;
      dayPromptStateByKey.set(key, {
        action: safeString(record.action),
        snoozeUntil: safeString(record.snooze_until),
      });
    });

    const unresolvedDays = Array.from(dayAggregation.values())
      .filter((item) => !existingPromptKeys.has(item.promptKey))
      .filter((item) => {
        const state = dayPromptStateByKey.get(item.promptKey);
        if (!state) return true;
        if (state.action === 'not_worked') return false;
        if (state.action === 'later' && state.snoozeUntil && state.snoozeUntil > new Date().toISOString()) return false;
        return true;
      });

    if (unresolvedDays.length === 0) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const projectAggregation = new Map<string, PendingHourPrompt>();
    const quoteTotalHoursByProjectPrompt = new Map<string, number>();
    unresolvedDays.forEach((item) => {
      const projectPromptKey = `project:${item.quoteId}`;
      const existing = projectAggregation.get(projectPromptKey);
      if (item.quoteTotalHours && item.quoteTotalHours > 0) {
        const existingQuoteHours = quoteTotalHoursByProjectPrompt.get(projectPromptKey) || 0;
        if (item.quoteTotalHours > existingQuoteHours) {
          quoteTotalHoursByProjectPrompt.set(projectPromptKey, item.quoteTotalHours);
        }
      }
      if (!existing) {
        projectAggregation.set(projectPromptKey, {
          promptKey: projectPromptKey,
          quoteId: item.quoteId,
          quoteLabel: item.quoteLabel,
          workDate: item.workDate,
          endWorkDate: item.workDate,
          suggestedHours: item.suggestedHours,
          pendingDates: [{
            workDate: item.workDate,
            suggestedHours: item.suggestedHours,
            dayPromptKey: item.promptKey,
          }],
          plannedEntryRefs: [...item.plannedEntryRefs],
        });
        return;
      }

      existing.workDate = minDateOnly(existing.workDate, item.workDate);
      existing.endWorkDate = existing.endWorkDate
        ? (existing.endWorkDate >= item.workDate ? existing.endWorkDate : item.workDate)
        : item.workDate;
      existing.suggestedHours = Number((existing.suggestedHours + item.suggestedHours).toFixed(2));
      existing.pendingDates = [...(existing.pendingDates || []), {
        workDate: item.workDate,
        suggestedHours: item.suggestedHours,
        dayPromptKey: item.promptKey,
      }];
      existing.plannedEntryRefs = [...existing.plannedEntryRefs, ...item.plannedEntryRefs];
    });

    const projectPromptKeys = Array.from(projectAggregation.keys());
    const { data: projectStates, error: projectStatesError } = await supabaseAdmin
      .from('time_entry_prompt_state')
      .select('prompt_key, action, snooze_until')
      .eq('user_id', uid)
      .in('prompt_key', projectPromptKeys);

    if (projectStatesError && !isMissingRelationError(projectStatesError.message)) {
      return NextResponse.json({ ok: false, message: projectStatesError.message }, { status: 500 });
    }

    const projectStateByKey = new Map<string, { action: string; snoozeUntil: string }>();
    (projectStates || []).forEach((row) => {
      const record = row as Record<string, unknown>;
      const key = safeString(record.prompt_key);
      if (!key) return;
      projectStateByKey.set(key, {
        action: safeString(record.action),
        snoozeUntil: safeString(record.snooze_until),
      });
    });

    const planningItems = Array.from(projectAggregation.values())
      .map((item) => {
        const quoteTotalHours = canonicalQuoteHoursByQuoteId.get(item.quoteId)
          || quoteTotalHoursByProjectPrompt.get(item.promptKey)
          || scheduledHoursByQuote.get(item.quoteId)
          || 0;
        if (quoteTotalHours <= 0) return item;
        const alreadyLogged = loggedHoursByQuote.get(item.quoteId) || 0;
        const remaining = Math.max(0, Number((quoteTotalHours - alreadyLogged).toFixed(2)));
        const quoteMeta = quoteMetaByQuoteId.get(item.quoteId);
        const uniqueRefs = Array.from(new Set(item.plannedEntryRefs || []));
        const uniqueTypes = Array.from(
          new Set((item.pendingDates || []).map((segment) => {
            const day = dayAggregation.get(segment.dayPromptKey || '');
            return day?.planningType || 'job';
          })),
        );
        const planningType: 'job' | 'werkbespreking' | 'mixed' = uniqueTypes.length <= 1
          ? (uniqueTypes[0] || 'job')
          : 'mixed';
        return {
          ...item,
          quoteNumber: quoteMeta?.quoteNumber || undefined,
          clientName: quoteMeta?.clientName || undefined,
          projectTitle: quoteMeta?.projectTitle || undefined,
          planningType,
          pendingDaysCount: (item.pendingDates || []).length || 1,
          plannedEntryRefs: uniqueRefs,
          suggestedHours: Number(Math.max(0, Math.min(item.suggestedHours, remaining)).toFixed(2)),
        };
      })
      .filter((item) => {
        const meta = quoteMetaByQuoteId.get(item.quoteId);
        if (!meta) return false;
        if (meta.archived) return false;
        return true;
      })
      .filter((item) => item.suggestedHours > 0)
      .filter((item) => {
        const state = projectStateByKey.get(item.promptKey);
        if (!state) return true;
        if (state.action === 'not_worked') return false;
        if (state.action === 'later' && state.snoozeUntil && state.snoozeUntil > new Date().toISOString()) {
          return false;
        }
        return true;
      })
      .sort((left, right) => {
        if (left.workDate !== right.workDate) return left.workDate.localeCompare(right.workDate);
        return left.quoteLabel.localeCompare(right.quoteLabel, 'nl');
      });

    let gpsItems: PendingHourPrompt[] = [];
    try {
      gpsItems = await buildGpsTrackingPrompts(firestore, uid, todayInAmsterdam);
    } catch (gpsError) {
      console.error('GPS-urenprompt overgeslagen:', gpsError);
    }
    const items = [...gpsItems, ...planningItems].sort((left, right) => {
      if (left.workDate !== right.workDate) return left.workDate.localeCompare(right.workDate);
      if ((left.promptSource || 'planning') !== (right.promptSource || 'planning')) {
        return (left.promptSource || 'planning').localeCompare(right.promptSource || 'planning');
      }
      return left.quoteLabel.localeCompare(right.quoteLabel, 'nl');
    });

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
