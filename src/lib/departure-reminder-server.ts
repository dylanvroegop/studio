import { initFirebaseAdmin } from '@/firebase/admin';
import { deliverAppMessage, type InboxMessage } from '@/lib/push-inbox';
import { arrivalForEntry, departureSummary, entriesForRouteDay, isFirstJobDay, nextRouteDate, routeDate, routeTime } from '@/lib/departure-planning';
import { calculateDeparturePlan } from '@/lib/departure-maps-server';
import { fillRouteAddress, readDepartureSettings, readRouteEntries, readRouteOrigin } from '@/lib/departure-server';

/** Aan te roepen door de bestaande vijfminutentimer; eenmaal per Nederlandse avond. */
export async function sendDepartureReminder(uid: string, now = new Date()) {
  const hour = Number(routeTime(now).slice(0, 2));
  if (hour < 19 || hour >= 23) return { skipped: true, reason: 'outside_evening' };
  const settings = await readDepartureSettings(uid);
  if (!settings.remindersEnabled) return { skipped: true, reason: 'disabled' };
  const date = nextRouteDate(routeDate(now));
  const { firestore } = initFirebaseAdmin();
  const ref = firestore.collection('departure_reminders').doc(`${uid}_${date}`);
  const claim = await firestore.runTransaction(async tx => {
    const previous = (await tx.get(ref)).data();
    if (previous?.done || previous?.leaseUntil > now.getTime()) return null;
    tx.set(ref, { leaseUntil: now.getTime() + 120_000 }, { merge: true });
    return { message: previous?.message as InboxMessage | undefined };
  });
  if (!claim) return { skipped: true, reason: 'already_sent_or_running' };
  try {
    let message = claim.message;
    if (!message) {
      const entries = await readRouteEntries(uid), tomorrow = entriesForRouteDay(entries, date);
      // Geen definitieve markering: later op de avond toegevoegde planning wordt alsnog opgepakt.
      if (!tomorrow.length) {
        await ref.set({ leaseUntil: 0 }, { merge: true });
        return { skipped: true, reason: 'no_planning' };
      }
      const entry = await fillRouteAddress(uid, tomorrow[0]);
      let title = 'Vertrektijd voor morgen', body: string;
      try {
        const plan = await calculateDeparturePlan({ entry, date, origin: await readRouteOrigin(uid, date, now, true),
          viaBouwmaat: isFirstJobDay(entry, entries, date), now });
        title = `Morgen rond ${routeTime(plan.departureAt)} vertrekken`;
        body = departureSummary(plan);
      } catch (error) {
        title = 'Vertrektijd voor morgen controleren';
        body = `Morgen ${routeTime(arrivalForEntry(entry, date))} bij ${entry.clientName}.\n${entry.address}\n`
          + (error instanceof Error ? error.message : 'De route kon niet worden berekend.');
      }
      if (tomorrow.length > 1) body += '\n\nVerder gepland:\n' + tomorrow.slice(1).map(row =>
        `${routeTime(arrivalForEntry(row, date))} ${row.clientName} — ${row.address}`).join('\n');
      message = { eventId: `departure:${date}`, title, body: body.slice(0, 19000), url: '/planning' };
      await ref.set({ message }, { merge: true });
    }
    const result = await deliverAppMessage(uid, message);
    // Ook zonder geregistreerd apparaat blijft het bericht in de app bewaard.
    const done = result.failed === 0;
    await ref.set({ done, leaseUntil: 0, checkedAt: now.toISOString(), pushAccepted: result.accepted }, { merge: true });
    return { ok: done, ...result };
  } catch (error) {
    await ref.set({ leaseUntil: 0 }, { merge: true });
    throw error;
  }
}
