#!/usr/bin/env node
// Alleen bestaande, reeds aangeboden toekomstige voorstellen herstellen.
// Standaard uitsluitend lezen: node scripts/restore-telegram-pending-reservations.cjs
// Expliciet toepassen: node scripts/restore-telegram-pending-reservations.cjs --apply
const { createHash, randomUUID } = require('node:crypto');
const path = require('node:path');

const SOURCE = 'telegram_werkspot';
const TIME_ZONE = 'Europe/Amsterdam';
const RESTORE_SOURCE = 'restore-telegram-pending-reservations';

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  return value;
}
function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}
function dateValue(value) {
  const date = value instanceof Date ? value : value && typeof value.toDate === 'function' ? value.toDate() : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}
function originalStart(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const local = Date.UTC(year, month - 1, day, hour, minute);
  const parts = value => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  const offset = value => {
    const p = parts(value);
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - value;
  };
  let utc = local - offset(local);
  utc = local - offset(utc);
  const p = parts(utc);
  if (`${p.year}-${p.month}-${p.day}` !== date || `${p.hour}:${p.minute}` !== time) return null;
  return new Date(utc);
}
function cancelled(value) {
  return ['cancelled', 'confirmed', 'scheduled'].includes(value?.status)
    || ['cancelled', 'confirmed', 'scheduled'].includes(value?.appointmentState)
    || ['cancelled', 'confirmed', 'scheduled'].includes(value?.appointment_status)
    || value?.calendarSyncState === 'cancelled' || value?.cancelledInGoogle === true;
}
function evaluateEligibility({ uid, importId, imported, quote, client, entry, now = new Date(), assertIdentity }) {
  const reject = reason => ({ eligible: false, reason });
  if (!imported || imported.userId !== uid || imported.source !== SOURCE) return reject('import_owner_or_source');
  if (imported.appointment_status !== 'pending' || cancelled(imported)) return reject('not_pending_or_cancelled');
  if (!/^telegram_session_.+/.test(imported.lead_key || '') || !imported.appointment_id || !imported.project_id || !imported.client_id) return reject('missing_references');
  if (createHash('sha256').update(`${uid}:${imported.lead_key}`).digest('hex') !== importId) return reject('import_key_mismatch');
  if (imported.calendar_synced === true || imported.google_calendar_event_id || imported.googleCalendarEventId
    || imported.calendarSyncState === 'synced') return reject('previous_google_sync');
  if (!quote || quote.userId !== uid || quote.clientId !== imported.client_id || quote.archived === true) return reject('quote_owner_or_client');
  if (!client || client.userId !== uid) return reject('client_owner');
  try { assertIdentity(client, quote.klantinformatie || {}); } catch { return reject('client_identity_conflict'); }
  const date = imported.appointment_date;
  const time = imported.appointment_time;
  const startDate = originalStart(date, time);
  if (!startDate || startDate <= now) return reject('not_future_or_invalid_date');
  if ((imported.suggested_appointment_date && imported.suggested_appointment_date !== date)
    || (imported.suggested_appointment_time && imported.suggested_appointment_time !== time)) return reject('conflicting_offered_date');
  const importFingerprint = fingerprint(imported);
  let reason = 'legacy_missing_planning';
  if (entry) {
    const ownIdentity = entry.userId === uid && entry.source === SOURCE && entry.quoteId === imported.project_id
      && entry.leadKey === imported.lead_key;
    const ownRetry = ownIdentity && entry.legacyRestoreSource === RESTORE_SOURCE
      && entry.legacyRestoreImportFingerprint === importFingerprint;
    const existingLegacy = ownIdentity && entry.suggestedBy === 'telegram_auto_message'
      && entry.planningType === 'werkbespreking' && entry.appointmentState === 'pending'
      && !entry.calendarSyncState && !entry.calendarSyncRevision && !entry.calendarSyncLeaseToken
      && !entry.calendarSyncLeaseUntil && !entry.googleCalendarHtmlLink && !entry.googleCalendarSyncedAt
      && !entry.legacyRestoreSource && !entry.legacyRestoreGoogleInsertAttempted;
    if ((!ownRetry && !existingLegacy) || cancelled(entry) || entry.status !== 'pending' || entry.googleCalendarEventId
      || entry.calendarSyncState === 'synced') return reject('planning_exists_or_tombstone');
    if ((dateValue(entry.calendarSyncLeaseUntil)?.getTime() || 0) > now.getTime()) return reject('restore_lease_active');
    if (dateValue(entry.startDate)?.getTime() !== startDate.getTime()
      || dateValue(entry.endDate)?.getTime() !== startDate.getTime() + 3_600_000) return reject('restore_date_changed');
    reason = ownRetry ? 'retry_own_restore' : 'legacy_existing_pending';
  }
  return { eligible: true, reason,
    importId, importFingerprint, appointmentId: imported.appointment_id, quoteId: imported.project_id,
    clientId: imported.client_id, leadKey: imported.lead_key, date, time, startDate,
    endDate: new Date(startDate.getTime() + 3_600_000), imported, quote, client,
    existingEntryFingerprint: entry ? fingerprint(entry) : null };
}
function overlaps(left, right) {
  return left.startDate < right.endDate && left.endDate > right.startDate;
}
function collisionPairs(candidates) {
  const pairs = [];
  for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
    if (overlaps(candidates[i], candidates[j])) pairs.push([candidates[i].appointmentId, candidates[j].appointmentId]);
  }
  return pairs;
}
function statusCode(error) { return Number(error?.response?.status || error?.code || 0); }
function safeReason(error) { return statusCode(error) || (/^[a-z_]+$/.test(error?.message || '') ? error.message : 'google_read_failed'); }
function pendingPayload(candidate) {
  const name = [candidate.client.voornaam, candidate.client.achternaam].filter(Boolean).join(' ') || 'Werkbespreking';
  const address = [candidate.quote.klantinformatie?.straat, candidate.quote.klantinformatie?.huisnummer,
    candidate.quote.klantinformatie?.plaats].filter(Boolean).join(' ');
  const sessionId = candidate.leadKey.replace(/^telegram_session_/, '');
  return {
    summary: `PENDING · ${name} ${candidate.time}`, status: 'tentative', transparency: 'opaque', colorId: '11',
    description: [`Klant: ${name}`, `Werk: ${candidate.quote.titel || 'Werkbespreking'}`,
      `Offerte: ${candidate.quoteId}`, `Telegram-sessie: ${sessionId}`, 'Status: pending',
      'Oorspronkelijk aangeboden voorstel hersteld; nog niet bevestigd.'].join('\n'),
    location: address,
    start: { dateTime: candidate.startDate.toISOString(), timeZone: TIME_ZONE },
    end: { dateTime: candidate.endDate.toISOString(), timeZone: TIME_ZONE },
    extendedProperties: { private: {
      calvoraPlanningEntryId: candidate.appointmentId, calvoraQuoteId: candidate.quoteId,
      calvoraType: 'telegram-appointment', appointmentStatus: 'pending', telegramSessionId: sessionId,
    } },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 90 }] },
  };
}
function assertAdoptable(event, candidate) {
  const marker = event?.extendedProperties?.private;
  if (event?.status === 'cancelled') throw new Error('google_deleted');
  if (marker?.calvoraPlanningEntryId !== candidate.appointmentId || marker?.calvoraQuoteId !== candidate.quoteId
    || marker?.telegramSessionId !== candidate.leadKey.replace(/^telegram_session_/, '')
    || marker?.appointmentStatus !== 'pending') throw new Error('google_marker_or_status_conflict');
  if (new Date(event.start?.dateTime || '').getTime() !== candidate.startDate.getTime()
    || new Date(event.end?.dateTime || '').getTime() !== candidate.endDate.getTime()) throw new Error('google_date_changed');
}
async function inspectGoogle(calendar, candidate) {
  let deterministic = null;
  try {
    deterministic = (await calendar.events.get({ calendarId: 'primary', eventId: candidate.eventId })).data;
  } catch (error) {
    if (statusCode(error) === 410) throw new Error('google_deleted');
    if (statusCode(error) !== 404) throw error;
    if (candidate.previousInsertAttempted) throw new Error('previous_insert_absent_check_manually');
  }
  if (deterministic) assertAdoptable(deterministic, candidate);
  const marker = `Telegram-sessie: ${candidate.leadKey.replace(/^telegram_session_/, '')}`;
  let pageToken;
  do {
    const result = await calendar.events.list({ calendarId: 'primary', q: marker, showDeleted: true, maxResults: 2500, pageToken });
    for (const event of result.data.items || []) {
      const matches = event.extendedProperties?.private?.telegramSessionId === candidate.leadKey.replace(/^telegram_session_/, '')
        || event.description?.split('\n').some(line => line.trim() === marker);
      if (matches && event.id !== candidate.eventId) throw new Error(event.status === 'cancelled' ? 'google_deleted' : 'existing_legacy_google_event');
    }
    pageToken = result.data.nextPageToken || undefined;
  } while (pageToken);
  return deterministic;
}
function loadRuntime() {
  require('dotenv').config({ path: path.join(__dirname, '../.env.local'), quiet: true });
  require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
  const identity = require('../src/lib/telegram-client-identity.ts');
  return {
    ...require('../src/firebase/admin.ts'), ...require('../src/lib/integrations/google-calendar.ts'),
    ...require('../src/lib/telegram-appointment-calendar.ts'),
    ...require('firebase-admin/firestore'),
    assertIdentity: (client, quoteClient) => identity.assertSameTelegramClient(identity.storedClientIdentity(client), identity.storedClientIdentity(quoteClient)),
  };
}

