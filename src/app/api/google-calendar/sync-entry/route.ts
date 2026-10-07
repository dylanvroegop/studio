import { randomUUID } from 'crypto';
import type { calendar_v3 } from 'googleapis';
import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { reportGoogleCalendarAlert } from '@/lib/google-calendar-alerts';
import { getCalendarClient, isGoogleInvalidGrantError } from '@/lib/integrations/google-calendar';
import {
  GOOGLE_CALENDAR_BLUE_COLOR_ID,
  GOOGLE_CALENDAR_RED_COLOR_ID,
} from '@/lib/planning-colors';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim();
}

type SyncAction = 'upsert' | 'delete';

const PLANNING_TIME_ZONE = 'Europe/Amsterdam';

function getFirstName(label: string): string {
  return label.trim().split(/\s+/)[0] || 'Planning';
}

function getStartHour(date: Date): string {
  return new Intl.DateTimeFormat('nl-NL', {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone: PLANNING_TIME_ZONE,
  }).format(date);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Onbekende fout');
}

interface SyncBody {
  action: SyncAction;
  entryId: string;
  googleCalendarEventId?: string | null;
  googleCalendarColorId?: string | null;
  quoteId?: string;
  startDate?: string;
  endDate?: string;
  planningType?: string;
  notes?: string;
  cache?: {
    clientName?: string;
    projectTitle?: string;
    projectAddress?: string;
  };
}

interface StoredPlanningEntry {
  userId?: string;
  quoteId?: string;
  planningType?: string;
  status?: string;
  source?: string;
  leadKey?: string;
  googleCalendarEventId?: string;
  googleCalendarColorId?: string | null;
  calendarSyncState?: string;
  calendarSyncRevision?: string;
  calendarSyncLeaseToken?: string;
  calendarSyncLeaseUntil?: { toMillis?: () => number } | Date;
}

function hasActiveCalendarLease(entry: StoredPlanningEntry): boolean {
  const until = entry.calendarSyncLeaseUntil;
  const expiresAt = until instanceof Date ? until.getTime() : until?.toMillis?.() || 0;
  return Boolean(entry.calendarSyncLeaseToken && expiresAt > Date.now());
}

function missingGoogleEvent(error: unknown): boolean {
  const value = error as { code?: unknown; response?: { status?: unknown } } | null;
  return [404, 410].includes(Number(value?.response?.status || value?.code));
}

function googleEventChanged(error: unknown): boolean {
  const value = error as { code?: unknown; response?: { status?: unknown } } | null;
  return Number(value?.response?.status || value?.code) === 412;
}

