import { randomUUID } from 'node:crypto';
import type { calendar_v3 } from 'googleapis';
import { getCalendarClient } from '@/lib/integrations/google-calendar';
import { reservationDate, googleEventIsMissing, isTelegramReservation } from '@/lib/google-calendar-reservations';
import { findCompletedGpsVisit, gpsVisitDistanceMeters, type GpsVisitPoint, type GpsVisitSite } from '@/lib/quote-visit-gps';

type Row = Record<string, any>;
interface Address { street: string; number: string; city: string; postcode: string; text: string }
class VisitEventChanged extends Error {}
const clean = (value: unknown): string => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
const normalize = (value: string): string => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const day = (date: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

export function visitAddress(quote: Row): Address | null {
  const info = quote.klantinformatie || {};
  const explicit = info.projectadres || info.projectAdres;
  const flat = { straat: info.projectStraat, huisnummer: info.projectHuisnummer, postcode: info.projectPostcode, plaats: info.projectPlaats };
  const hasProject = explicit || Object.values(flat).some(Boolean) || info.afwijkendProjectadres;
  const source = hasProject ? explicit || flat : info.factuuradres || info.factuurAdres || info;
  const street = clean(source.straat), number = clean(source.huisnummer), city = clean(source.plaats), postcode = clean(source.postcode);
  if (!street || !/^\d+[\p{L}\p{N}\s\-/]*$/u.test(number) || !city) return null;
  return { street, number, city, postcode, text: `${street} ${number}, ${postcode} ${city}`.replace(/\s+/g, ' ').trim() };
}

async function getJson(url: string, headers?: Record<string, string>): Promise<any> {
  const result = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  if (!result.ok) throw new Error(`Bezoekcontrole: HTTP ${result.status}`);
  return result.json();
}

export function exactVisitSite(payload: Row, address: Address): GpsVisitSite | null {
  if (payload.status !== 'OK' || payload.results?.length !== 1) return null;
  const result = payload.results[0];
  if (result.partial_match || result.geometry?.location_type !== 'ROOFTOP') return null;
  const part = (type: string) => clean(result.address_components?.find((part: Row) => part.types?.includes(type))?.long_name);
  if (normalize(part('route')) !== normalize(address.street) || normalize(part('street_number')) !== normalize(address.number)
    || normalize(part('locality') || part('postal_town')) !== normalize(address.city)
    || (address.postcode && normalize(part('postal_code')) !== normalize(address.postcode))) return null;
  const { lat, lng } = result.geometry.location || {};
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)
    ? { latitude: lat, longitude: lng } : null;
}

function fingerprint(entry: Row): string {
  return JSON.stringify([entry.userId, entry.quoteId, entry.status, entry.googleCalendarEventId, entry.calendarSyncRevision,
    reservationDate(entry.startDate)?.toISOString(), reservationDate(entry.endDate)?.toISOString()]);
}

