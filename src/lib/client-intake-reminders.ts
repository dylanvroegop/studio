import { randomUUID } from 'node:crypto';
import type { DocumentData, DocumentReference, Firestore } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '../firebase/admin';
import { getCalendarClient } from './integrations/google-calendar';
import { deliverAppMessage } from './push-inbox';
import { telegramCalendarConfirmed } from './telegram-appointment-calendar';

const COLLECTION = 'client_intake_sessions';
const LEASE_MS = 5 * 60_000;
const RETRY_MS = 5 * 60_000;
const CLOSED_STATUSES = new Set(['scheduled', 'confirmed', 'cancelled', 'completed', 'deleted']);

interface ReminderClaim {
  ref: DocumentReference;
  data: DocumentData;
  token: string;
  dueAt: number;
}

function isDue(data: DocumentData, now: number, uid?: string): boolean {
  return typeof data.userId === 'string' && Boolean(data.userId)
    && (!uid || data.userId === uid) && data.state === 'done'
    && typeof data.reminderDueAt === 'number' && data.reminderDueAt > 0 && data.reminderDueAt <= now
    && !(typeof data.reminderSentAt === 'number' && data.reminderSentAt >= data.reminderDueAt)
    && !(data.reminderLeaseUntil > now) && !(data.reminderRetryAt > now);
}

function sameClaim(data: DocumentData | undefined, claim: ReminderClaim): boolean {
  return Boolean(data && data.userId === claim.data.userId && data.revision === claim.data.revision
    && data.reminderDueAt === claim.dueAt && data.reminderLeaseToken === claim.token);
}

function planningFingerprint(data: DocumentData | undefined): string {
  return JSON.stringify(data ? [data.userId, data.quoteId, data.status, data.appointmentState,
    data.googleCalendarEventId, data.calendarSyncState, data.calendarSyncRevision, data.cancelledInGoogle] : null);
}

async function finishClaim(firestore: Firestore, claim: ReminderClaim, patch: DocumentData): Promise<boolean> {
  return firestore.runTransaction(async tx => {
    const current = (await tx.get(claim.ref)).data();
    if (!sameClaim(current, claim)) {
      // Een bewerking mag de herinnering opnieuw inplannen; wis die nieuwe datum niet.
      if (current?.reminderLeaseToken === claim.token) tx.update(claim.ref, { reminderLeaseToken: null, reminderLeaseUntil: null });
      return false;
    }
    tx.update(claim.ref, { ...patch, reminderLeaseToken: null, reminderLeaseUntil: null });
    return true;
  });
}