function calendarDescription(existing: string, fields: Record<string, string>): string {
  // Behoud onder meer Telegram-sessie, telefoon en werk; alleen de beheerde
  // velden worden bijgewerkt als een afspraak in Calvora wordt aangepast.
  const retained = existing.split('\n').filter(line => !Object.keys(fields).some(label => line.startsWith(`${label}:`)));
  return [...Object.entries(fields).filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`), ...retained]
    .filter(line => line.trim()).join('\n');
}

export async function POST(request: Request) {
  let finishLease: ((synced: boolean, deleted: boolean) => Promise<void>) | undefined;
  let calendarSynced = false;
  let calendarDeleted = false;
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as SyncBody;
    if (!['upsert', 'delete'].includes(body?.action) || !body?.entryId) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (body.action === 'delete') {
      const entryRef = firestore.collection('planning_entries').doc(body.entryId);
      const entrySnap = await entryRef.get();
      if (entrySnap.exists && entrySnap.data()?.userId !== decoded.uid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (!entrySnap.exists) {
        return NextResponse.json({ ok: true, action: 'delete', alreadyDeleted: true });
      }

      // Google Calendar is the external source of truth for synced planning.
      // Deleting a Calvora planning row must never delete the Google event.
      await entryRef.update({ googleCalendarEventId: null, updatedAt: new Date() });
      return NextResponse.json({ ok: true, action: 'delete' });
    }

    const entryRef = firestore.collection('planning_entries').doc(body.entryId);
    const entrySnap = await entryRef.get();
    if (!entrySnap.exists) {
      return NextResponse.json({ error: 'Planning niet gevonden.' }, { status: 404 });
    }
    let entryData = entrySnap.data() as StoredPlanningEntry;
    if (entryData.userId !== decoded.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (entryData.status === 'cancelled' || entryData.calendarSyncState === 'cancelled') {
      return NextResponse.json({ error: 'Deze afspraak is verwijderd uit Google Calendar.', code: 'calendar_event_deleted' }, { status: 409 });
    }
    if (hasActiveCalendarLease(entryData) || (entryData.source === 'telegram_werkspot'
      && ['pending', 'failed'].includes(entryData.calendarSyncState || ''))) {
      return NextResponse.json({ error: 'De Telegram-afspraak wordt nog met Google Calendar gesynchroniseerd.', code: 'calendar_sync_pending' }, { status: 409 });
    }
    const calendarEventId = entryData.googleCalendarEventId;
    if (body.googleCalendarEventId && body.googleCalendarEventId !== calendarEventId) {
      return NextResponse.json({ error: 'De agenda-koppeling is gewijzigd. Ververs de planning.', code: 'calendar_event_mismatch' }, { status: 409 });
    }
    if (!calendarEventId && entryData.source === 'telegram_werkspot') {
      return NextResponse.json({ error: 'De Telegram-afspraak wordt nog met Google Calendar gesynchroniseerd.', code: 'calendar_sync_pending' }, { status: 409 });
    }
    if (!body.startDate || !body.endDate) {
      return NextResponse.json({ error: 'startDate/endDate vereist voor upsert' }, { status: 400 });
    }
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
      return NextResponse.json({ error: 'Ongeldige afspraakdatum.' }, { status: 400 });
    }

    const userDocRef = firestore.collection('users').doc(decoded.uid);
    const userSnap = await userDocRef.get();
    const userData = userSnap.data() as {
      integrations?: {
        googleCalendar?: {
          connected?: boolean;
          refreshToken?: string;
          accessToken?: string;
          expiryDate?: number;
        }
      }
    } | undefined;

    const integration = userData?.integrations?.googleCalendar;
    if (!integration?.connected || !integration?.refreshToken) {
      await reportGoogleCalendarAlert({
        firestore,
        userRef: userDocRef,
        decoded,
        source: 'google-calendar/sync-entry',
        title: 'Google Calendar sync overgeslagen',
        message: 'Google Calendar is niet gekoppeld of mist een refresh token. Planning is wel opgeslagen in Calvora, maar niet in Google Calendar.',
        code: 'calendar_not_connected',
        severity: 'warning',
        context: {
          action: body.action,
          entryId: body.entryId,
          quoteId: body.quoteId || null,
          planningType: body.planningType || null,
        },
      });
      return NextResponse.json({ skipped: true, reason: 'calendar_not_connected' });
    }

    const { calendar, credentials } = await getCalendarClient({
      refreshToken: integration.refreshToken,
      accessToken: integration.accessToken || undefined,
      expiryDate: integration.expiryDate || undefined,
    });

    await userDocRef.set({
      integrations: {
        googleCalendar: {
          accessToken: credentials.access_token || null,
          expiryDate: credentials.expiry_date || null,
          refreshToken: integration.refreshToken,
          connected: true,
          updatedAt: new Date(),
        }
      }
    }, { merge: true });

    let existingEvent: calendar_v3.Schema$Event | undefined;
    if (calendarEventId) {
      try {
        existingEvent = (await calendar.events.get({ calendarId: 'primary', eventId: calendarEventId })).data;
      } catch (error) {
        if (!missingGoogleEvent(error)) throw error;
        return NextResponse.json({ error: 'Deze afspraak is verwijderd uit Google Calendar.', code: 'calendar_event_deleted' }, { status: 409 });
      }
      if (existingEvent.status === 'cancelled') {
        return NextResponse.json({ error: 'Deze afspraak is verwijderd uit Google Calendar.', code: 'calendar_event_deleted' }, { status: 409 });
      }
      const linkedEntryId = existingEvent.extendedProperties?.private?.calvoraPlanningEntryId;
      if (linkedEntryId && linkedEntryId !== body.entryId) {
        return NextResponse.json({ error: 'Deze agenda-afspraak hoort bij een andere planning.', code: 'calendar_event_mismatch' }, { status: 409 });
      }
    }

    if (entryData.source === 'telegram_werkspot') {
      const lockRef = firestore.collection('telegram_appointment_locks').doc(decoded.uid);
      const leaseToken = randomUUID();
      const revision = randomUUID();
      const acquired = await firestore.runTransaction(async transaction => {
        const [freshEntry, lock] = await transaction.getAll(entryRef, lockRef);
        const data = freshEntry.data() as StoredPlanningEntry | undefined;
        if (!freshEntry.exists || data?.userId !== decoded.uid || data.googleCalendarEventId !== calendarEventId
          || data.status === 'cancelled' || data.calendarSyncState === 'cancelled'
          || hasActiveCalendarLease(data) || ['pending', 'failed'].includes(data.calendarSyncState || '')) return null;
        transaction.set(entryRef, {
          calendarSyncRevision: revision,
          calendarSyncState: 'pending',
          calendarSyncLeaseToken: leaseToken,
          calendarSyncLeaseUntil: new Date(Date.now() + 120_000),
        }, { merge: true });
        transaction.set(lockRef, { version: Number(lock.data()?.version || 0) + 1 }, { merge: true });
        return data;
      });
      if (!acquired) {
        return NextResponse.json({ error: 'Deze afspraak wordt bijgewerkt. Ververs de planning.', code: 'calendar_sync_pending' }, { status: 409 });
      }
      entryData = acquired;
      finishLease = async (synced, deleted) => {
        await firestore.runTransaction(async transaction => {
          const [freshEntry, lock] = await transaction.getAll(entryRef, lockRef);
          const data = freshEntry.data() as StoredPlanningEntry | undefined;
          if (data?.calendarSyncLeaseToken !== leaseToken || data.calendarSyncRevision !== revision) return;
          transaction.set(entryRef, {
            calendarSyncState: deleted ? 'cancelled' : synced ? 'synced' : 'failed',
            ...(deleted ? { status: 'cancelled', appointmentState: 'cancelled', cancelledInGoogle: true, cancelledBy: 'google_calendar' } : {}),
            calendarSyncLeaseToken: null,
            calendarSyncLeaseUntil: null,
            updatedAt: new Date(),
          }, { merge: true });
          transaction.set(lockRef, { version: Number(lock.data()?.version || 0) + 1 }, { merge: true });
        });
      };
    }

    const isWerkbespreking = (entryData.planningType || body.planningType) === 'werkbespreking';
    const isPending = isWerkbespreking && entryData.status === 'pending';
    const primaryLabel = body.cache?.clientName || body.cache?.projectTitle || 'Planning';
    const cleanLabel = primaryLabel.replace(/^PENDING\s*[·:–-]?\s*/i, '').replace(/^\d{1,2}:\d{2}\s+/, '');
    const title = `${isPending ? 'PENDING · ' : ''}${getFirstName(cleanLabel)} ${getStartHour(startDate)}`;
    const descriptionFields: Record<string, string> = {
      ...(isWerkbespreking ? { Status: isPending ? 'pending' : 'confirmed' } : {}),
      Klant: body.cache?.clientName || '',
      Adres: body.cache?.projectAddress || '',
      Notities: body.notes || '',
      Offerte: entryData.quoteId || '',
    };
    if (entryData.leadKey?.startsWith('telegram_session_')) {
      descriptionFields['Telegram-sessie'] = entryData.leadKey.slice('telegram_session_'.length);
    }
    const description = calendarDescription(existingEvent?.description || '', descriptionFields);

    const defaultColorId = isWerkbespreking
      ? GOOGLE_CALENDAR_RED_COLOR_ID
      : GOOGLE_CALENDAR_BLUE_COLOR_ID;

    const payload = {
      summary: title,
      description,
      ...(isWerkbespreking ? { status: isPending ? 'tentative' : 'confirmed', transparency: 'opaque' } : {}),
      extendedProperties: {
        private: {
          ...existingEvent?.extendedProperties?.private,
          calvoraType: existingEvent?.extendedProperties?.private?.calvoraType
            || (entryData.source === 'telegram_werkspot' ? 'telegram-appointment' : 'planning'),
          calvoraPlanningEntryId: body.entryId,
          calvoraQuoteId: entryData.quoteId || '',
          ...(isWerkbespreking ? { appointmentStatus: isPending ? 'pending' : 'confirmed' } : {}),
        },
      },
      // Preserve a color selected in Google when a linked Calvora entry is
      // edited. New entries use the color associated with their planning type.
      colorId: body.googleCalendarColorId || entryData.googleCalendarColorId || defaultColorId,
      start: { dateTime: body.startDate },
      end: { dateTime: body.endDate },
      reminders: {
        useDefault: false,
        overrides: isWerkbespreking
          ? [
              { method: 'popup', minutes: 24 * 60 },
              { method: 'popup', minutes: 60 },
            ]
          : [{ method: 'popup', minutes: 24 * 60 }],
      },
    };

    if (calendarEventId) {
      try {
        await calendar.events.patch(
          { calendarId: 'primary', eventId: calendarEventId, requestBody: payload },
          existingEvent?.etag ? { headers: { 'If-Match': existingEvent.etag } } : undefined,
        );
        calendarSynced = true;
      } catch (error) {
        if (googleEventChanged(error)) {
          return NextResponse.json({ error: 'De afspraak is ondertussen gewijzigd in Google Calendar. Ververs de planning en probeer opnieuw.', code: 'calendar_event_changed' }, { status: 409 });
        }
        if (!missingGoogleEvent(error)) throw error;
        calendarDeleted = true;
        return NextResponse.json({ error: 'Deze afspraak is verwijderd uit Google Calendar.', code: 'calendar_event_deleted' }, { status: 409 });
      }
      return NextResponse.json({ ok: true, action: 'update', eventId: calendarEventId });
    }

    const created = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: payload,
    });

    const newEventId = created.data.id;
    if (newEventId) {
      await entryRef.set({ googleCalendarEventId: newEventId, updatedAt: new Date() }, { merge: true });
    }

    return NextResponse.json({ ok: true, action: 'create', eventId: newEventId || null });
  } catch (error) {
    console.error('google calendar sync-entry error', error);
    if (isGoogleInvalidGrantError(error)) {
      const token = extractBearerToken(request.headers.get('authorization'));
      if (token) {
        const { auth, firestore } = initFirebaseAdmin();
        const decoded = await auth.verifyIdToken(token).catch(() => null);
        if (decoded?.uid) {
          const userRef = firestore.collection('users').doc(decoded.uid);
          await userRef.set({
            integrations: {
              googleCalendar: {
                connected: false,
                reconnectRequired: true,
                accessToken: null,
                expiryDate: null,
                updatedAt: new Date(),
              },
            },
          }, { merge: true }).catch(() => null);
          await reportGoogleCalendarAlert({
            firestore,
            userRef,
            decoded,
            source: 'google-calendar/sync-entry',
            title: 'Google Calendar moet opnieuw gekoppeld worden',
            message: 'Google heeft de Calendar refresh token geweigerd. Koppel Google Calendar opnieuw in instellingen.',
            code: 'google_calendar_reconnect_required',
            severity: 'critical',
            context: { error: errorMessage(error) },
          });
        }
      }
      return NextResponse.json(
        { error: 'Google Calendar moet opnieuw gekoppeld worden.', code: 'google_calendar_reconnect_required' },
        { status: 409 },
      );
    }
    const token = extractBearerToken(request.headers.get('authorization'));
    if (token) {
      const { auth, firestore } = initFirebaseAdmin();
      const decoded = await auth.verifyIdToken(token).catch(() => null);
      if (decoded?.uid) {
        await reportGoogleCalendarAlert({
          firestore,
          userRef: firestore.collection('users').doc(decoded.uid),
          decoded,
          source: 'google-calendar/sync-entry',
          title: 'Google Calendar sync mislukt',
          message: errorMessage(error),
          code: 'google_calendar_sync_failed',
          severity: 'error',
        });
      }
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  } finally {
    if (finishLease) await finishLease(calendarSynced, calendarDeleted).catch(error => console.error('google calendar sync lease afsluiten mislukt', error));
  }
}