async function restoreCandidate({ firestore, calendar, uid, candidate, runtime }) {
  const { FieldValue, Timestamp, assertIdentity } = runtime;
  const entryRef = firestore.collection('planning_entries').doc(candidate.appointmentId);
  const importRef = firestore.collection('telegram_lead_imports').doc(candidate.importId);
  const quoteRef = firestore.collection('quotes').doc(candidate.quoteId);
  const clientRef = firestore.collection('clients').doc(candidate.clientId);
  const lockRef = firestore.collection('telegram_appointment_locks').doc(uid);
  const revision = randomUUID();
  const leaseToken = randomUUID();
  const liveOverlaps = await firestore.runTransaction(async transaction => {
    const [importSnap, quoteSnap, clientSnap, entrySnap, lockSnap] = await transaction.getAll(importRef, quoteRef, clientRef, entryRef, lockRef);
    const planning = await transaction.get(firestore.collection('planning_entries').where('userId', '==', uid));
    if (fingerprint(importSnap.data()) !== candidate.importFingerprint) throw new Error('import_changed');
    const checked = evaluateEligibility({ uid, importId: candidate.importId, imported: importSnap.data(), quote: quoteSnap.data(),
      client: clientSnap.data(), entry: entrySnap.data(), assertIdentity });
    if (!checked.eligible) throw new Error(checked.reason);
    if (fingerprint(quoteSnap.data()) !== fingerprint(candidate.quote)
      || fingerprint(clientSnap.data()) !== fingerprint(candidate.client)) throw new Error('quote_or_client_changed');
    if ((entrySnap.exists ? fingerprint(entrySnap.data()) : null) !== candidate.existingEntryFingerprint) throw new Error('planning_changed_since_read');
    const collisions = planning.docs.filter(document => {
      const data = document.data();
      const range = { startDate: dateValue(data.startDate), endDate: dateValue(data.endDate) };
      return document.id !== candidate.appointmentId && data.status !== 'cancelled'
        && range.startDate && range.endDate && overlaps(candidate, range);
    }).map(document => document.id);
    const payload = pendingPayload(checked);
    const newPlanning = {
      userId: uid, quoteId: candidate.quoteId, leadKey: candidate.leadKey, source: SOURCE,
      startDate: Timestamp.fromDate(candidate.startDate), endDate: Timestamp.fromDate(candidate.endDate),
      status: 'pending', appointmentState: 'pending', planningType: 'werkbespreking', scheduledHours: 1,
      isAutoSplit: false, parentEntryId: null, suggestedBy: 'telegram_auto_message',
      notes: 'Oorspronkelijk aangeboden voorstel hersteld; wacht op bevestiging van de klant.',
      cache: { clientName: [checked.client.voornaam, checked.client.achternaam].filter(Boolean).join(' '),
        projectTitle: `Werkbespreking · ${checked.quote.titel || 'Werkbespreking'}`, projectAddress: payload.location,
        totalQuoteHours: 1, totalQuoteAmount: 0, totalQuoteEarnings: 0,
        suggestedAppointmentOptions: candidate.imported.suggested_appointment_options || [{ date: candidate.date, time: candidate.time }],
      },
      createdAt: FieldValue.serverTimestamp(),
    };
    transaction.set(entryRef, {
      // Bestaande legacyplanning behoudt haar volledige datum, omschrijving,
      // klantcache en financiële metadata; alleen de synchronisatie wordt toegevoegd.
      ...(!entrySnap.exists ? newPlanning : {}),
      calendarSyncState: 'pending', calendarSyncRevision: revision,
      calendarSyncLeaseToken: leaseToken, calendarSyncLeaseUntil: Timestamp.fromDate(new Date(Date.now() + 120_000)),
      legacyRestoreSource: RESTORE_SOURCE, legacyRestoreImportFingerprint: candidate.importFingerprint,
      legacyRestoreOverlaps: collisions, legacyRestoreAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: entrySnap.exists });
    transaction.set(lockRef, { version: Number(lockSnap.data()?.version || 0) + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return collisions;
  });

  try {
    // Nooit patchen: een bestaande afspraak kan ondertussen handmatig zijn aangepast.
    let existing = await inspectGoogle(calendar, candidate);
    if (!existing) {
      await firestore.runTransaction(async transaction => {
        const [entrySnap, importSnap] = await transaction.getAll(entryRef, importRef);
        const data = entrySnap.data();
        if (data?.userId !== uid || data.quoteId !== candidate.quoteId || data.leadKey !== candidate.leadKey
          || data.status !== 'pending' || data.calendarSyncLeaseToken !== leaseToken || data.calendarSyncRevision !== revision || cancelled(data)
          || (dateValue(data.calendarSyncLeaseUntil)?.getTime() || 0) <= Date.now()
          || fingerprint(importSnap.data()) !== candidate.importFingerprint) throw new Error('restore_changed_during_sync');
        transaction.set(entryRef, { legacyRestoreGoogleInsertAttempted: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
      try {
        existing = (await calendar.events.insert({ calendarId: 'primary',
          requestBody: { ...pendingPayload(candidate), id: candidate.eventId }, sendUpdates: 'none' })).data;
      } catch (error) {
        if (statusCode(error) !== 409) throw error;
        try { existing = (await calendar.events.get({ calendarId: 'primary', eventId: candidate.eventId })).data; }
        catch (readError) { if ([404, 410].includes(statusCode(readError))) throw new Error('google_deleted'); throw readError; }
      }
      assertAdoptable(existing, candidate);
    }
    await firestore.runTransaction(async transaction => {
      const [entrySnap, importSnap, lockSnap] = await transaction.getAll(entryRef, importRef, lockRef);
      const data = entrySnap.data();
      if (data?.userId !== uid || data.quoteId !== candidate.quoteId || data.leadKey !== candidate.leadKey
        || data.status !== 'pending' || data.calendarSyncLeaseToken !== leaseToken || data.calendarSyncRevision !== revision
        || cancelled(data) || fingerprint(importSnap.data()) !== candidate.importFingerprint) throw new Error('restore_changed_during_sync');
      transaction.set(entryRef, {
        googleCalendarEventId: candidate.eventId, calendarSyncState: 'synced', calendarSyncError: null,
        calendarSyncLeaseToken: null, calendarSyncLeaseUntil: null, updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(importRef, {
        calendar_synced: true, google_calendar_event_id: candidate.eventId, updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(lockRef, { version: Number(lockSnap.data()?.version || 0) + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    return { appointmentId: candidate.appointmentId, date: candidate.date, time: candidate.time, restored: true, overlaps: liveOverlaps };
  } catch (error) {
    const deleted = error.message === 'google_deleted' || statusCode(error) === 410;
    await firestore.runTransaction(async transaction => {
      const [entrySnap, lockSnap] = await transaction.getAll(entryRef, lockRef);
      const current = entrySnap.data();
      if (current?.calendarSyncLeaseToken !== leaseToken || current.calendarSyncRevision !== revision || cancelled(current)) return;
      transaction.set(entryRef, {
        calendarSyncState: deleted ? 'cancelled' : 'failed',
        ...(deleted ? { status: 'cancelled', appointmentState: 'cancelled', cancelledInGoogle: true } : {}),
        calendarSyncError: deleted ? 'google_deleted' : 'restore_failed_check_manually',
        calendarSyncLeaseToken: null, calendarSyncLeaseUntil: null, updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(lockRef, { version: Number(lockSnap.data()?.version || 0) + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    throw error;
  }
}

async function main(args = process.argv.slice(2)) {
  if (args.some(arg => !['--apply', '--dry-run'].includes(arg)) || args.includes('--apply') && args.includes('--dry-run')) {
    throw new Error('Gebruik geen argumenten (dry-run), --dry-run of --apply.');
  }
  const apply = args.includes('--apply');
  const runtime = loadRuntime();
  const uid = process.env.CALVORA_USER_ID?.trim();
  if (!uid) throw new Error('CALVORA_USER_ID ontbreekt');
  const { firestore } = runtime.initFirebaseAdmin();
  const [imports, planning, user] = await Promise.all([
    firestore.collection('telegram_lead_imports').where('userId', '==', uid).get(),
    firestore.collection('planning_entries').where('userId', '==', uid).get(),
    firestore.collection('users').doc(uid).get(),
  ]);
  const entryMap = new Map(planning.docs.map(document => [document.id, document.data()]));
  const candidates = [];
  const rejected = {};
  for (const document of imports.docs) {
    const imported = document.data();
    if (imported.appointment_status !== 'pending') continue;
    const [quote, client, entry] = await Promise.all([
      imported.project_id ? firestore.collection('quotes').doc(imported.project_id).get() : null,
      imported.client_id ? firestore.collection('clients').doc(imported.client_id).get() : null,
      imported.appointment_id ? firestore.collection('planning_entries').doc(imported.appointment_id).get() : null,
    ]);
    const checked = evaluateEligibility({ uid, importId: document.id, imported, quote: quote?.data(), client: client?.data(),
      entry: entry?.data(), assertIdentity: runtime.assertIdentity });
    if (!checked.eligible) { rejected[checked.reason] = (rejected[checked.reason] || 0) + 1; continue; }
    candidates.push({ ...checked, previousInsertAttempted: entry?.data()?.legacyRestoreGoogleInsertAttempted === true,
      eventId: runtime.telegramCalendarEventId(checked.appointmentId) });
  }
  const integration = user.data()?.integrations?.googleCalendar;
  if (!integration?.connected || !integration.refreshToken) throw new Error('Google Calendar is niet gekoppeld');
  const { calendar } = await runtime.getCalendarClient({
    refreshToken: integration.refreshToken, accessToken: integration.accessToken, expiryDate: integration.expiryDate,
  });
  const eligible = [];
  const blocked = [];
  for (const candidate of candidates) {
    try { await inspectGoogle(calendar, candidate); eligible.push(candidate); }
    catch (error) { blocked.push({ appointmentId: candidate.appointmentId, reason: safeReason(error) }); }
  }
  const pairCollisions = collisionPairs(eligible);
  const overlappingPlanning = [];
  const overlappingGoogle = [];
  if (eligible.length) {
    const first = new Date(Math.min(...eligible.map(item => item.startDate.getTime())));
    const last = new Date(Math.max(...eligible.map(item => item.endDate.getTime())));
    const googleEvents = await runtime.loadTelegramCalendarWindow(calendar, first, last);
    for (const candidate of eligible) {
      for (const [id, data] of entryMap) {
        const range = { startDate: dateValue(data.startDate), endDate: dateValue(data.endDate) };
        if (id !== candidate.appointmentId && data.status !== 'cancelled' && range.startDate && range.endDate && overlaps(candidate, range)) {
          overlappingPlanning.push({ appointmentId: candidate.appointmentId, overlapsPlanningId: id });
        }
      }
      for (const event of googleEvents) {
        const busy = runtime.telegramCalendarPlanningEntry(event);
        if (busy && event.id !== candidate.eventId && overlaps(candidate, busy)) overlappingGoogle.push({ appointmentId: candidate.appointmentId, overlapsGoogleId: event.id });
      }
    }
  }
  const report = {
    mode: apply ? 'apply' : 'dry-run', phase: 'plan', eligibleCount: eligible.length, rejected, blocked,
    proposals: eligible.map(({ appointmentId, quoteId, date, time, reason }) => ({ appointmentId, quoteId, date, time, reason })),
    legacyOverlapPairs: pairCollisions, overlappingPlanning, overlappingGoogle,
    databaseWrites: 0, calendarWrites: 0, messages: 0,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!apply) return report;
  // Overlap wordt vooraf zichtbaar gerapporteerd. --apply herstelt alle reeds
  // aangeboden voorstellen, zonder zelf een winnaar of een nieuwe datum te kiezen.
  if (blocked.length) throw new Error('Geblokkeerde kandidaten: controleer deze voordat herstel wordt toegepast.');
  for (const candidate of eligible) {
    const result = await restoreCandidate({ firestore, calendar, uid, candidate, runtime });
    console.log(JSON.stringify(result));
  }
  return report;
}

module.exports = { fingerprint, originalStart, evaluateEligibility, collisionPairs, overlaps,
  pendingPayload, assertAdoptable, inspectGoogle, restoreCandidate, main };
if (require.main === module) main().catch(error => {
  // API errors can contain OAuth credentials; never print the raw error object.
  console.error(JSON.stringify({ failed: true, code: statusCode(error) || 'restore_failed',
    reason: /^[a-z_]+$/.test(error.message || '') ? error.message : 'Zie controle of configuratie; geen ruwe API-fout gelogd.' }));
  process.exitCode = 1;
});