/** Draait zonder n8n. Alleen actuele, nog onbevestigde aanvragen krijgen één appmelding. */
export async function runClientIntakeReminders(uid?: string): Promise<number> {
  const { firestore } = initFirebaseAdmin();
  // Geen samengestelde index nodig. De eigenaarfilter voorkomt toegang tot andere sessies.
  const query = uid
    ? firestore.collection(COLLECTION).where('userId', '==', uid)
    : firestore.collection(COLLECTION).where('reminderDueAt', '>', 0).where('reminderDueAt', '<=', Date.now());
  const candidates = await query.get();
  let sent = 0;
  for (const doc of candidates.docs) {
    if (!isDue(doc.data(), Date.now(), uid)) continue;
    const claim = await firestore.runTransaction(async tx => {
      const current = (await tx.get(doc.ref)).data();
      if (!current || !isDue(current, Date.now(), uid)) return null;
      const token = randomUUID();
      tx.update(doc.ref, { reminderLeaseToken: token, reminderLeaseUntil: Date.now() + LEASE_MS });
      return { ref: doc.ref, data: current, token, dueAt: current.reminderDueAt } as ReminderClaim;
    });
    if (!claim) continue;
    try {
      const result = claim.data.result || {};
      const status = result.appointment_status || claim.data.client?.appointment_status;
      if (CLOSED_STATUSES.has(status) || !['pending', 'not_found'].includes(status)) {
        await finishClaim(firestore, claim, { reminderDueAt: null, reminderRetryAt: null });
        continue;
      }
      let planningRef: DocumentReference | null = null;
      let planning: DocumentData | undefined;
      if (result.appointment_id) {
        if (typeof result.appointment_id !== 'string' || result.appointment_id.includes('/')) throw new Error('INVALID_APPOINTMENT');
        planningRef = firestore.collection('planning_entries').doc(result.appointment_id);
        planning = (await planningRef.get()).data();
        if (!planning || planning.userId !== claim.data.userId || (result.project_id && planning.quoteId !== result.project_id)
          || CLOSED_STATUSES.has(planning.status) || CLOSED_STATUSES.has(planning.appointmentState)
          || planning.cancelledInGoogle || ['cancelled', 'completed'].includes(planning.calendarSyncState)) {
          await finishClaim(firestore, claim, { reminderDueAt: null, reminderRetryAt: null });
          continue;
        }
        if (planning.status !== 'pending' || ['pending', 'failed'].includes(planning.calendarSyncState)) throw new Error('CALENDAR_NOT_READY');
        const eventId = planning.googleCalendarEventId || result.google_calendar_event_id;
        if (!eventId) throw new Error('CALENDAR_NOT_READY');
        const user = (await firestore.collection('users').doc(claim.data.userId).get()).data();
        const integration = user?.integrations?.googleCalendar;
        if (!integration?.connected || !integration.refreshToken) throw new Error('CALENDAR_NOT_CONNECTED');
        const { calendar } = await getCalendarClient({ refreshToken: integration.refreshToken,
          accessToken: integration.accessToken || undefined, expiryDate: integration.expiryDate || undefined });
        let event;
        try {
          event = (await calendar.events.get({ calendarId: 'primary', eventId }, { timeout: 15_000 })).data;
        } catch (error) {
          const failure = error as { code?: unknown; response?: { status?: unknown } };
          if (![404, 410].includes(Number(failure.response?.status || failure.code))) throw error;
        }
        const linkedEntry = event?.extendedProperties?.private?.calvoraPlanningEntryId;
        if (!event || event.status === 'cancelled' || event.status === 'confirmed' || telegramCalendarConfirmed(event)
          || (linkedEntry && linkedEntry !== result.appointment_id)
          || event.attendees?.some(attendee => attendee.self && attendee.responseStatus === 'declined')) {
          await finishClaim(firestore, claim, { reminderDueAt: null, reminderRetryAt: null });
          continue;
        }
      } else if (status === 'pending') {
        throw new Error('APPOINTMENT_NOT_READY');
      }
      // Controleer opnieuw na de externe agendalezing: geen verouderde sessie versturen.
      const current = await firestore.runTransaction(async tx => {
        const session = (await tx.get(claim.ref)).data();
        const entry = planningRef ? (await tx.get(planningRef)).data() : undefined;
        return sameClaim(session, claim) && session?.state === 'done'
          && session.reminderLeaseUntil > Date.now() && planningFingerprint(entry) === planningFingerprint(planning);
      });
      if (!current) {
        await finishClaim(firestore, claim, { reminderRetryAt: Date.now() + RETRY_MS });
        continue;
      }
      const name = typeof claim.data.client?.client_name === 'string' ? claim.data.client.client_name.trim() : 'deze klant';
      const delivery = await deliverAppMessage(claim.data.userId, {
        eventId: `client-intake-reminder:${doc.id}:${claim.dueAt}`,
        title: 'Afspraak opvolgen',
        body: `De aanvraag van ${name || 'deze klant'} wacht al twee dagen op een bevestigde afspraak. Controleer de reactie van de klant en werk de aanvraag bij.`,
        url: `/aanvragen?id=${encodeURIComponent(doc.id)}`,
      });
      // Zonder pushabonnement is de opgeslagen appmelding de volledige aflevering.
      const completed = delivery.saved && delivery.failed === 0
        && (delivery.devices === 0 || delivery.accepted + delivery.skipped > 0);
      if (!completed) throw new Error('DELIVERY_INCOMPLETE');
      if (await finishClaim(firestore, claim, { reminderDueAt: null, reminderSentAt: Date.now(), reminderRetryAt: null })) sent += 1;
    } catch {
      await finishClaim(firestore, claim, { reminderRetryAt: Date.now() + RETRY_MS });
      // Geen klantgegevens, OAuth-fouten of tokens naar de logs.
      console.warn('Een aanvraagherinnering wordt later opnieuw gecontroleerd.');
    }
  }
  return sent;
}
