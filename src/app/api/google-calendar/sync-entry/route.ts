import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { reportGoogleCalendarAlert } from '@/lib/google-calendar-alerts';
import { getCalendarClient, isGoogleInvalidGrantError } from '@/lib/integrations/google-calendar';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim();
}

type SyncAction = 'upsert' | 'delete';

const GOOGLE_CALENDAR_RED_COLOR_ID = '11';
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

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as SyncBody;
    if (!body?.action || !body?.entryId) {
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

      // Google Calendar is the external source of truth for synced planning.
      // Deleting a Calvora planning row must never delete the Google event.
      await entryRef.set({ googleCalendarEventId: null, updatedAt: new Date() }, { merge: true });
      return NextResponse.json({ ok: true, action: 'delete' });
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

    const entryRef = firestore.collection('planning_entries').doc(body.entryId);
    const entrySnap = await entryRef.get();
    const entryData = entrySnap.exists ? entrySnap.data() as { googleCalendarEventId?: string } : {};
    const calendarEventId = body.googleCalendarEventId || entryData.googleCalendarEventId;

    if (!body.startDate || !body.endDate) {
      return NextResponse.json({ error: 'startDate/endDate vereist voor upsert' }, { status: 400 });
    }

    const isWerkbespreking = body.planningType === 'werkbespreking';
    const primaryLabel = body.cache?.clientName || body.cache?.projectTitle || 'Planning';
    const startDate = new Date(body.startDate);
    const title = `${getFirstName(primaryLabel)} ${getStartHour(startDate)}`;
    const description = [
      body.cache?.clientName ? `Klant: ${body.cache.clientName}` : '',
      body.cache?.projectAddress ? `Adres: ${body.cache.projectAddress}` : '',
      body.notes ? `Notities: ${body.notes}` : '',
      body.quoteId ? `Offerte: ${body.quoteId}` : '',
    ].filter(Boolean).join('\n');

    const payload = {
      summary: title,
      description,
      colorId: GOOGLE_CALENDAR_RED_COLOR_ID,
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
      await calendar.events.update({
        calendarId: 'primary',
        eventId: calendarEventId,
        requestBody: payload,
      });
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
  }
}
