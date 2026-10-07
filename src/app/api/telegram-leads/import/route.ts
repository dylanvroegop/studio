import { createHash, randomUUID, timingSafeEqual } from 'crypto';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { initFirebaseAdmin } from '@/firebase/admin';
import {
  assertSameTelegramClient,
  selectTelegramClient,
  storedClientIdentity,
  TelegramIdentityConflict,
} from '@/lib/telegram-client-identity';
import {
  getAppointmentSuggestions,
  getCityFromAddress,
  type AppointmentPlanningEntry,
  type AppointmentSuggestion,
} from '@/lib/appointment-suggestions';
import { getCalendarClient } from '@/lib/integrations/google-calendar';
import {
  findTelegramCalendarEvent,
  loadTelegramCalendarWindow,
  readTelegramCalendarEvent,
  syncTelegramAppointmentCalendar,
  telegramCalendarEventId,
  telegramCalendarConfirmed,
  telegramCalendarPlanningEntry,
  TelegramCalendarConflict,
  TelegramCalendarDeleted,
} from '@/lib/telegram-appointment-calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCE = 'telegram_werkspot';
const AMSTERDAM_TIME_ZONE = 'Europe/Amsterdam';
const DEFAULT_STANDARD_HOURLY_RATE = 55;

const nullableString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().max(500).nullable().optional()
);

const importSchema = z.object({
  lead_key: z.string().trim().min(1).max(200),
  client: z.object({
    client_name: nullableString,
    phone: nullableString,
    email: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      z.string().trim().email().max(320).nullable().optional()
    ),
    address: nullableString,
    city: nullableString,
    job_title: nullableString,
    appointment_date: nullableString,
    appointment_time: nullableString,
    appointment_status: z.enum(['pending', 'confirmed', 'not_found']).optional(),
  }).superRefine((client, context) => {
    if (!client.phone && !client.email && !(client.client_name && client.city)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide phone, email, or both client_name and city.',
      });
    }
  }),
  appointment_status: z.enum(['pending', 'confirmed', 'not_found']).optional(),
});

type ImportInput = z.infer<typeof importSchema>;

interface ImportResult {
  client_id: string;
  project_id: string;
  appointment_id: string | null;
  appointment_status: 'none' | 'pending' | 'scheduled' | 'cancelled';
  appointment_date: string | null;
  appointment_time: string | null;
  suggested_appointment_date: string | null;
  suggested_appointment_time: string | null;
  suggested_appointment_options: Array<Pick<AppointmentSuggestion, 'date' | 'time'>>;
  telegram_message: string | null;
  calendar_synced?: boolean;
  google_calendar_event_id?: string | null;
}

