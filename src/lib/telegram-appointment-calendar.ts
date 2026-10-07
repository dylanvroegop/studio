import { createHash } from 'crypto';
import type { calendar_v3 } from 'googleapis';
import type { AppointmentPlanningEntry } from './appointment-suggestions';

const TIME_ZONE = 'Europe/Amsterdam';

export class TelegramCalendarDeleted extends Error {
  constructor() { super('De afspraak is in Google Calendar verwijderd.'); }
}

export class TelegramCalendarConflict extends Error {
  constructor() { super('Dit moment is inmiddels bezet.'); }
}

export function telegramCalendarConfirmed(event: calendar_v3.Schema$Event): boolean {
  return event.extendedProperties?.private?.appointmentStatus === 'confirmed'
    || Boolean(event.description?.split('\n').some(line => /^Status:\s*confirmed\s*$/i.test(line.trim())));
}

export function telegramCalendarEventId(entryId: string): string {
  // Google accepteert base32hex; een vaste hex-hash maakt onzekere retries veilig.
  return `calvora${createHash('sha256').update(entryId).digest('hex')}`;
}

function statusCode(error: unknown): number {
  const value = error as { code?: unknown; response?: { status?: unknown } };
  return Number(value?.response?.status || value?.code || 0);
}

export async function readTelegramCalendarEvent(calendar: calendar_v3.Calendar, eventId: string): Promise<calendar_v3.Schema$Event | null> {
  try {
    const result = await calendar.events.get({ calendarId: 'primary', eventId });
    return result.data.status === 'cancelled' ? null : result.data;
  } catch (error) {
    if ([404, 410].includes(statusCode(error))) return null;
    throw error;
  }
}

function midnight(dateOnly: string): Date {
  const utc = new Date(`${dateOnly}T00:00:00Z`);
  const offset = new Intl.DateTimeFormat('en', { timeZone: TIME_ZONE, timeZoneName: 'shortOffset' })
    .formatToParts(utc).find(part => part.type === 'timeZoneName')?.value || 'GMT';
  const match = offset.match(/GMT([+-])(\d+)(?::(\d+))?/);
  const minutes = match ? (Number(match[2]) * 60 + Number(match[3] || 0)) * (match[1] === '+' ? 1 : -1) : 0;
  return new Date(utc.getTime() - minutes * 60_000);
}

export function telegramCalendarPlanningEntry(event: calendar_v3.Schema$Event): (AppointmentPlanningEntry & { googleEventId: string }) | null {
  if (!event.id || event.status === 'cancelled' || event.transparency === 'transparent'
    || event.attendees?.some(attendee => attendee.self && attendee.responseStatus === 'declined')) return null;
  const startDate = event.start?.dateTime ? new Date(event.start.dateTime) : event.start?.date ? midnight(event.start.date) : null;
  const endDate = event.end?.dateTime ? new Date(event.end.dateTime) : event.end?.date ? midnight(event.end.date) : null;
  if (!startDate || !endDate || !Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) return null;
  return { googleEventId: event.id, startDate, endDate, city: '' };
}

export async function loadTelegramCalendarWindow(calendar: calendar_v3.Calendar, start: Date, end: Date): Promise<calendar_v3.Schema$Event[]> {
  const events: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  do {
    const result = await calendar.events.list({
      calendarId: 'primary', timeMin: start.toISOString(), timeMax: end.toISOString(),
      singleEvents: true, showDeleted: false, maxResults: 2500, pageToken,
    });
    events.push(...(result.data.items || []));
    pageToken = result.data.nextPageToken || undefined;
  } while (pageToken);
  return events;
}

export async function findTelegramCalendarEvent(calendar: calendar_v3.Calendar, leadKey: string): Promise<calendar_v3.Schema$Event | null> {
  const marker = `Telegram-sessie: ${leadKey.replace(/^telegram_session_/, '')}`;
  const matches: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  do {
    const response = await calendar.events.list({ calendarId: 'primary', q: marker, showDeleted: false, maxResults: 2500, pageToken });
    matches.push(...(response.data.items || []).filter(event => event.id && event.status !== 'cancelled'
      && event.description?.split('\n').some(line => line.trim() === marker)));
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);
  if (matches.length > 1) throw new Error('Meerdere Google Calendar-afspraken voor dezelfde Telegram-sessie; controleer deze eerst.');
  return matches[0] || null;
}

