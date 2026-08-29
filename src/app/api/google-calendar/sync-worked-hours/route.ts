import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { getCalendarClient, isGoogleInvalidGrantError } from '@/lib/integrations/google-calendar';
import {
  GOOGLE_CALENDAR_BLUE_COLOR_ID,
  GOOGLE_CALENDAR_GREEN_COLOR_ID,
  GOOGLE_CALENDAR_YELLOW_COLOR_ID,
} from '@/lib/planning-colors';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIME_ZONE = 'Europe/Amsterdam';
const WORKED_EVENT_TYPE = 'worked-hours';

interface WorkedEntry {
  work_date: string;
  quote_id: string;
  source: string | null;
  exact_minutes: number | null;
  worked_hours: number | null;
  onsite_minutes: number | null;
  outbound_travel_minutes: number | null;
  return_travel_minutes: number | null;
  supplier_travel_minutes: number | null;
  supplier_stop_minutes: number | null;
}

interface WorkedDay {
  date: string;
  quoteId: string;
  minutes: number;
  onsiteMinutes: number;
  travelMinutes: number;
  supplierMinutes: number;
  clientName: string;
  quoteNumber: string;
}

interface DesiredCalendarEvent {
  date: string;
  quoteId: string;
  summary: string;
  description: string;
  colorId: string;
}

const DAILY_TOTAL_ID = '__daily-total__';
const FREE_DAY_ID = '__free-day__';