/** Alleen dezelfde dag, expliciet gekoppelde Telegram-werkbesprekingen. Geen aanwezigheidsaanname uit uren of agendatijd. */
export async function completeVisitedAppointments(
  firestore: FirebaseFirestore.Firestore, uid: string, suppliedCalendar?: calendar_v3.Calendar,
): Promise<{ completed: number; checked: number }> {
  const result = { completed: 0, checked: 0 };
  // Het gedeelde Traccar-device hoort uitsluitend bij de ingestelde eigenaar.
  if (!process.env.CALVORA_USER_ID || uid !== process.env.CALVORA_USER_ID.trim()) return result;
  const token = process.env.TRACCAR_API_TOKEN?.trim();
  const identifier = process.env.TRACCAR_DEVICE_IDENTIFIER?.trim();
  const key = process.env.GOOGLE_GEOCODING_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || process.env.ANTIGRAVITY_GOOGLE_API_KEY?.trim();
  if (!token || !identifier || !key) return result;
  const now = new Date();
  const today = day(now);
  const snapshot = await firestore.collection('planning_entries').where('userId', '==', uid).get();
  const candidates = snapshot.docs.filter(doc => {
    const entry = doc.data();
    const start = reservationDate(entry.startDate);
    return isTelegramReservation(entry) && entry.planningType === 'werkbespreking'
      && ['pending', 'scheduled', 'confirmed', 'in_progress'].includes(entry.status)
      && entry.quoteId && entry.googleCalendarEventId && start && day(start) === today
      && (reservationDate(entry.calendarSyncLeaseUntil)?.getTime() || 0) <= now.getTime()
      && (entry.calendarSyncState === 'synced' || entry.visitCompletion);
  });
  if (!candidates.length) return result;
  const quotes = await firestore.collection('quotes').where('userId', '==', uid).get();
  const byId = new Map(quotes.docs.map(doc => [doc.id, doc]));
  const addresses = new Map(quotes.docs.filter(doc => doc.data().archived !== true).map(doc => [doc.id, visitAddress(doc.data())]));
  const sites = new Map<string, GpsVisitSite | null>();
  for (const doc of candidates) {
    const address = addresses.get(doc.data().quoteId);
    if (!address || sites.has(address.text)) continue;
    const params = new URLSearchParams({ address: address.text, language: 'nl', region: 'nl', key });
    sites.set(address.text, exactVisitSite(await getJson(`https://maps.googleapis.com/maps/api/geocode/json?${params}`), address));
  }
  if (![...sites.values()].some(Boolean)) return result;
  const base = (process.env.TRACCAR_SERVER_URL || 'https://demo.traccar.org').replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const devices = await getJson(`${base}/api/devices?uniqueId=${encodeURIComponent(identifier)}`, headers);
  const device = devices.find((value: Row) => value.uniqueId === identifier);
  if (!device?.id) return result;
  // Een iets ruimer UTC-venster; uitsluitend fixtijden van vandaag in Amsterdam tellen mee.
  const from = new Date(now.getTime() - 26 * 3_600_000).toISOString();
  const params = new URLSearchParams({ deviceId: String(device.id), from, to: now.toISOString() });
  const raw: GpsVisitPoint[] = await getJson(`${base}/api/positions?${params}`, headers);
  if (!Array.isArray(raw) || raw.some(point => !point.fixTime || !Number.isFinite(Date.parse(point.fixTime)))) return result;
  const points = raw.filter(point => day(new Date(point.fixTime!)) === today);
  let calendar = suppliedCalendar;
  const lockRef = firestore.collection('telegram_appointment_locks').doc(uid);
  for (const document of candidates) {
    const entry = document.data();
    const quote = byId.get(entry.quoteId);
    const address = addresses.get(entry.quoteId);
    const site = address && sites.get(address.text);
    if (!quote || !address || !site) continue;
    // Twee offertes/afspraken op hetzelfde of een nabij adres zijn niet eenduidig.
    if ([...addresses].some(([id, other]) => id !== entry.quoteId && other
      && normalize(other.street) === normalize(address.street) && normalize(other.number) === normalize(address.number)
      && normalize(other.city) === normalize(address.city))) continue;
    if (candidates.some(other => other.id !== document.id && (other.data().quoteId === entry.quoteId
      || (() => { const a = addresses.get(other.data().quoteId); const s = a && sites.get(a.text); return s && gpsVisitDistanceMeters(s, site) <= 100; })()))) continue;
    result.checked += 1;
    const evidence = findCompletedGpsVisit(points, site, { expectedDeviceId: device.id, from, to: now.toISOString(), now });
    const created = reservationDate(entry.createdAt);
    if (!evidence || !created || created.getTime() > Date.parse(evidence.startedAt)) continue;
    if (!calendar) {
      const user = await firestore.collection('users').doc(uid).get();
      const integration = user.data()?.integrations?.googleCalendar;
      if (!integration?.connected || !integration.refreshToken) return result;
      calendar = (await getCalendarClient({ refreshToken: integration.refreshToken, accessToken: integration.accessToken, expiryDate: integration.expiryDate })).calendar;
    }
    const lease = randomUUID();
    const acquired = await firestore.runTransaction(async transaction => {
      const [fresh, freshQuote, lock] = await transaction.getAll(document.ref, quote.ref, lockRef);
      const current = fresh.data();
      if (!current || fingerprint(current) !== fingerprint(entry) || freshQuote.data()?.userId !== uid
        || freshQuote.data()?.archived === true || visitAddress(freshQuote.data()!)?.text !== address.text
        || (reservationDate(current.calendarSyncLeaseUntil)?.getTime() || 0) > Date.now()) return false;
      transaction.set(document.ref, { calendarSyncLeaseToken: lease, calendarSyncLeaseUntil: new Date(Date.now() + 120_000),
        calendarSyncState: 'pending', visitCompletion: { ...evidence, address: address.text, deviceId: device.id }, updatedAt: new Date() }, { merge: true });
      transaction.set(lockRef, { version: Number(lock.data()?.version || 0) + 1 }, { merge: true });
      return true;
    });
    if (!acquired) continue;
    try {
      let event: calendar_v3.Schema$Event | null = null;
      try { event = (await calendar.events.get({ calendarId: 'primary', eventId: entry.googleCalendarEventId })).data; }
      catch (error) { if (!googleEventIsMissing(error)) throw error; }
      if (event && event.status !== 'cancelled') {
        const properties = event.extendedProperties?.private;
        if (properties?.calvoraPlanningEntryId !== document.id || properties.calvoraQuoteId !== entry.quoteId
          || !event.etag || Date.parse(event.start?.dateTime || '') !== reservationDate(entry.startDate)?.getTime()
          || Date.parse(event.end?.dateTime || '') !== reservationDate(entry.endDate)?.getTime()) {
          throw new VisitEventChanged('Agenda-afspraak gewijzigd of niet eenduidig gekoppeld; bezoek niet afgerond.');
        }
        try { await calendar.events.delete({ calendarId: 'primary', eventId: entry.googleCalendarEventId, sendUpdates: 'none' }, { headers: { 'If-Match': event.etag } }); }
        catch (error) { if (!googleEventIsMissing(error)) throw error; }
      }
      await firestore.runTransaction(async transaction => {
        const [fresh, lock, currentQuote] = await transaction.getAll(document.ref, lockRef, quote.ref);
        if (fresh.data()?.calendarSyncLeaseToken !== lease) throw new Error('Bezoekcontrole vergrendeling gewijzigd.');
        const imports = await transaction.get(firestore.collection('telegram_lead_imports').where('userId', '==', uid));
        if (currentQuote.data()?.userId === uid && currentQuote.data()?.archived !== true && currentQuote.data()?.status === 'werkbespreking') {
          transaction.set(quote.ref, { status: 'concept', updatedAt: new Date() }, { merge: true });
        }
        transaction.set(document.ref, { status: 'completed', appointmentState: 'completed', calendarSyncState: 'completed',
          completedAt: new Date(evidence.departedAt), calendarSyncLeaseToken: null, calendarSyncLeaseUntil: null,
          calendarSyncError: null, updatedAt: new Date() }, { merge: true });
        for (const imported of imports.docs.filter(doc => doc.data().appointment_id === document.id)) {
          transaction.set(imported.ref, { appointment_status: 'completed', calendar_synced: true, telegram_message: null,
            suggested_appointment_options: [], suggested_appointment_date: null, suggested_appointment_time: null, updatedAt: new Date() }, { merge: true });
        }
        transaction.set(lockRef, { version: Number(lock.data()?.version || 0) + 1 }, { merge: true });
      });
      result.completed += 1;
    } catch (error) {
      const changed = error instanceof VisitEventChanged || Number((error as { response?: { status?: number }; code?: number })?.response?.status
        || (error as { code?: number })?.code) === 412;
      await firestore.runTransaction(async transaction => {
        const fresh = await transaction.get(document.ref);
        if (fresh.data()?.calendarSyncLeaseToken !== lease) return;
        transaction.set(document.ref, { calendarSyncState: changed ? 'synced' : 'failed', calendarSyncLeaseToken: null, calendarSyncLeaseUntil: null,
          ...(changed ? { visitCompletion: null } : {}),
          calendarSyncError: error instanceof Error ? error.message : 'Bezoekcontrole mislukt', updatedAt: new Date() }, { merge: true });
      });
      throw error;
    }
  }
  return result;
}