interface ExistingImportResult extends Partial<ImportResult> {
  client_id: string;
  project_id: string;
  appointment_id?: string | null;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveAutomationUid(request: Request): string | null {
  const expectedSecret = process.env.N8N_HEADER_SECRET?.trim() || '';
  const providedSecret = request.headers.get('x-offertehulp-secret')?.trim() || '';
  if (!expectedSecret || !providedSecret || !safeEqual(providedSecret, expectedSecret)) return null;

  return (
    request.headers.get('x-offertehulp-user-id')?.trim()
    || process.env.CALVORA_USER_ID?.trim()
    || null
  );
}

function splitName(name: string | null | undefined): { firstName: string | null; lastName: string | null } {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function splitAddress(address: string | null | undefined): { street: string | null; houseNumber: string | null } {
  const normalized = address?.trim() || '';
  if (!normalized) return { street: null, houseNumber: null };

  const match = normalized.match(/^(.+?)\s+(\d.*)$/);
  if (!match) return { street: normalized, houseNumber: null };
  return { street: match[1].trim(), houseNumber: match[2].trim() };
}

function amsterdamDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AMSTERDAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function formatDateOnly(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function resolveDateOnly(value: string, now = new Date()): string | null {
  const normalized = value.trim().toLocaleLowerCase('nl-NL');
  const relativeDays: Record<string, number> = {
    today: 0,
    vandaag: 0,
    tomorrow: 1,
    morgen: 1,
    'day after tomorrow': 2,
    overmorgen: 2,
  };

  if (normalized in relativeDays) {
    const current = amsterdamDateParts(now);
    const shifted = new Date(Date.UTC(current.year, current.month - 1, current.day + relativeDays[normalized]));
    return formatDateOnly(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoMatch) return null;
  const year = Number(isoMatch[1]);
  const month = Number(isoMatch[2]);
  const day = Number(isoMatch[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return formatDateOnly(year, month, day);
}

function timeZoneOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AMSTERDAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const representedAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return representedAsUtc - date.getTime();
}

function amsterdamDateTime(dateOnly: string, time: string): Date | null {
  const timeMatch = time.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!timeMatch) return null;

  const [year, month, day] = dateOnly.split('-').map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, Number(timeMatch[1]), Number(timeMatch[2]));
  let utc = localAsUtc - timeZoneOffsetMs(new Date(localAsUtc));
  utc = localAsUtc - timeZoneOffsetMs(new Date(utc));
  return new Date(utc);
}

function importDocumentId(uid: string, leadKey: string): string {
  return createHash('sha256').update(`${uid}:${leadKey}`).digest('hex');
}

function response(result: ImportResult) {
  return NextResponse.json({
    success: true,
    ...result,
    message: 'Telegram lead imported',
  });
}

function firestoreDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object') {
    const dateValue = value as { toDate?: unknown; seconds?: unknown };
    if (typeof dateValue.toDate === 'function') {
      const date = dateValue.toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
    }
    if (typeof dateValue.seconds === 'number') return new Date(dateValue.seconds * 1000);
  }
  return null;
}

class CalendarWindowRequired extends Error {
  constructor(public end: Date) { super('Verder zoeken in Google Calendar.'); }
}

class CalendarSyncInProgress extends Error {
  constructor() { super('De afspraak wordt nog met Google Calendar gesynchroniseerd. Probeer opnieuw.'); }
}

class CalendarNoAvailability extends Error {
  constructor() { super('Binnen een jaar is geen vrij voorstel beschikbaar. Kies handmatig een ander tijdstip.'); }
}

function planningEntry(data: Record<string, unknown>): AppointmentPlanningEntry | null {
  if (data.status === 'cancelled' || data.calendarSyncState === 'cancelled') return null;
  const startDate = firestoreDate(data.startDate);
  if (!startDate) return null;
  const rawEnd = firestoreDate(data.endDate);
  const scheduledHours = Number(data.scheduledHours);
  const endDate = rawEnd && rawEnd > startDate ? rawEnd
    : new Date(startDate.getTime() + (scheduledHours > 0 && Number.isFinite(scheduledHours) ? scheduledHours : 1) * 3_600_000);
  const cache = data.cache && typeof data.cache === 'object' ? data.cache as Record<string, unknown> : {};
  return { startDate, endDate, city: getCityFromAddress(cache.projectAddress) };
}

function planningFingerprint(data: Record<string, unknown>): string {
  return JSON.stringify([data.googleCalendarEventId, data.calendarSyncRevision, data.calendarSyncState, data.status,
    firestoreDate(data.startDate)?.getTime(), firestoreDate(data.endDate)?.getTime(), firestoreDate(data.updatedAt)?.getTime()]);
}

function resultFromAppointment(result: ImportResult, data: Record<string, unknown>, client: ImportInput['client']): ImportResult {
  if (data.status === 'cancelled' || data.calendarSyncState === 'cancelled') return {
    ...result, appointment_status: 'cancelled', calendar_synced: true,
    suggested_appointment_date: null, suggested_appointment_time: null, suggested_appointment_options: [], telegram_message: null,
  };
  const range = planningEntry(data);
  if (!range) throw new Error('De opgeslagen afspraak mist een geldige datum.');
  const parts = amsterdamDateParts(range.startDate);
  const date = formatDateOnly(parts.year, parts.month, parts.day);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: AMSTERDAM_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(range.startDate);
  const pending = data.status !== 'scheduled' && data.status !== 'confirmed';
  const suggestion = { date, time };
  return {
    ...result, appointment_status: pending ? 'pending' : 'scheduled', appointment_date: date, appointment_time: time,
    suggested_appointment_date: pending ? date : null, suggested_appointment_time: pending ? time : null,
    suggested_appointment_options: pending ? [suggestion] : [], telegram_message: pending ? buildTelegramMessage(client, suggestion) : null,
    calendar_synced: false, google_calendar_event_id: typeof data.googleCalendarEventId === 'string' ? data.googleCalendarEventId : null,
  };
}

function clientDisplayName(client: ImportInput['client']): string {
  return splitName(client.client_name).firstName || 'klant';
}

function formatDutchAppointmentDate(dateOnly: string): string {
  const date = new Date(`${dateOnly}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateOnly;
  return new Intl.DateTimeFormat('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: AMSTERDAM_TIME_ZONE,
  }).format(date);
}

function buildTelegramMessage(client: ImportInput['client'], suggestion: Pick<AppointmentSuggestion, 'date' | 'time'>): string {
  return `Beste ${clientDisplayName(client)},

Bedankt voor uw bericht.

Ik kan op ${formatDutchAppointmentDate(suggestion.date)} om ${suggestion.time} langskomen voor een werkbespreking.

Komt dit moment u gelegen? Mocht dit moment niet uitkomen, welke dag en tijd zouden u beter uitkomen?

Dan bespreek ik de werkzaamheden met u en maak ik daarna kosteloos een offerte voor u op.

Mvg,
Dylan

Vroegop timmerwerken`;
}

export async function POST(request: Request) {
  const uid = resolveAutomationUid(request);
  if (!uid) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized or CALVORA_USER_ID is not configured' },
      { status: 401 }
    );
  }

  let input: ImportInput;
  try {
    const rawBody: unknown = await request.json();
    const parsed = importSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: 'Invalid request body', errors: parsed.error.flatten() },
        { status: 400 }
      );
    }
    input = parsed.data;
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const { firestore, auth } = initFirebaseAdmin();
  const importRef = firestore.collection('telegram_lead_imports').doc(importDocumentId(uid, input.lead_key));

  try {
    await auth.getUser(uid);

    const clientInput = input.client;
    const requestedAppointmentStatus = clientInput.appointment_status || input.appointment_status || null;
    const newClientRef = firestore.collection('clients').doc();
    const newProjectRef = firestore.collection('quotes').doc();
    const newAppointmentRef = firestore.collection('planning_entries').doc();
    const { firstName, lastName } = splitName(clientInput.client_name);
    const { street, houseNumber } = splitAddress(clientInput.address);
    const jobTitle = clientInput.job_title || 'Werkspot-lead';

    let appointmentStart: Date | null = null;
    let appointmentDateOnly: string | null = null;
    if (clientInput.appointment_date && clientInput.appointment_time) {
      appointmentDateOnly = resolveDateOnly(clientInput.appointment_date);
      appointmentStart = appointmentDateOnly ? amsterdamDateTime(appointmentDateOnly, clientInput.appointment_time) : null;
      if (!appointmentStart) {
        return NextResponse.json(
          { success: false, message: 'Invalid appointment_date or appointment_time' },
          { status: 400 }
        );
      }
    }

    const userSnapshot = await firestore.collection('users').doc(uid).get();
    const userData = userSnapshot.data() || {};
    const userSettings = userData.instellingen || userData.settings || {};
    const planningSettings = userData.settings?.planningSettings || userData.instellingen?.planningSettings || {};
    const configuredWorkDays = Array.isArray(planningSettings.workDays)
      ? planningSettings.workDays.map(Number).filter((day: number) => Number.isInteger(day) && day >= 1 && day <= 7)
      : [];
    // Werkbesprekingen mogen ook op zondag, los van de werkdagen voor klussen.
    const appointmentDays = [...(configuredWorkDays.length ? configuredWorkDays : [1, 2, 3, 4, 5]), 7];
    const counterRef = firestore.collection('counters').doc(`quoteNumber_${uid}`);

    const integration = userData.integrations?.googleCalendar;
    if (!integration?.connected || !integration.refreshToken) {
      return NextResponse.json({ success: false, code: 'CALENDAR_NOT_CONNECTED', message: 'Koppel Google Calendar voordat een afspraak wordt voorgesteld.' }, { status: 503 });
    }
    const { calendar } = await getCalendarClient({
      refreshToken: integration.refreshToken, accessToken: integration.accessToken || undefined, expiryDate: integration.expiryDate || undefined,
    });
    const lockRef = firestore.collection('telegram_appointment_locks').doc(uid);
    const planningQuery = firestore.collection('planning_entries').where('userId', '==', uid);
    const observedPlanning = await planningQuery.get();
    const calendarReconciliations = new Map<string, { fingerprint: string; patch: Record<string, unknown> }>();
    const reconcileLinkedEvent = async (document: (typeof observedPlanning.docs)[number]) => {
      const data = document.data();
      const historicalConfirmed = (data.status === 'scheduled' || data.status === 'confirmed')
        && (planningEntry(data)?.endDate.getTime() || Infinity) < Date.now() && data.leadKey !== input.lead_key;
      if (data.status === 'cancelled' || !(data.source === SOURCE || data.leadKey)
        || historicalConfirmed
        || !data.googleCalendarEventId
        || (firestoreDate(data.calendarSyncLeaseUntil)?.getTime() || 0) > Date.now()) return;
      const event = await readTelegramCalendarEvent(calendar, data.googleCalendarEventId);
      if (!event) calendarReconciliations.set(document.id, { fingerprint: planningFingerprint(data), patch: {
        status: 'cancelled', appointmentState: 'cancelled', calendarSyncState: 'cancelled', cancelledInGoogle: true, cancelledBy: 'google_calendar',
      } });
      else if (!data.calendarSyncState || data.calendarSyncState === 'synced') {
        const range = telegramCalendarPlanningEntry({ ...event, transparency: 'opaque' });
        const confirmed = telegramCalendarConfirmed(event);
        if (range && (range.startDate.getTime() !== firestoreDate(data.startDate)?.getTime()
          || range.endDate.getTime() !== firestoreDate(data.endDate)?.getTime() || (confirmed && data.status !== 'scheduled'))) {
          calendarReconciliations.set(document.id, { fingerprint: planningFingerprint(data), patch: {
            startDate: Timestamp.fromDate(range.startDate), endDate: Timestamp.fromDate(range.endDate),
            ...(confirmed ? { status: 'scheduled', appointmentState: 'scheduled' } : {}),
          } });
        }
      }
    };
    for (let index = 0; index < observedPlanning.docs.length; index += 8) {
      await Promise.all(observedPlanning.docs.slice(index, index + 8).map(reconcileLinkedEvent));
    }
    const calendarWindowStart = new Date(Math.min(Date.now(), appointmentStart?.getTime() || Infinity) - 86_400_000);
    let calendarWindowEnd = new Date(Math.max(Date.now() + 32 * 86_400_000, (appointmentStart?.getTime() || 0) + 86_400_000));
    const maxSuggestionWindowEnd = new Date(Date.now() + 366 * 86_400_000);
    let calendarEvents = await loadTelegramCalendarWindow(calendar, calendarWindowStart, calendarWindowEnd);
    const matchingCalendarEvent = await findTelegramCalendarEvent(calendar, input.lead_key);
    let result: ImportResult;
    for (;;) {
      try {
        result = await firestore.runTransaction(async (transaction): Promise<ImportResult> => {
      const lockSnapshot = await transaction.get(lockRef);
      const planningSnapshot = await transaction.get(planningQuery);
      const importSnapshot = await transaction.get(firestore.collection('telegram_lead_imports').where('userId', '==', uid));
      const reconciliations = planningSnapshot.docs.flatMap(document => {
        const data = document.data();
        const reconciliation = calendarReconciliations.get(document.id);
        return reconciliation && reconciliation.fingerprint === planningFingerprint(data)
          && (firestoreDate(data.calendarSyncLeaseUntil)?.getTime() || 0) <= Date.now()
          ? [{ document, patch: reconciliation.patch, data: { ...data, ...reconciliation.patch } }] : [];
      });
      const cancelledGoogleIds = new Set<string>([
        ...reconciliations.filter(value => value.patch.status === 'cancelled').map(value => String(value.document.data().googleCalendarEventId || '')),
        ...planningSnapshot.docs.filter(document => document.data().cancelledInGoogle === true)
          .map(document => String(document.data().googleCalendarEventId || '')),
      ].filter(Boolean));
      // Oude Google-imports kunnen nog een tweede lokale rij voor hetzelfde
      // event hebben. Een bevestigde Google-verwijdering maakt ook die vrij.
      for (const document of planningSnapshot.docs) {
        const data = document.data();
        if (!cancelledGoogleIds.has(data.googleCalendarEventId) || data.status === 'cancelled'
          || reconciliations.some(value => value.document.id === document.id)
          || (firestoreDate(data.calendarSyncLeaseUntil)?.getTime() || 0) > Date.now()) continue;
        const patch = { status: 'cancelled', appointmentState: 'cancelled', calendarSyncState: 'cancelled', cancelledInGoogle: true, cancelledBy: 'google_calendar' };
        reconciliations.push({ document, patch, data: { ...data, ...patch } });
      }
      const reconciledData = new Map(reconciliations.map(value => [value.document.id, value.data]));
      const cancelledIds = new Set(reconciliations.filter(value => value.patch.status === 'cancelled').map(value => value.document.id));
      const commitAllocation = () => {
        transaction.set(lockRef, { version: Number(lockSnapshot.data()?.version || 0) + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        for (const value of reconciliations) transaction.set(value.document.ref, {
          ...value.patch, updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      };
      const getBusyEntries = (ownEntryId: string, ownEventId?: string | null): AppointmentPlanningEntry[] => {
      const planningIds = new Set(planningSnapshot.docs.map(document => document.id));
      const freshGoogleEvents = new Map(calendarEvents.map(event => [event.id, event]));
      const planningEntries: AppointmentPlanningEntry[] = planningSnapshot.docs.flatMap(document => {
        if (document.id === ownEntryId || cancelledIds.has(document.id)) return [];
        const data = reconciledData.get(document.id) || document.data();
        if (ownEventId && data.googleCalendarEventId === ownEventId) return [];
        const googleEvent = freshGoogleEvents.get(data.googleCalendarEventId);
        const protectedReservation = data.source === SOURCE || data.leadKey
          || data.status === 'pending' || data.appointmentState === 'pending'
          || data.calendarSyncState === 'pending' || data.calendarSyncState === 'failed'
          || (firestoreDate(data.calendarSyncLeaseUntil)?.getTime() || 0) > Date.now();
        // Een als 'vrij' gemarkeerde klusdag mag niet via de lokale kopie alsnog
        // de hele dag blokkeren. Beloofde voorstellen blijven wel gereserveerd.
        if (googleEvent?.transparency === 'transparent' && !protectedReservation) return [];
        const entry = planningEntry(data);
        return entry ? [entry] : [];
      });
      // Ook reeds verstuurde voorstellen waarvan de oude refresh de planningrij
      // verwijderde blijven gereserveerd tot expliciete bevestiging/verwijdering.
      for (const document of importSnapshot.docs) {
        const data = document.data();
        if (document.id === importRef.id || data.appointment_status !== 'pending' || planningIds.has(data.appointment_id)
          || data.calendarSyncState === 'cancelled' || data.cancelledInGoogle) continue;
        const date = data.appointment_date || data.suggested_appointment_date;
        const time = data.appointment_time || data.suggested_appointment_time;
        const startDate = date && time ? amsterdamDateTime(date, time) : null;
        if (startDate) planningEntries.push({ startDate, endDate: new Date(startDate.getTime() + 3_600_000), city: '' });
      }
      for (const event of calendarEvents) {
        const entry = telegramCalendarPlanningEntry(event);
        if (entry && entry.googleEventId !== ownEventId && entry.googleEventId !== telegramCalendarEventId(ownEntryId)) planningEntries.push(entry);
      }
        return planningEntries;
      };
      // Lees en valideer binnen dezelfde transactie als de writes: ook een
      // gelijktijdige import mag geen eerder gecontroleerde identiteit wijzigen.
      const clientsSnapshot = await transaction.get(firestore.collection('clients').where('userId', '==', uid));
      const clients = clientsSnapshot.docs.map(document => ({
        ref: document.ref, data: document.data(), identity: storedClientIdentity(document.data()),
      }));
      const matchedClient = selectTelegramClient(clients, clientInput);
      let transactionClientRef = matchedClient?.ref || newClientRef;
      let transactionProjectRef = newProjectRef;
      let transactionAppointmentRef = newAppointmentRef;
      let reuseProject = false;
      let reuseAppointment = false;
      let refreshProposalOnly = false;
      let legacyAppointment: { date: string; time: string; startDate: Date; status: 'pending' | 'scheduled'; googleEventId: string | null } | null = null;

      const duplicate = await transaction.get(importRef);
      if (duplicate.exists) {
        const data = duplicate.data() as ExistingImportResult;
        const existingClient = clients.find(client => client.ref.id === data.client_id);
        if (!existingClient || (matchedClient && matchedClient.ref.id !== data.client_id)) {
          throw new TelegramIdentityConflict();
        }
        assertSameTelegramClient(clientInput, existingClient.identity);
        const duplicateProjectRef = typeof data.project_id === 'string' && data.project_id
          ? firestore.collection('quotes').doc(data.project_id)
          : null;
        const duplicateAppointmentRef = typeof data.appointment_id === 'string'
          && data.appointment_id
          ? firestore.collection('planning_entries').doc(data.appointment_id)
          : null;

        const duplicateSnapshots = await transaction.getAll(
          ...[duplicateProjectRef, duplicateAppointmentRef].filter(
            (reference): reference is NonNullable<typeof reference> => reference !== null
          )
        );
        const duplicateProject = duplicateProjectRef ? duplicateSnapshots.shift() : null;
        const duplicateAppointment = duplicateAppointmentRef ? duplicateSnapshots.shift() : null;
        if (duplicateProject?.exists) {
          const projectData = duplicateProject.data()!;
          if (projectData.userId !== uid || projectData.clientId !== data.client_id) throw new TelegramIdentityConflict();
          assertSameTelegramClient(clientInput, storedClientIdentity(projectData.klantinformatie || {}));
          assertSameTelegramClient(existingClient.identity, storedClientIdentity(projectData.klantinformatie || {}));
        }
        const projectIsReusable = duplicateProject?.exists
          && duplicateProject.data()?.userId === uid
          && duplicateProject.data()?.archived !== true;
        const appointmentIsReusable = (
          duplicateAppointment?.exists
          && duplicateAppointment.data()?.userId === uid
          && duplicateAppointment.data()?.quoteId === data.project_id
        );
        if (duplicateAppointment?.exists && !appointmentIsReusable) throw new TelegramIdentityConflict();
        let existingAppointmentData = appointmentIsReusable ? reconciledData.get(duplicateAppointmentRef!.id) || duplicateAppointment?.data() : null;
        let adoptedAppointmentPatch: Record<string, unknown> | null = null;
        if (existingAppointmentData && !existingAppointmentData.googleCalendarEventId && matchingCalendarEvent?.id && !appointmentStart) {
          const range = telegramCalendarPlanningEntry({ ...matchingCalendarEvent, transparency: 'opaque' });
          if (!range) throw new Error('De bestaande Google-afspraak mist een geldige datum.');
          const isConfirmed = telegramCalendarConfirmed(matchingCalendarEvent) || existingAppointmentData.status === 'scheduled';
          adoptedAppointmentPatch = {
            googleCalendarEventId: matchingCalendarEvent.id, calendarSyncState: 'pending',
            startDate: Timestamp.fromDate(range.startDate), endDate: Timestamp.fromDate(range.endDate),
            status: isConfirmed ? 'scheduled' : 'pending', appointmentState: isConfirmed ? 'scheduled' : 'pending',
          };
          existingAppointmentData = { ...existingAppointmentData, ...adoptedAppointmentPatch };
        }
        const existingAppointmentStart = firestoreDate(existingAppointmentData?.startDate);
        const existingAppointmentStatus = cancelledIds.has(duplicateAppointmentRef?.id || '') ? 'cancelled' : existingAppointmentData?.status || data.appointment_status;
        if (data.appointment_status === 'cancelled' || existingAppointmentStatus === 'cancelled' || existingAppointmentData?.calendarSyncState === 'cancelled') {
          commitAllocation();
          const cancelled: ImportResult = {
            client_id: data.client_id, project_id: data.project_id, appointment_id: data.appointment_id || null,
            appointment_status: 'cancelled', appointment_date: data.appointment_date || null, appointment_time: data.appointment_time || null,
            suggested_appointment_date: null, suggested_appointment_time: null, suggested_appointment_options: [], telegram_message: null,
            calendar_synced: true, google_calendar_event_id: existingAppointmentData?.googleCalendarEventId || data.google_calendar_event_id || null,
          };
          transaction.set(importRef, { ...cancelled, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          return cancelled;
        }
        if ((firestoreDate(existingAppointmentData?.calendarSyncLeaseUntil)?.getTime() || 0) > Date.now()) throw new CalendarSyncInProgress();
        const existingAppointmentIsConfirmed = existingAppointmentStatus === 'scheduled' || existingAppointmentStatus === 'confirmed';
        const existingIsPending = existingAppointmentStatus === 'pending' && existingAppointmentStart;

        if (projectIsReusable && !appointmentStart && appointmentIsReusable && (existingAppointmentIsConfirmed || existingIsPending)) {
          const existingDateParts = existingAppointmentStart ? amsterdamDateParts(existingAppointmentStart) : null;
          const existingDate = existingDateParts
            ? formatDateOnly(existingDateParts.year, existingDateParts.month, existingDateParts.day)
            : data.appointment_date || data.suggested_appointment_date || null;
          const existingTime = existingAppointmentStart
            ? new Intl.DateTimeFormat('en-GB', { timeZone: AMSTERDAM_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(existingAppointmentStart)
            : data.appointment_time || data.suggested_appointment_time || null;
          const existingSuggestion = !existingAppointmentIsConfirmed && existingDate && existingTime
            ? { date: existingDate, time: existingTime }
            : null;
          const reused: ImportResult = {
            client_id: data.client_id,
            project_id: data.project_id,
            appointment_id: data.appointment_id || null,
            appointment_status: existingAppointmentIsConfirmed ? 'scheduled' : 'pending',
            appointment_date: existingDate,
            appointment_time: existingTime,
            suggested_appointment_date: existingSuggestion?.date || null,
            suggested_appointment_time: existingSuggestion?.time || null,
            suggested_appointment_options: existingSuggestion ? [existingSuggestion] : [],
            telegram_message: existingSuggestion ? buildTelegramMessage(clientInput, existingSuggestion) : null,
            calendar_synced: existingAppointmentData?.calendarSyncState === 'synced' && Boolean(existingAppointmentData?.googleCalendarEventId),
            google_calendar_event_id: existingAppointmentData?.googleCalendarEventId || matchingCalendarEvent?.id || null,
          };
          if (!reused.calendar_synced && existingIsPending) {
            const range = planningEntry(existingAppointmentData!);
            if (range && getBusyEntries(duplicateAppointmentRef!.id, reused.google_calendar_event_id)
              .some(entry => entry.startDate < range.endDate && entry.endDate > range.startDate)) throw new TelegramCalendarConflict();
          }
          // Oude twee-datumteksten worden bij herhaling vervangen, terwijl de
          // bestaande afspraak en offerte behouden blijven.
          const cachedResponseChanged = Object.entries(reused).some(([key, value]) =>
            JSON.stringify(data[key as keyof ImportResult]) !== JSON.stringify(value));
          const cachedOptionsChanged = JSON.stringify(existingAppointmentData?.cache?.suggestedAppointmentOptions)
            !== JSON.stringify(reused.suggested_appointment_options);
          if (existingSuggestion && (cachedResponseChanged || cachedOptionsChanged)) {
            transaction.set(importRef, { ...reused, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            if (appointmentIsReusable && duplicateAppointmentRef) {
              transaction.set(duplicateAppointmentRef, { cache: { suggestedAppointmentOptions: reused.suggested_appointment_options } }, { merge: true });
            }
          }
          if (adoptedAppointmentPatch && duplicateAppointmentRef) {
            transaction.set(duplicateAppointmentRef, adoptedAppointmentPatch, { merge: true });
          }
          if (reconciliations.length) commitAllocation();
          return reused;
        }

        // Een ontbrekend/verlopen voorstel of latere Telegram-reply vult
        // dezelfde offerte aan in plaats van een tweede offerte te maken.
        if (projectIsReusable && duplicateProjectRef) {
          transactionProjectRef = duplicateProjectRef;
          reuseProject = true;
          refreshProposalOnly = !appointmentStart;
          if (typeof data.client_id === 'string' && data.client_id) {
            transactionClientRef = firestore.collection('clients').doc(data.client_id);
          }
          if (appointmentIsReusable && existingAppointmentStatus !== 'cancelled' && duplicateAppointmentRef) {
            transactionAppointmentRef = duplicateAppointmentRef;
            reuseAppointment = true;
          }
          if (!appointmentIsReusable && (data.appointment_status === 'pending' || data.appointment_status === 'scheduled' || matchingCalendarEvent)) {
            const googleRange = matchingCalendarEvent && !appointmentStart ? telegramCalendarPlanningEntry({ ...matchingCalendarEvent, transparency: 'opaque' }) : null;
            const googleParts = googleRange ? amsterdamDateParts(googleRange.startDate) : null;
            const date = googleParts ? formatDateOnly(googleParts.year, googleParts.month, googleParts.day) : data.appointment_date || data.suggested_appointment_date;
            const time = googleRange
              ? new Intl.DateTimeFormat('en-GB', { timeZone: AMSTERDAM_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(googleRange.startDate)
              : data.appointment_time || data.suggested_appointment_time;
            const startDate = date && time ? amsterdamDateTime(date, time) : null;
            if (date && time && startDate) {
              legacyAppointment = { date, time, startDate,
                status: data.appointment_status === 'scheduled' || (matchingCalendarEvent && telegramCalendarConfirmed(matchingCalendarEvent)) ? 'scheduled' : 'pending',
                googleEventId: data.google_calendar_event_id || matchingCalendarEvent?.id || null };
              if (duplicateAppointmentRef) transactionAppointmentRef = duplicateAppointmentRef;
            }
          }
        }
      }

      const ownEventId = reuseAppointment
        ? planningSnapshot.docs.find(document => document.id === transactionAppointmentRef.id)?.data().googleCalendarEventId || matchingCalendarEvent?.id
        : legacyAppointment?.googleEventId || matchingCalendarEvent?.id;
      const planningEntries = getBusyEntries(transactionAppointmentRef.id, ownEventId);
      const suggestions = appointmentStart || legacyAppointment ? [] : getAppointmentSuggestions(clientInput.city || '', planningEntries, {
        workDays: appointmentDays,
      });
      const suggestion = suggestions[0] || null;
      const selectedStart = appointmentStart || legacyAppointment?.startDate || suggestion?.startDate;
      if (!selectedStart) throw new TelegramCalendarConflict();
      const selectedEnd = new Date(selectedStart.getTime() + 3_600_000);
      if (selectedEnd > calendarWindowEnd) throw new CalendarWindowRequired(new Date(selectedEnd.getTime() + 30 * 86_400_000));
      if ((appointmentStart || legacyAppointment) && planningEntries.some(entry => entry.startDate < selectedEnd && entry.endDate > selectedStart)) {
        throw new TelegramCalendarConflict();
      }

      const counterSnapshot = reuseProject ? null : await transaction.get(counterRef);
      const quoteNumber = counterSnapshot && counterSnapshot.exists && typeof counterSnapshot.data()?.next === 'number'
        ? counterSnapshot.data()!.next
        : 260001;

      const clientPatch: Record<string, unknown> = {
        userId: uid,
        source: SOURCE,
        updatedAt: FieldValue.serverTimestamp(),
      };
      commitAllocation();
      if (firstName) clientPatch.voornaam = firstName;
      if (lastName) clientPatch.achternaam = lastName;
      if (clientInput.email) clientPatch.emailadres = clientInput.email;
      if (clientInput.phone) clientPatch.telefoonnummer = clientInput.phone;
      if (street) clientPatch.straat = street;
      if (houseNumber) clientPatch.huisnummer = houseNumber;
      if (clientInput.city) clientPatch.plaats = clientInput.city;

      if (!refreshProposalOnly) {
        transaction.set(transactionClientRef, {
          ...clientPatch,
          ...(!matchedClient && !reuseProject ? {
            bedrijfsnaam: null,
            postcode: null,
            klanttype: 'Particulier',
            createdAt: FieldValue.serverTimestamp(),
          } : {}),
        }, { merge: true });
      }

      const quotePatch = {
        userId: uid,
        clientId: transactionClientRef.id,
        leadKey: input.lead_key,
        source: SOURCE,
        status: 'werkbespreking',
        ...(reuseProject ? {} : { offerteNummer: quoteNumber }),
        titel: jobTitle,
        werkomschrijving: jobTitle,
        ...(reuseProject ? {} : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
        klantinformatie: {
          clientId: transactionClientRef.id,
          klanttype: 'Particulier',
          bedrijfsnaam: null,
          contactpersoon: null,
          voornaam: firstName,
          achternaam: lastName,
          emailadres: clientInput.email || null,
          'e-mailadres': clientInput.email || null,
          telefoonnummer: clientInput.phone || null,
          straat: street,
          huisnummer: houseNumber,
          postcode: null,
          plaats: clientInput.city || null,
          factuuradres: { straat: street, huisnummer: houseNumber, postcode: null, plaats: clientInput.city || null },
          afwijkendProjectadres: false,
          projectStraat: street,
          projectHuisnummer: houseNumber,
          projectPostcode: null,
          projectPlaats: clientInput.city || null,
          projectadres: { straat: street, huisnummer: houseNumber, postcode: null, plaats: clientInput.city || null },
        },
        instellingen: {
          btwTarief: 21,
          uurTariefExclBtw: userSettings.standaardUurtarief ?? DEFAULT_STANDARD_HOURLY_RATE,
        },
        extras: {
          transport: userSettings.standaardTransport ?? { mode: 'fixed', vasteTransportkosten: 45 },
          winstMarge: userSettings.standaardWinstMarge ?? { mode: 'percentage', percentage: 10 },
        },
      };
      if (!refreshProposalOnly) transaction.set(transactionProjectRef, quotePatch, { merge: reuseProject });

      if (!reuseProject) {
        transaction.set(counterRef, {
          next: quoteNumber + 1,
          userId: uid,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      let appointmentId: string | null = null;
      let appointmentStatus: ImportResult['appointment_status'] = 'none';
      let appointmentDate: string | null = null;
      let appointmentTime: string | null = null;
      let suggestedAppointmentDate: string | null = null;
      let suggestedAppointmentTime: string | null = null;
      let suggestedAppointmentOptions: ImportResult['suggested_appointment_options'] = [];
      let telegramMessage: string | null = null;
      const plannedAppointment = selectedStart;

      if (plannedAppointment) {
        const isPendingSuggestion = appointmentStart
          ? requestedAppointmentStatus !== 'confirmed'
          : legacyAppointment?.status !== 'scheduled';
        appointmentId = transactionAppointmentRef.id;
        appointmentStatus = isPendingSuggestion ? 'pending' : 'scheduled';
        appointmentDate = appointmentDateOnly || legacyAppointment?.date || suggestion?.date || null;
        appointmentTime = appointmentStart ? clientInput.appointment_time || null : legacyAppointment?.time || suggestion?.time || null;
        suggestedAppointmentDate = isPendingSuggestion ? appointmentDate : null;
        suggestedAppointmentTime = isPendingSuggestion ? appointmentTime : null;
        suggestedAppointmentOptions = isPendingSuggestion && appointmentDate && appointmentTime
          ? [{ date: appointmentDate, time: appointmentTime }]
          : [];
        telegramMessage = suggestedAppointmentOptions[0]
          ? buildTelegramMessage(clientInput, suggestedAppointmentOptions[0])
          : null;
        const appointmentEnd = new Date(plannedAppointment.getTime() + 60 * 60 * 1000);
        transaction.set(transactionAppointmentRef, {
          userId: uid,
          quoteId: transactionProjectRef.id,
          leadKey: input.lead_key,
          source: SOURCE,
          startDate: Timestamp.fromDate(plannedAppointment),
          endDate: Timestamp.fromDate(appointmentEnd),
          scheduledHours: 1,
          planningType: 'werkbespreking',
          isAutoSplit: false,
          parentEntryId: null,
          status: appointmentStatus,
          notes: isPendingSuggestion
            ? 'Automatisch voorgesteld via Telegram; wacht op bevestiging van de klant.'
            : '',
          appointmentState: appointmentStatus,
          suggestedBy: isPendingSuggestion ? 'telegram_auto_message' : null,
          calendarSyncState: 'pending',
          calendarSyncRevision: randomUUID(),
          ...(ownEventId ? { googleCalendarEventId: ownEventId } : {}),
          cache: {
            clientName: clientInput.client_name || '',
            projectTitle: `Werkbespreking · ${jobTitle}`,
            projectAddress: [clientInput.address, clientInput.city].filter(Boolean).join(', '),
            totalQuoteHours: 1,
            totalQuoteAmount: 0,
            totalQuoteEarnings: 0,
            suggestedAppointmentOptions,
          },
          ...(!reuseAppointment ? { createdAt: FieldValue.serverTimestamp() } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: reuseAppointment });
      }

      const imported: ImportResult = {
        client_id: transactionClientRef.id,
        project_id: transactionProjectRef.id,
        appointment_id: appointmentId,
        appointment_status: appointmentStatus,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        suggested_appointment_date: suggestedAppointmentDate,
        suggested_appointment_time: suggestedAppointmentTime,
        suggested_appointment_options: suggestedAppointmentOptions,
        telegram_message: telegramMessage,
        calendar_synced: false,
        google_calendar_event_id: ownEventId || null,
      };
      transaction.set(importRef, {
        ...imported,
        userId: uid,
        lead_key: input.lead_key,
        source: SOURCE,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: reuseProject });
      return imported;
        });
        break;
      } catch (error) {
        if (!(error instanceof CalendarWindowRequired)) throw error;
        if (!appointmentStart && calendarWindowEnd >= maxSuggestionWindowEnd) throw new CalendarNoAvailability();
        calendarWindowEnd = !appointmentStart && error.end > maxSuggestionWindowEnd ? maxSuggestionWindowEnd : error.end;
        calendarEvents = await loadTelegramCalendarWindow(calendar, calendarWindowStart, calendarWindowEnd);
      }
    }

    if (result.appointment_id && result.appointment_status !== 'cancelled' && !result.calendar_synced) {
      const entryRef = firestore.collection('planning_entries').doc(result.appointment_id);
      const leaseToken = randomUUID();
      const entryData = await firestore.runTransaction(async transaction => {
        const snapshot = await transaction.get(entryRef);
        const data = snapshot.data();
        if (!snapshot.exists || data?.userId !== uid || data.quoteId !== result.project_id) throw new TelegramIdentityConflict();
        if (data.status === 'cancelled' || data.calendarSyncState === 'cancelled') {
          result = resultFromAppointment(result, data, clientInput);
          transaction.set(importRef, { ...result, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          return data;
        }
        if ((firestoreDate(data.calendarSyncLeaseUntil)?.getTime() || 0) > Date.now()) throw new CalendarSyncInProgress();
        transaction.set(entryRef, {
          calendarSyncLeaseToken: leaseToken, calendarSyncLeaseUntil: Timestamp.fromDate(new Date(Date.now() + 120_000)),
          calendarSyncState: 'pending', updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return data;
      });
      if (entryData.status !== 'cancelled' && entryData.calendarSyncState !== 'cancelled') try {
        result = resultFromAppointment(result, entryData, clientInput);
        const range = planningEntry(entryData);
        if (!range) throw new Error('De opgeslagen afspraak mist een geldige datum.');
        const eventId = await syncTelegramAppointmentCalendar(calendar, {
          entryId: entryRef.id, quoteId: result.project_id, leadKey: input.lead_key,
          status: entryData.status === 'scheduled' || entryData.status === 'confirmed' ? 'scheduled' : 'pending', ...range,
          clientName: entryData.cache?.clientName || clientInput.client_name || '',
          projectTitle: entryData.cache?.projectTitle || jobTitle,
          projectAddress: entryData.cache?.projectAddress || '', phone: clientInput.phone || '',
          googleCalendarEventId: entryData.googleCalendarEventId || null,
          googleCalendarColorId: entryData.googleCalendarColorId || null,
        });
        result = { ...result, calendar_synced: true, google_calendar_event_id: eventId };
        await firestore.runTransaction(async transaction => {
          const current = await transaction.get(entryRef);
          if (current.data()?.calendarSyncLeaseToken !== leaseToken
            || current.data()?.calendarSyncRevision !== entryData.calendarSyncRevision) throw new CalendarSyncInProgress();
          transaction.set(entryRef, {
            googleCalendarEventId: eventId, calendarSyncState: 'synced', calendarSyncError: null,
            calendarSyncLeaseToken: null, calendarSyncLeaseUntil: null, updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          transaction.set(importRef, { ...result, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        });
      } catch (error) {
        const deleted = error instanceof TelegramCalendarDeleted;
        await firestore.runTransaction(async transaction => {
          const [entrySnapshot, lockSnapshot] = await transaction.getAll(entryRef, lockRef);
          if (entrySnapshot.data()?.calendarSyncLeaseToken !== leaseToken) return;
          transaction.set(entryRef, {
            calendarSyncState: deleted ? 'cancelled' : 'failed',
            ...(deleted ? { status: 'cancelled', appointmentState: 'cancelled', cancelledInGoogle: true } : {}),
            calendarSyncError: error instanceof Error ? error.message : String(error),
            calendarSyncLeaseToken: null, calendarSyncLeaseUntil: null, updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          if (deleted) {
            transaction.set(lockRef, { version: Number(lockSnapshot.data()?.version || 0) + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            result = { ...result, appointment_status: 'cancelled', calendar_synced: true, telegram_message: null, suggested_appointment_options: [], suggested_appointment_date: null, suggested_appointment_time: null };
            transaction.set(importRef, { ...result, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          }
        });
        if (!deleted) throw error;
      }
    }

    console.info('[telegram-leads/import] imported', {
      leadKey: input.lead_key,
      clientId: result.client_id,
      projectId: result.project_id,
      appointmentId: result.appointment_id,
    });
    return response(result);
  } catch (error) {
    if (error instanceof TelegramIdentityConflict) {
      return NextResponse.json({ success: false, code: 'CLIENT_IDENTITY_CONFLICT', message: error.message }, { status: 409 });
    }
    if (error instanceof TelegramCalendarConflict) return NextResponse.json({ success: false, code: 'APPOINTMENT_SLOT_CONFLICT', message: error.message }, { status: 409 });
    if (error instanceof CalendarNoAvailability) return NextResponse.json({ success: false, code: 'APPOINTMENT_AVAILABILITY_UNAVAILABLE', message: error.message }, { status: 503 });
    if (error instanceof CalendarSyncInProgress) return NextResponse.json({ success: false, code: 'CALENDAR_SYNC_IN_PROGRESS', message: error.message }, { status: 503 });
    console.error('[telegram-leads/import] failed', {
      leadKey: input.lead_key,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, code: 'CALENDAR_SYNC_FAILED', message: 'De afspraak kon nog niet met Google Calendar worden gesynchroniseerd. Probeer opnieuw.' },
      { status: 503 }
    );
  }
}
