import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/firebase/admin';
import { getCalendarClient, isGoogleInvalidGrantError } from '@/lib/integrations/google-calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GOOGLE_REQUEST_CONCURRENCY = 10;

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}

function getGoogleErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const row = error as { code?: unknown; response?: { status?: unknown } };
  const status = Number(row.response?.status ?? row.code);
  return Number.isFinite(status) ? status : null;
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    let missing = 0;
    let skipped = 0;

    for (let index = 0; index < linkedEntries.length; index += GOOGLE_REQUEST_CONCURRENCY) {
      const chunk = linkedEntries.slice(index, index + GOOGLE_REQUEST_CONCURRENCY);
      await Promise.all(chunk.map(async (planningDoc) => {
        const entry = planningDoc.data() as {
          googleCalendarEventId: string;
          startDate?: Timestamp;
          endDate?: Timestamp;
        };

        try {
          const response = await calendar.events.get({
            calendarId: 'primary',
            eventId: entry.googleCalendarEventId,
          });
          const event = response.data;
          if (event.status === 'cancelled') {
            missing += 1;
            return;
          }

          const startValue = event.start?.dateTime;
          const endValue = event.end?.dateTime;
          if (!startValue || !endValue) {
            skipped += 1;
            return;
          }

          const startDate = new Date(startValue);
          const endDate = new Date(endValue);
          if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
            skipped += 1;
            return;
          }

          const currentStart = entry.startDate?.toMillis();
          const currentEnd = entry.endDate?.toMillis();
          if (currentStart === startDate.getTime() && currentEnd === endDate.getTime()) {
            unchanged += 1;
            return;
          }

          await planningDoc.ref.update({
            startDate: Timestamp.fromDate(startDate),
            endDate: Timestamp.fromDate(endDate),
            scheduledHours: (endDate.getTime() - startDate.getTime()) / 3_600_000,
            updatedAt: new Date(),
          });
          updated += 1;
        } catch (error) {
          const status = getGoogleErrorStatus(error);
          if (status === 404 || status === 410) {
            missing += 1;
            return;
          }
          throw error;
        }
      }));
    }

    return NextResponse.json({
      ok: true,
      checked: linkedEntries.length,
      updated,
      unchanged,
      missing,
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
          await firestore.collection('users').doc(decoded.uid).set({
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
        }
      }
      return NextResponse.json(
        { error: 'Google Calendar moet opnieuw gekoppeld worden.', code: 'google_calendar_reconnect_required' },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: 'Google Calendar vernieuwen mislukt.' }, { status: 500 });
  }
}
