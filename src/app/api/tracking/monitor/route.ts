import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { gpsHealth } from '@/lib/gps-health';
import { readGpsHealth } from '@/lib/gps-health-server';
import { gpsDailyReminderId, nextGpsAlert, type GpsAlertState } from '@/lib/gps-alert-state';
import { deliverAppMessage } from '@/lib/push-inbox';
import { pushUser, pushError, pushHeaders } from '@/lib/push-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  const uid = await pushUser(request, true);
  if (!uid) return pushError('Geen toegang.', 401);
  try {
    const health = await readGpsHealth().catch(() => gpsHealth(null));
    const { firestore } = initFirebaseAdmin();
    const ref = firestore.collection('gps_monitor_state').doc(uid);
    const state = await firestore.runTransaction(async tx => {
      const previous = await tx.get(ref);
      const next = nextGpsAlert(previous.data() as GpsAlertState | undefined, health, Date.now());
      tx.set(ref, { ...next, checkedAt: Date.now(), health: health.state });
      return next;
    });
    if (!state.eventId) return NextResponse.json({ ok: true, health, alert: false }, { headers: pushHeaders });
    // Dezelfde storing houdt hetzelfde eventId: retries leveren geen dubbele push op.
    const result = await deliverAppMessage(uid, {
      eventId: state.eventId,
      title: 'GPS-tracker controleren',
      body: 'Al minstens 20 minuten geen bruikbare GPS-data of GPS-controle mogelijk. Open de tracker-app en ververs of herstart de tracking. Controleer ook de verbinding en automatische datum en tijd. Route en gewerkte uren kunnen onvolledig zijn.',
      url: '/urenregistratie',
    });
    const ok = result.failed === 0 && result.accepted + result.skipped > 0;
    const reminderId = gpsDailyReminderId(state, Date.now());
    const reminder = reminderId ? await deliverAppMessage(uid, {
      eventId: reminderId,
      title: 'Herinnering: GPS controleren',
      body: 'Er is nog steeds geen recente, bruikbare GPS-data beschikbaar. Controleer de tracker en verbinding. Controleer je gewerkte uren en vul ontbrekende uren handmatig aan.',
      url: '/urenregistratie',
    }) : null;
    const reminderOk = !reminder || (reminder.failed === 0 && reminder.accepted + reminder.skipped > 0);
    return NextResponse.json({ ...result, ok: ok && reminderOk, health, alert: true, reminder }, { status: ok && reminderOk ? 200 : 503, headers: pushHeaders });
  } catch { return pushError('GPS-bewaking mislukt.', 503); }
}
