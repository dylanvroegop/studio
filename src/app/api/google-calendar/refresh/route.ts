import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/firebase/admin';
import { reportGoogleCalendarAlert } from '@/lib/google-calendar-alerts';
import { getCalendarClient, isGoogleInvalidGrantError } from '@/lib/integrations/google-calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const AMSTERDAM_TIME_ZONE = 'Europe/Amsterdam';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Onbekende fout');
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
  if (!year || !month || !day) return null;

  const localAsUtc = Date.UTC(year, month - 1, day, Number(timeMatch[1]), Number(timeMatch[2]));
  let utc = localAsUtc - timeZoneOffsetMs(new Date(localAsUtc));
  utc = localAsUtc - timeZoneOffsetMs(new Date(utc));
  return new Date(utc);
}

function parseRequestDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function fallbackDateRange(): { startDate: Date; endDate: Date } {
  const now = new Date();
  return {
    startDate: new Date(now.getFullYear(), now.getMonth(), 1),
    endDate: new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999),
  };
}

function eventDateRange(event: {
  start?: { dateTime?: string | null; date?: string | null };
  end?: { dateTime?: string | null; date?: string | null };
}): { startDate: Date; endDate: Date; allDay: boolean } | null {
  if (event.start?.dateTime && event.end?.dateTime) {
    const startDate = new Date(event.start.dateTime);
    const endDate = new Date(event.end.dateTime);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) return null;
    return { startDate, endDate, allDay: false };
  }

  if (event.start?.date && event.end?.date) {
    const startDate = amsterdamDateTime(event.start.date, '00:00');
    const exclusiveEnd = amsterdamDateTime(event.end.date, '00:00');
    if (!startDate || !exclusiveEnd || exclusiveEnd <= startDate) return null;
    return {
      startDate,
      endDate: new Date(exclusiveEnd.getTime() - 60_000),
      allDay: true,
    };
  }

  return null;
}

function overlapsRange(startDate: Date, endDate: Date, rangeStart: Date, rangeEnd: Date): boolean {
  return startDate.getTime() <= rangeEnd.getTime() && endDate.getTime() >= rangeStart.getTime();
}

function googleEventDocId(eventId: string): string {
  return `google_${eventId.replace(/\//g, '_')}`;
}

function timestampToDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

function planningEntryOverlapsRange(
  entry: { startDate?: unknown; endDate?: unknown },
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  const startDate = timestampToDate(entry.startDate);
  const endDate = timestampToDate(entry.endDate);
  return Boolean(startDate && endDate && overlapsRange(startDate, endDate, rangeStart, rangeEnd));
}

function samePlanningRange(
  entry: { startDate?: unknown; endDate?: unknown },
  startDate: Date,
  endDate: Date,
): boolean {
  const entryStart = timestampToDate(entry.startDate);
  const entryEnd = timestampToDate(entry.endDate);
  return entryStart?.getTime() === startDate.getTime() && entryEnd?.getTime() === endDate.getTime();
}

function getFirstName(label: string): string {
  return label.trim().split(/\s+/)[0] || 'Planning';
}

function getStartHour(date: Date): string {
  return new Intl.DateTimeFormat('nl-NL', {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone: AMSTERDAM_TIME_ZONE,
  }).format(date);
}