function bearer(request: Request): string {
  const value = request.headers.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function todayInAmsterdam(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function nextDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function formatMinutes(value: number): string {
  const minutes = Math.max(0, Math.round(value));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours}u`;
  if (hours === 0) return `${rest}m`;
  return `${hours}u ${rest}m`;
}

function formatTitleHours(value: number): string {
  const minutes = Math.max(0, Math.round(value));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours},${rest.toString().padStart(2, '0')}`;
}

function firstName(value: string): string {
  return value.trim().split(/\s+/)[0] || 'Klant';
}

function measuredMinutes(row: WorkedEntry): number {
  return Number(row.onsite_minutes || 0)
    + Number(row.outbound_travel_minutes || 0)
    + Number(row.return_travel_minutes || 0)
    + Number(row.supplier_travel_minutes || 0)
    + Number(row.supplier_stop_minutes || 0);
}

function isGpsMeasuredEntry(row: WorkedEntry): boolean {
  return measuredMinutes(row) > 0
    || (String(row.source || '').startsWith('gps_tracking_') && entryMinutes(row) > 0);
}

function onsiteMinutes(row: WorkedEntry): number {
  const measured = measuredMinutes(row);
  if (measured > 0) return Number(row.onsite_minutes || 0);
  return String(row.source || '').startsWith('gps_tracking_') ? entryMinutes(row) : 0;
}

function entryMinutes(row: WorkedEntry): number {
  const exact = Number(row.exact_minutes || 0);
  if (exact > 0) return exact;
  return Math.round(Number(row.worked_hours || 0) * 60);
}

function timestampDate(value: unknown): Date | null {
  if (!value || typeof value !== 'object' || !('toDate' in value) || typeof value.toDate !== 'function') return null;
  const date = value.toDate();
  return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
}

function localDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function overlapsDate(entry: Record<string, unknown>, date: string): boolean {
  const start = timestampDate(entry.startDate);
  const end = timestampDate(entry.endDate);
  if (!start || !end) return false;
  return localDate(start) <= date && localDate(end) >= date;
}

function isFullyPast(entry: Record<string, unknown>, today: string): boolean {
  const end = timestampDate(entry.endDate);
  return Boolean(end && localDate(end) < today);
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status = Number((error as { code?: unknown; response?: { status?: unknown } }).code
    || (error as { response?: { status?: unknown } }).response?.status);
  return status === 404 || status === 410;
}

export async function POST(request: Request) {
  try {
    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(bearer(request)).catch(() => null);
    if (!decoded?.uid) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const userRef = firestore.collection('users').doc(decoded.uid);
    const userSnap = await userRef.get();
    const integration = userSnap.data()?.integrations?.googleCalendar as {
      connected?: boolean;
      refreshToken?: string;
      accessToken?: string;
      expiryDate?: number;
    } | undefined;
    if (!integration?.connected || !integration.refreshToken) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'calendar_not_connected' });
    }

    const today = todayInAmsterdam();
    const { data, error } = await supabaseAdmin
      .from('time_entries')
      .select('work_date,quote_id,source,exact_minutes,worked_hours,onsite_minutes,outbound_travel_minutes,return_travel_minutes,supplier_travel_minutes,supplier_stop_minutes')
      .eq('user_id', decoded.uid)
      .lt('work_date', today)
      .not('quote_id', 'is', null)
      .order('work_date', { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);

    const measuredRows = ((data || []) as WorkedEntry[]).filter((row) => isGpsMeasuredEntry(row) && row.quote_id);
    if (measuredRows.length === 0) return NextResponse.json({ ok: true, created: 0, updated: 0, removedPlanning: 0 });

    const quoteIds = Array.from(new Set(measuredRows.map((row) => row.quote_id)));
    const quoteSnapshots = await Promise.all(quoteIds.map((quoteId) => firestore.collection('quotes').doc(quoteId).get()));
    const quoteData = new Map<string, Record<string, unknown>>();
    quoteSnapshots.forEach((snapshot) => {
      const value = snapshot.data();
      if (snapshot.exists && value?.userId === decoded.uid) quoteData.set(snapshot.id, value);
    });

    const grouped = new Map<string, WorkedDay>();
    measuredRows.forEach((row) => {
      const quote = quoteData.get(row.quote_id);
      if (!quote) return;
      const info = quote.klantinformatie && typeof quote.klantinformatie === 'object'
        ? quote.klantinformatie as Record<string, unknown>
        : {};
      const clientName = [info.voornaam, info.achternaam].filter(Boolean).join(' ')
        || String(info.bedrijfsnaam || '').trim()
        || 'Onbekende klant';
      const quoteNumber = quote.offerteNummer ? `#${String(quote.offerteNummer)}` : '';
      const key = `${row.work_date}:${row.quote_id}`;
      const current = grouped.get(key) || {
        date: row.work_date,
        quoteId: row.quote_id,
        minutes: 0,
        onsiteMinutes: 0,
        travelMinutes: 0,
        supplierMinutes: 0,
        clientName,
        quoteNumber,
      };
      current.minutes += entryMinutes(row);
      current.onsiteMinutes += onsiteMinutes(row);
      current.travelMinutes += Number(row.outbound_travel_minutes || 0) + Number(row.return_travel_minutes || 0);
      current.supplierMinutes += Number(row.supplier_travel_minutes || 0) + Number(row.supplier_stop_minutes || 0);
      grouped.set(key, current);
    });

    const workedDays = Array.from(grouped.values());
    if (workedDays.length === 0) return NextResponse.json({ ok: true, created: 0, updated: 0, removedPlanning: 0 });
    const firstDate = workedDays.reduce((value, item) => item.date < value ? item.date : value, workedDays[0].date);
    const workedByDate = new Map<string, WorkedDay[]>();
    for (const item of workedDays) {
      const entries = workedByDate.get(item.date) || [];
      entries.push(item);
      workedByDate.set(item.date, entries);
    }

    const desired: DesiredCalendarEvent[] = workedDays.map((item) => ({
      date: item.date,
      quoteId: item.quoteId,
      summary: `${formatTitleHours(item.minutes)} ${firstName(item.clientName)}`,
      description: [
        'Werkelijke GPS-uren uit Calvora',
        item.quoteNumber ? `Offerte: ${item.quoteNumber}` : '',
        `Op locatie: ${formatMinutes(item.onsiteMinutes)}`,
        `Reis: ${formatMinutes(item.travelMinutes)}`,
        `Leverancier: ${formatMinutes(item.supplierMinutes)}`,
      ].filter(Boolean).join('\n'),
      colorId: GOOGLE_CALENDAR_BLUE_COLOR_ID,
    }));

    for (let date = firstDate; date < today; date = nextDate(date)) {
      const entries = workedByDate.get(date) || [];
      if (entries.length === 0) {
        desired.push({
          date,
          quoteId: FREE_DAY_ID,
          summary: 'Vrij',
          description: 'Geen gemeten GPS-werkuren in Calvora.',
          colorId: GOOGLE_CALENDAR_YELLOW_COLOR_ID,
        });
        continue;
      }

      const totalMinutes = entries.reduce((sum, item) => sum + item.minutes, 0);
      desired.push({
        date,
        quoteId: DAILY_TOTAL_ID,
        summary: formatTitleHours(totalMinutes),
        description: `Totaal gemeten GPS-werkuren: ${formatMinutes(totalMinutes)}.`,
        colorId: GOOGLE_CALENDAR_GREEN_COLOR_ID,
      });
    }

    const { calendar, credentials } = await getCalendarClient({
      refreshToken: integration.refreshToken,
      accessToken: integration.accessToken || undefined,
      expiryDate: integration.expiryDate || undefined,
    });
    await userRef.set({ integrations: { googleCalendar: {
      ...integration,
      accessToken: credentials.access_token || integration.accessToken || null,
      expiryDate: credentials.expiry_date || integration.expiryDate || null,
      connected: true,
      updatedAt: new Date(),
    } } }, { merge: true });

    const existingResponse = await calendar.events.list({
      calendarId: 'primary',
      timeMin: `${firstDate}T00:00:00Z`,
      timeMax: `${nextDate(today)}T00:00:00Z`,
      singleEvents: true,
      showDeleted: false,
      maxResults: 2500,
    });
    const existingWorked = new Map<string, { id: string }>();
    for (const event of existingResponse.data.items || []) {
      const privateData = event.extendedProperties?.private;
      if (privateData?.calvoraType !== WORKED_EVENT_TYPE || !event.id) continue;
      const key = `${privateData.calvoraDate || ''}:${privateData.calvoraQuoteId || ''}`;
      existingWorked.set(key, { id: event.id });
    }

    const desiredKeys = new Set(desired.map((item) => `${item.date}:${item.quoteId}`));
    let created = 0;
    let updated = 0;
    for (const item of desired) {
      const key = `${item.date}:${item.quoteId}`;
      const payload = {
        summary: item.summary,
        description: item.description,
        colorId: item.colorId,
        start: { date: item.date },
        end: { date: nextDate(item.date) },
        reminders: { useDefault: false, overrides: [] },
        extendedProperties: { private: {
          calvoraType: WORKED_EVENT_TYPE,
          calvoraDate: item.date,
          calvoraQuoteId: item.quoteId,
        } },
      };
      const existing = existingWorked.get(key);
      if (existing) {
        await calendar.events.update({ calendarId: 'primary', eventId: existing.id, requestBody: payload });
        updated += 1;
      } else {
        await calendar.events.insert({ calendarId: 'primary', requestBody: payload });
        created += 1;
      }
    }

    let removedStale = 0;
    for (const [key, event] of existingWorked) {
      if (desiredKeys.has(key)) continue;
      await calendar.events.delete({ calendarId: 'primary', eventId: event.id }).catch((deleteError) => {
        if (!isNotFound(deleteError)) throw deleteError;
      });
      removedStale += 1;
    }

    const planningSnapshot = await firestore.collection('planning_entries').where('userId', '==', decoded.uid).get();
    const workedDates = new Set(workedDays.map((item) => item.date));
    const planningToRemove = planningSnapshot.docs.filter((document) => {
      const value = document.data() as Record<string, unknown>;
      if (value.planningType === 'werkbespreking') return false;
      if (!String(value.googleCalendarEventId || '').trim()) return false;
      if (!isFullyPast(value, today)) return false;
      return Array.from(workedDates).some((date) => overlapsDate(value, date));
    });
    let removedPlanning = 0;
    for (const document of planningToRemove) {
      const eventId = String(document.data().googleCalendarEventId || '').trim();
      await calendar.events.delete({ calendarId: 'primary', eventId }).catch((deleteError) => {
        if (!isNotFound(deleteError)) throw deleteError;
      });
      await document.ref.set({ googleCalendarEventId: null, status: 'completed', updatedAt: new Date() }, { merge: true });
      removedPlanning += 1;
    }

    return NextResponse.json({ ok: true, created, updated, removedPlanning, removedStale });
  } catch (error) {
    if (isGoogleInvalidGrantError(error)) {
      return NextResponse.json({ ok: false, message: 'Google Calendar moet opnieuw gekoppeld worden.', code: 'google_calendar_reconnect_required' }, { status: 409 });
    }
    console.error('google calendar worked-hours sync error', error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'Gewerkte uren synchroniseren mislukt.' }, { status: 500 });
  }
}
