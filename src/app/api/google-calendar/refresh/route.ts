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
    const linkedEntries = planningSnapshot.docs.filter((planningDoc) => {
      const eventId = planningDoc.data().googleCalendarEventId;
      return typeof eventId === 'string' && eventId.trim().length > 0;
    });

    let updated = 0;
    let unchanged = 0;
    const missing = 0;
    let skipped = 0;
    let imported = 0;
    let hidden = 0;

    const linkedEntriesByGoogleId = new Map<string, typeof linkedEntries[number]>();
    linkedEntries.forEach((planningDoc) => {
      const eventId = String(planningDoc.data().googleCalendarEventId || '').trim();
      if (eventId) linkedEntriesByGoogleId.set(eventId, planningDoc);
    });

    const googleEventIdsInRange = new Set<string>();
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
        const existingDoc = linkedEntriesByGoogleId.get(eventId);
        const entryRef = existingDoc?.ref || firestore.collection('planning_entries').doc(googleEventDocId(eventId));
        const existing = existingDoc?.data() as {
          startDate?: Timestamp;
          endDate?: Timestamp;
          cache?: { clientName?: string; projectTitle?: string; projectAddress?: string };
          notes?: string;
          status?: string;
        } | undefined;

        const summary = event.summary?.trim() || 'Google Calendar';
        const description = event.description?.trim() || '';
        const scheduledHours = Math.max(
          0,
          (parsedRange.endDate.getTime() - parsedRange.startDate.getTime()) / 3_600_000,
        );
        const nextData = {
          userId: decoded.uid,
          quoteId: existingDoc?.data()?.quoteId || '',
          googleCalendarEventId: eventId,
          googleCalendarHtmlLink: event.htmlLink || null,
          isAllDay: parsedRange.allDay,
          source: existingDoc?.data()?.source || (existingDoc ? 'calvora' : 'google'),
          startDate: Timestamp.fromDate(parsedRange.startDate),
          endDate: Timestamp.fromDate(parsedRange.endDate),
          scheduledHours,
          planningType: existingDoc?.data()?.planningType || 'job',
          isAutoSplit: existingDoc?.data()?.isAutoSplit || false,
          parentEntryId: existingDoc?.data()?.parentEntryId || null,
          status: 'scheduled',
          notes: description || existing?.notes || '',
          cache: {
            clientName: summary,
            projectTitle: existing?.cache?.projectTitle || summary,
            projectAddress: existing?.cache?.projectAddress || '',
            totalQuoteHours: scheduledHours,
            totalQuoteAmount: existingDoc?.data()?.cache?.totalQuoteAmount || 0,
            totalQuoteEarnings: existingDoc?.data()?.cache?.totalQuoteEarnings || 0,
          },
          updatedAt: new Date(),
          createdAt: existingDoc?.data()?.createdAt || new Date(),
        };

        const currentStart = existing?.startDate?.toMillis();
        const currentEnd = existing?.endDate?.toMillis();
        const sameDates = currentStart === parsedRange.startDate.getTime() && currentEnd === parsedRange.endDate.getTime();
        const sameTitle = existing?.cache?.clientName === summary && existing?.status === 'scheduled';

        await entryRef.set(nextData, { merge: true });

        if (!existingDoc) {
          imported += 1;
        } else if (sameDates && sameTitle) {
          unchanged += 1;
        } else {
          updated += 1;
        }
      }

      pageToken = listResponse.data.nextPageToken || undefined;
    } while (pageToken);

    const linkedEntriesInRange = linkedEntries.filter((planningDoc) => {
      const entry = planningDoc.data() as {
        startDate?: Timestamp;
        endDate?: Timestamp;
        source?: string;
      };
      const startDate = entry.startDate?.toDate();
      const endDate = entry.endDate?.toDate();
      return entry.source === 'google'
        && startDate
        && endDate
        && overlapsRange(startDate, endDate, rangeStart, rangeEnd);
    });

    await Promise.all(linkedEntriesInRange.map(async (planningDoc) => {
      const eventId = String(planningDoc.data().googleCalendarEventId || '').trim();
      if (!eventId || googleEventIdsInRange.has(eventId)) return;
      await planningDoc.ref.set({
        status: 'cancelled',
        updatedAt: new Date(),
      }, { merge: true });
      hidden += 1;
    }));

    return NextResponse.json({
      ok: true,
      checked: linkedEntries.length,
      imported,
      updated,
      unchanged,
      missing,
      hidden,
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