export interface TelegramCalendarAppointment {
  entryId: string;
  quoteId: string;
  leadKey: string;
  status: 'pending' | 'scheduled';
  startDate: Date;
  endDate: Date;
  clientName: string;
  projectTitle: string;
  projectAddress: string;
  phone?: string;
  googleCalendarEventId?: string | null;
  googleCalendarColorId?: string | null;
}

export async function syncTelegramAppointmentCalendar(calendar: calendar_v3.Calendar, appointment: TelegramCalendarAppointment): Promise<string> {
  const eventId = appointment.googleCalendarEventId || telegramCalendarEventId(appointment.entryId);
  let existing = await readTelegramCalendarEvent(calendar, eventId);
  if (appointment.googleCalendarEventId && !existing) throw new TelegramCalendarDeleted();
  if (existing?.extendedProperties?.private?.calvoraPlanningEntryId
    && existing.extendedProperties.private.calvoraPlanningEntryId !== appointment.entryId) {
    throw new Error('Google Calendar-afspraak hoort bij een andere planning.');
  }
  const window = await loadTelegramCalendarWindow(calendar, appointment.startDate, appointment.endDate);
  if (window.some(event => {
    const busy = telegramCalendarPlanningEntry(event);
    return busy && busy.googleEventId !== eventId && busy.startDate < appointment.endDate && busy.endDate > appointment.startDate;
  })) throw new TelegramCalendarConflict();

  const pending = appointment.status === 'pending';
  const hour = new Intl.DateTimeFormat('nl-NL', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(appointment.startDate);
  const sessionId = appointment.leadKey.replace(/^telegram_session_/, '');
  const payload: calendar_v3.Schema$Event = {
    summary: `${pending ? 'PENDING · ' : ''}${appointment.clientName || 'Werkbespreking'} ${hour}`,
    description: [
      `Klant: ${appointment.clientName}`, appointment.phone ? `Telefoon: ${appointment.phone}` : '',
      `Werk: ${appointment.projectTitle}`, appointment.projectAddress ? `Adres: ${appointment.projectAddress}` : '',
      `Offerte: ${appointment.quoteId}`, `Telegram-sessie: ${sessionId}`, `Status: ${pending ? 'pending' : 'confirmed'}`,
    ].filter(Boolean).join('\n'),
    location: appointment.projectAddress,
    status: pending ? 'tentative' : 'confirmed', transparency: 'opaque',
    colorId: existing?.colorId || appointment.googleCalendarColorId || '11',
    start: { dateTime: appointment.startDate.toISOString(), timeZone: TIME_ZONE },
    end: { dateTime: appointment.endDate.toISOString(), timeZone: TIME_ZONE },
    extendedProperties: { private: {
      ...existing?.extendedProperties?.private,
      calvoraPlanningEntryId: appointment.entryId, calvoraQuoteId: appointment.quoteId,
      calvoraType: 'telegram-appointment', appointmentStatus: pending ? 'pending' : 'confirmed', telegramSessionId: sessionId,
    } },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 90 }] },
  };
  const patchExisting = async () => {
    try {
      await calendar.events.patch(
        { calendarId: 'primary', eventId, requestBody: payload, sendUpdates: 'none' },
        existing?.etag ? { headers: { 'If-Match': existing.etag } } : undefined,
      );
    } catch (error) {
      if ([404, 410].includes(statusCode(error))) throw new TelegramCalendarDeleted();
      throw error;
    }
  };
  if (existing) {
    await patchExisting();
    return eventId;
  }
  try {
    await calendar.events.insert({ calendarId: 'primary', requestBody: { ...payload, id: eventId }, sendUpdates: 'none' });
  } catch (error) {
    if (statusCode(error) !== 409) throw error;
    existing = await readTelegramCalendarEvent(calendar, eventId);
    if (!existing) throw new TelegramCalendarDeleted();
    if (existing.extendedProperties?.private?.calvoraPlanningEntryId !== appointment.entryId) throw error;
    await patchExisting();
  }
  return eventId;
}
