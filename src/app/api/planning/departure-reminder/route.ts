import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { getDrivingDistance } from '@/lib/driving-distance-server';
import { getDepartureReminder, getDepartureTrips, reminderInterval } from '@/lib/planning-departure-reminder';
import { deliverAppMessage } from '@/lib/push-inbox';
import { pushError, pushHeaders, pushId } from '@/lib/push-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const routeCache = new Map<string, { until: number; minutes: Promise<number | null> }>();

function estimateDrive(uid: string, trip: ReturnType<typeof getDepartureTrips>[number], now: number) {
  if (!trip.origin || !trip.destination) return Promise.resolve(null);
  if (trip.origin.toLowerCase() === trip.destination.toLowerCase()) return Promise.resolve(0);

  const key = JSON.stringify([uid, trip.origin, trip.destination]);
  const cached = routeCache.get(key);
  if (cached && cached.until > now) return cached.minutes;
  const entry = {
    until: now + 60 * 60_000,
    minutes: getDrivingDistance({
      originAddress: trip.origin, destinationAddress: trip.destination,
      quoteId: trip.meeting.quoteId || '', userId: uid, manualQuote: false,
    }).then(result => {
      if (result.durationMinOneWay > 0) return result.durationMinOneWay;
      entry.until = now + reminderInterval;
      return null;
    }).catch(() => {
      entry.until = now + reminderInterval;
      return null;
    }),
  };
  routeCache.set(key, entry);
  return entry.minutes;
}

export async function POST(request: Request): Promise<NextResponse> {
  const token = request.headers.get('authorization')?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
  if (!token) return pushError('Geen toegang.', 401);
  try {
    const authorization = await supabaseAdmin.rpc('authorize_planning_departure_reminder', { provided_token: token });
    if (authorization.error) throw authorization.error;
    if (authorization.data !== true) return pushError('Geen toegang.', 401);

    const uid = process.env.CALVORA_USER_ID?.trim();
    if (!uid) return pushError('Calvora-eigenaar ontbreekt.', 503);
    const now = new Date();
    for (const [key, cached] of routeCache) {
      if (cached.until <= now.getTime()) routeCache.delete(key);
    }

    const { firestore } = initFirebaseAdmin();
    // Eén datumindex volstaat. Filter op eigenaar vóór adressen of afspraken worden gebruikt.
    const planning = await firestore.collection('planning_entries')
      .where('startDate', '>=', new Date(now.getTime() - 26 * 3_600_000))
      .where('startDate', '<', new Date(now.getTime() + 26 * 3_600_000))
      .get();
    const entries = planning.docs.flatMap(doc => {
      const data = doc.data();
      if (data.userId !== uid) return [];
      const start = data.startDate?.toDate?.();
      if (!(start instanceof Date) || !Number.isFinite(start.getTime())) return [];
      return [{ ...data, id: doc.id, start }];
    });

    const jobs = getDepartureTrips(entries, now).map(async trip => {
      const eventId = `werkbespreking-${pushId(trip.meeting.id)}-${trip.meeting.start.getTime()}`;
      const minutes = await estimateDrive(uid, trip, now.getTime());
      const reminder = getDepartureReminder(trip.meeting.start, now, minutes);
      if (!reminder) return null;

      const client = trip.meeting.cache?.clientName?.trim() || 'klant';
      const body = reminder.leaveTime
        ? `${client} om ${reminder.appointmentTime}. Geschatte rijtijd ${minutes} min. Vertrek om ${reminder.leaveTime}.`
        : `${client} om ${reminder.appointmentTime}. De rijtijd is onbekend. Controleer je route en vertrektijd.`;
      return deliverAppMessage(uid, { eventId, title: 'Werkbespreking', body, url: '/planning' });
    });

    const results = await Promise.all(jobs);
    const failed = results.some(result => result && result.failed > 0);
    return NextResponse.json({ ok: !failed, reminders: results.filter(Boolean).length }, {
      status: failed ? 503 : 200, headers: pushHeaders,
    });
  } catch (error) {
    console.error('Vertrekherinneringen controleren mislukt', error);
    return pushError('Vertrekherinneringen controleren mislukt.', 503);
  }
}