interface GoogleCalendarEvent {
  id?: string | null;
  status?: string | null;
  summary?: string | null;
  description?: string | null;
  colorId?: string | null;
  htmlLink?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => ({})) as { startDate?: string; endDate?: string };
    const fallbackRange = fallbackDateRange();
    const rangeStart = parseRequestDate(body.startDate) || fallbackRange.startDate;
    const rangeEnd = parseRequestDate(body.endDate) || fallbackRange.endDate;

    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userRef = firestore.collection('users').doc(decoded.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data() as {
      integrations?: {
        googleCalendar?: {
          connected?: boolean;
          refreshToken?: string;
          accessToken?: string;
          expiryDate?: number;
        };
      };
    } | undefined;
    const integration = userData?.integrations?.googleCalendar;

    if (!integration?.connected || !integration.refreshToken) {
      await reportGoogleCalendarAlert({
        firestore,
        userRef,
        decoded,
        source: 'google-calendar/refresh',
        title: 'Google Calendar verversen mislukt',
        message: 'Google Calendar is niet gekoppeld of mist een refresh token.',
        code: 'calendar_not_connected',
        severity: 'warning',
      });
      return NextResponse.json(
        { error: 'Google Calendar is niet gekoppeld.', code: 'calendar_not_connected' },
        { status: 409 },
      );
    }

    const { calendar, credentials } = await getCalendarClient({
      refreshToken: integration.refreshToken,
      accessToken: integration.accessToken || undefined,
      expiryDate: integration.expiryDate || undefined,
    });

    await userRef.set({
      integrations: {
        googleCalendar: {
          ...integration,
          accessToken: credentials.access_token || integration.accessToken || null,
          expiryDate: credentials.expiry_date || integration.expiryDate || null,
          connected: true,
          updatedAt: new Date(),
        },
      },
    }, { merge: true });

    const planningSnapshot = await firestore.collection('planning_entries')
      .where('userId', '==', decoded.uid)
      .get();

    let updated = 0;
    let unchanged = 0;
    let skipped = 0;
    let imported = 0;
    let removed = 0;

    type PlanningDocument = (typeof planningSnapshot.docs)[number];
    const localEntriesByGoogleId = new Map<string, PlanningDocument>();
    planningSnapshot.docs.forEach((planningDoc) => {
      const eventId = String(planningDoc.data().googleCalendarEventId || '').trim();
      if (eventId && !localEntriesByGoogleId.has(eventId)) {
        localEntriesByGoogleId.set(eventId, planningDoc);
      }
    });

    const googleEventIdsInRange = new Set<string>();
    const googleEventsInRange: Array<{
      eventId: string;
      event: GoogleCalendarEvent;
      parsedRange: { startDate: Date; endDate: Date; allDay: boolean };
    }> = [];
    let pageToken: string | undefined;
    do {
      const listResponse = await calendar.events.list({
        calendarId: 'primary',
        timeMin: rangeStart.toISOString(),
        timeMax: rangeEnd.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        showDeleted: false,
        maxResults: 2500,
        pageToken,
      });

      const events = listResponse.data.items || [];
      for (const event of events) {
        const eventId = event.id?.trim();
        if (!eventId || event.status === 'cancelled') continue;

        const parsedRange = eventDateRange(event);
        if (!parsedRange || !overlapsRange(parsedRange.startDate, parsedRange.endDate, rangeStart, rangeEnd)) {
          skipped += 1;
          continue;
        }

        googleEventIdsInRange.add(eventId);
        googleEventsInRange.push({ eventId, event, parsedRange });
      }

      pageToken = listResponse.data.nextPageToken || undefined;
    } while (pageToken);

    // Google Calendar is the source of truth. Replace every local planning row
    // in the requested range, including legacy Calvora rows without an event ID.
    // This prevents an old local row and its Google counterpart from surviving
    // side by side after a refresh.
    const localEntriesToReplace = planningSnapshot.docs.filter((planningDoc) => {
      const data = planningDoc.data();
      const eventId = String(data.googleCalendarEventId || '').trim();
      return planningEntryOverlapsRange(data, rangeStart, rangeEnd)
        || (eventId && googleEventIdsInRange.has(eventId));
    });

    const targetDocs = new Set<string>();
    const usedFallbackDocs = new Set<string>();
    const writes: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }> = [];

    for (const { eventId, event, parsedRange } of googleEventsInRange) {
      const directMatch = localEntriesByGoogleId.get(eventId);
      const summary = event.summary?.trim() || 'Google Calendar';
      const description = event.description?.trim() || '';
      const scheduledHours = Math.max(
        0,
        (parsedRange.endDate.getTime() - parsedRange.startDate.getTime()) / 3_600_000,
      );

      // Older rows may have been created before the Google event ID was saved.
      // Reuse one exact date match when possible so quote links and financial
      // metadata are not lost during the authoritative replacement.
      const fallbackMatch = !directMatch
        ? localEntriesToReplace.find((planningDoc) => {
            if (usedFallbackDocs.has(planningDoc.id)) return false;
            const data = planningDoc.data() as {
              googleCalendarEventId?: string;
              cache?: { clientName?: string };
              startDate?: unknown;
              endDate?: unknown;
            };
            if (data.googleCalendarEventId) return false;
            if (!samePlanningRange(data, parsedRange.startDate, parsedRange.endDate)) return false;
            const clientName = data.cache?.clientName?.trim() || '';
            const generatedSummary = `${getFirstName(clientName)} ${getStartHour(parsedRange.startDate)}`;
            return !clientName || clientName === summary || generatedSummary === summary;
          })
        : undefined;
      const existingDoc = directMatch || fallbackMatch;
      if (fallbackMatch) usedFallbackDocs.add(fallbackMatch.id);

      const existing = existingDoc?.data() as {
        quoteId?: string;
        source?: 'calvora' | 'google';
        planningType?: string;
        isAutoSplit?: boolean;
        parentEntryId?: string | null;
        cache?: { projectTitle?: string; projectAddress?: string; totalQuoteAmount?: number; totalQuoteEarnings?: number };
        notes?: string;
        createdAt?: unknown;
      } | undefined;
      const targetRef = existingDoc?.ref || firestore.collection('planning_entries').doc(googleEventDocId(eventId));
      targetDocs.add(targetRef.path);

      const sameDates = existingDoc && samePlanningRange(existingDoc.data(), parsedRange.startDate, parsedRange.endDate);
      const sameTitle = existingDoc?.data().cache?.clientName === summary && existingDoc?.data().status === 'scheduled';
      if (!existingDoc) imported += 1;
      else if (sameDates && sameTitle) unchanged += 1;
      else updated += 1;

      writes.push({
        ref: targetRef,
        data: {
          userId: decoded.uid,
          quoteId: existing?.quoteId || '',
          googleCalendarEventId: eventId,
          googleCalendarColorId: event.colorId || null,
          googleCalendarHtmlLink: event.htmlLink || null,
          isAllDay: parsedRange.allDay,
          // Keep Calvora ownership for entries that were created locally so
          // later edits can continue to update their Google event. Standalone
          // Google events remain Google-owned and are overwritten on refresh.
          source: existing?.source || (existingDoc ? 'calvora' : 'google'),
          startDate: Timestamp.fromDate(parsedRange.startDate),
          endDate: Timestamp.fromDate(parsedRange.endDate),
          scheduledHours,
          planningType: existing?.planningType || 'job',
          isAutoSplit: existing?.isAutoSplit || false,
          parentEntryId: existing?.parentEntryId || null,
          status: 'scheduled',
          notes: description || existing?.notes || '',
          cache: {
            clientName: summary,
            projectTitle: existing?.cache?.projectTitle || summary,
            projectAddress: existing?.cache?.projectAddress || '',
            totalQuoteHours: scheduledHours,
            totalQuoteAmount: existing?.cache?.totalQuoteAmount || 0,
            totalQuoteEarnings: existing?.cache?.totalQuoteEarnings || 0,
          },
          updatedAt: new Date(),
          createdAt: existing?.createdAt || new Date(),
        },
      });
    }

    const writeBatches = <T,>(items: T[], callback: (batch: FirebaseFirestore.WriteBatch, item: T) => void): FirebaseFirestore.WriteBatch[] => {
      const batches: FirebaseFirestore.WriteBatch[] = [];
      for (let index = 0; index < items.length; index += 450) {
        const batch = firestore.batch();
        items.slice(index, index + 450).forEach((item) => callback(batch, item));
        batches.push(batch);
      }
      return batches;
    };

    // Write the authoritative Google state first, then remove stale local rows.
    // Chunking keeps this safe for larger calendar ranges under Firestore's
    // 500-operation batch limit.
    await Promise.all(writeBatches(writes, (batch, write) => batch.set(write.ref, write.data)).map((batch) => batch.commit()));

    const staleEntries = localEntriesToReplace.filter((planningDoc) => !targetDocs.has(planningDoc.ref.path));
    removed = staleEntries.length;
    await Promise.all(writeBatches(staleEntries, (batch, planningDoc) => batch.delete(planningDoc.ref)).map((batch) => batch.commit()));

    return NextResponse.json({
      ok: true,
      checked: planningSnapshot.size,
      imported,
      updated,
      unchanged,
      removed,
      // Kept as a compatibility alias for older clients.
      hidden: removed,
      missing: 0,
      skipped,
    });
  } catch (error) {
    console.error('google calendar refresh error', error);
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
            source: 'google-calendar/refresh',
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
          source: 'google-calendar/refresh',
          title: 'Google Calendar verversen mislukt',
          message: errorMessage(error),
          code: 'google_calendar_refresh_failed',
          severity: 'error',
        });
      }
    }

    return NextResponse.json({ error: 'Google Calendar vernieuwen mislukt.' }, { status: 500 });
  }
}
