const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const restore = require('./restore-telegram-pending-reservations.cjs');

const uid = 'test-owner';
const leadKey = 'telegram_session_test';
const now = new Date('2026-10-06T10:00:00Z');
const importId = createHash('sha256').update(`${uid}:${leadKey}`).digest('hex');
const imported = {
  userId: uid, source: 'telegram_werkspot', lead_key: leadKey, appointment_id: 'appointment',
  project_id: 'quote', client_id: 'client', appointment_status: 'pending',
  appointment_date: '2026-10-09', appointment_time: '19:00',
  suggested_appointment_date: '2026-10-09', suggested_appointment_time: '19:00',
};
const client = { userId: uid, name: 'Test Klant' };
const quote = { userId: uid, clientId: 'client', klantinformatie: { name: 'Test Klant' } };
const assertIdentity = (a, b) => assert.equal(a.name, b.name);
const input = overrides => ({ uid, importId, imported, client, quote, now, assertIdentity, ...overrides });
const eligible = overrides => restore.evaluateEligibility(input(overrides));

test('herstelt alleen het exacte oorspronkelijke ID, datum en tijd van toekomstig pending voorstel', () => {
  const result = eligible();
  assert.equal(result.eligible, true);
  assert.equal(result.appointmentId, 'appointment');
  assert.equal(result.startDate.toISOString(), '2026-10-09T17:00:00.000Z');
  assert.equal(result.endDate.toISOString(), '2026-10-09T18:00:00.000Z');
  assert.equal(result.reason, 'legacy_missing_planning');
});

test('wintertijd en ongeldige kalenderdatums worden expliciet gecontroleerd', () => {
  assert.equal(restore.originalStart('2026-10-25', '19:00').toISOString(), '2026-10-25T18:00:00.000Z');
  assert.equal(restore.originalStart('2026-02-30', '19:00'), null);
  assert.equal(restore.originalStart('2026-03-29', '02:30'), null);
  assert.equal(restore.originalStart('2026-10-09', '24:00'), null);
});

test('bevestigde, geannuleerde en eerder gesynchroniseerde imports worden nooit hersteld', () => {
  for (const extra of [
    { appointment_status: 'scheduled' }, { appointment_status: 'confirmed' },
    { appointment_status: 'cancelled' }, { cancelledInGoogle: true },
    { calendarSyncState: 'cancelled' }, { calendar_synced: true },
    { google_calendar_event_id: 'old-google-event' }, { calendarSyncState: 'synced' },
  ]) assert.equal(eligible({ imported: { ...imported, ...extra } }).eligible, false);
});

test('weigert verkeerde eigenaar, import-key, offerte, klantidentiteit en tegenstrijdige datum', () => {
  const cases = [
    { imported: { ...imported, userId: 'other' } }, { importId: 'wrong-hash' },
    { quote: { ...quote, userId: 'other' } }, { quote: { ...quote, clientId: 'other' } },
    { quote: { ...quote, archived: true } }, { client: { ...client, userId: 'other' } },
    { quote: { ...quote, klantinformatie: { name: 'Andere Klant' } } },
    { imported: { ...imported, suggested_appointment_date: '2026-10-10' } },
    { now: new Date('2026-10-10T00:00Z') },
  ];
  for (const changed of cases) assert.equal(eligible(changed).eligible, false);
});

test('bestaande planning of tombstone blijft altijd staan, ook als de import nog pending zegt', () => {
  for (const status of ['pending', 'scheduled', 'confirmed', 'cancelled']) {
    assert.equal(eligible({ entry: { userId: uid, status } }).eligible, false);
  }
});

test('exacte bestaande legacy pending planning zonder enig synchronisatiespoor mag alleen gekoppeld worden', () => {
  const entry = {
    userId: uid, source: 'telegram_werkspot', quoteId: 'quote', leadKey,
    status: 'pending', appointmentState: 'pending', planningType: 'werkbespreking', suggestedBy: 'telegram_auto_message',
    startDate: new Date('2026-10-09T17:00Z'), endDate: new Date('2026-10-09T18:00Z'),
    notes: 'Eigen omschrijving', cache: { totalQuoteAmount: 900 },
  };
  assert.equal(eligible({ entry }).reason, 'legacy_existing_pending');
  assert.equal(eligible({ entry }).existingEntryFingerprint, restore.fingerprint(entry));
  for (const extra of [
    { status: 'cancelled' }, { appointmentState: 'scheduled' }, { googleCalendarEventId: 'old' },
    { googleCalendarHtmlLink: 'old' }, { calendarSyncState: 'pending' }, { calendarSyncState: 'failed' },
    { calendarSyncRevision: 'new-runtime' }, { calendarSyncLeaseToken: 'old-token' },
    { calendarSyncLeaseUntil: new Date('2026-10-01T00:00Z') }, { suggestedBy: null },
    { leadKey: 'telegram_session_other' }, { quoteId: 'different-quote' },
    { startDate: new Date('2026-10-10T17:00Z') },
  ]) assert.equal(eligible({ entry: { ...entry, ...extra } }).eligible, false);
});

test('alleen een eigen ongewijzigde mislukte herstelpoging zonder actieve lease kan opnieuw', () => {
  const entry = {
    userId: uid, source: 'telegram_werkspot', quoteId: 'quote', leadKey,
    status: 'pending', calendarSyncState: 'failed',
    legacyRestoreSource: 'restore-telegram-pending-reservations',
    legacyRestoreImportFingerprint: restore.fingerprint(imported),
    startDate: new Date('2026-10-09T17:00Z'), endDate: new Date('2026-10-09T18:00Z'),
  };
  assert.equal(eligible({ entry }).reason, 'retry_own_restore');
  assert.equal(eligible({ entry: { ...entry, calendarSyncLeaseUntil: new Date('2026-10-06T10:01Z') } }).eligible, false);
  assert.equal(eligible({ entry: { ...entry, status: 'cancelled' } }).eligible, false);
  assert.equal(eligible({ entry: { ...entry, startDate: new Date('2026-10-10T17:00Z') } }).eligible, false);
  assert.equal(eligible({ entry: { ...entry, legacyRestoreImportFingerprint: 'changed' } }).eligible, false);
});

test('legacybotsingen blijven zichtbaar zonder winnaar of andere datum te kiezen', () => {
  const first = eligible();
  const second = { ...first, appointmentId: 'second' };
  const adjacent = { ...first, appointmentId: 'adjacent', startDate: first.endDate,
    endDate: new Date(first.endDate.getTime() + 3_600_000) };
  assert.deepEqual(restore.collisionPairs([first, second, adjacent]), [['appointment', 'second']]);
  assert.equal(first.startDate.toISOString(), '2026-10-09T17:00:00.000Z');
});

test('Google-payload blijft tentative, opaque en pending met dezelfde datum en eigenaar-marker', () => {
  const candidate = eligible();
  const payload = restore.pendingPayload(candidate);
  assert.equal(payload.status, 'tentative');
  assert.equal(payload.transparency, 'opaque');
  assert.equal(payload.extendedProperties.private.appointmentStatus, 'pending');
  assert.equal(payload.extendedProperties.private.calvoraPlanningEntryId, candidate.appointmentId);
  assert.equal(payload.extendedProperties.private.calvoraQuoteId, candidate.quoteId);
  assert.equal(payload.start.dateTime, '2026-10-09T17:00:00.000Z');
  assert.equal(payload.end.dateTime, '2026-10-09T18:00:00.000Z');
  assert.equal(payload.attendees, undefined);
});

test('409-event alleen adopteren met dezelfde markers, status en exacte aangeboden tijd', () => {
  const candidate = eligible();
  const payload = restore.pendingPayload(candidate);
  assert.doesNotThrow(() => restore.assertAdoptable(payload, candidate));
  assert.throws(() => restore.assertAdoptable({ ...payload, status: 'cancelled' }, candidate), /google_deleted/);
  assert.throws(() => restore.assertAdoptable({ ...payload, extendedProperties: {} }, candidate), /marker/);
  assert.throws(() => restore.assertAdoptable({ ...payload, start: { dateTime: '2026-10-10T17:00Z' } }, candidate), /date_changed/);
  assert.throws(() => restore.assertAdoptable({ ...payload, extendedProperties: { private: {
    ...payload.extendedProperties.private, appointmentStatus: 'confirmed',
  } } }, candidate), /status_conflict/);
});

test('dry-run Googlecontrole schrijft niets en blokkeert een verwijderd of onzeker eerder geprobeerd event', async () => {
  const candidate = { ...eligible(), eventId: 'deterministic-event' };
  const reads = [];
  const calendar = error => ({ events: {
    get: async () => { reads.push('get'); throw error; },
    list: async () => { reads.push('list'); return { data: { items: [] } }; },
    insert: () => { throw new Error('Unexpected calendar write'); },
  } });
  const missing = Object.assign(new Error('missing'), { code: 404 });
  assert.equal(await restore.inspectGoogle(calendar(missing), candidate), null);
  assert.deepEqual(reads, ['get', 'list']);
  await assert.rejects(restore.inspectGoogle(calendar(missing), { ...candidate, previousInsertAttempted: true }), /check_manually/);
  await assert.rejects(restore.inspectGoogle(calendar({ code: 410 }), candidate), /google_deleted/);
});

test('fingerprint vergelijkt veldinhoud ongeacht mapvolgorde en verandert wel bij gewijzigde import', () => {
  assert.equal(restore.fingerprint({ a: 1, b: 2 }), restore.fingerprint({ b: 2, a: 1 }));
  assert.notEqual(restore.fingerprint(imported), restore.fingerprint({ ...imported, appointment_time: '20:00' }));
});

test('apply-mock koppelt bestaande legacyplanning zonder range, metadata, klant of offerte te wijzigen', async () => {
  const legacyImport = { ...imported, appointment_date: '2099-10-09', suggested_appointment_date: '2099-10-09' };
  const startDate = restore.originalStart('2099-10-09', '19:00');
  const entry = {
    userId: uid, source: 'telegram_werkspot', quoteId: 'quote', leadKey,
    status: 'pending', appointmentState: 'pending', planningType: 'werkbespreking', suggestedBy: 'telegram_auto_message',
    startDate, endDate: new Date(startDate.getTime() + 3_600_000),
    notes: 'Bestaande omschrijving', cache: { clientName: 'Test Klant', totalQuoteAmount: 900, nested: { preserve: true } },
    createdAt: new Date('2026-10-07T07:00:00Z'),
  };
  const candidate = { ...restore.evaluateEligibility(input({ imported: legacyImport, entry })), eventId: 'deterministic-event' };
  assert.equal(candidate.eligible, true);
  const rows = new Map([
    ['telegram_lead_imports/' + importId, legacyImport], ['planning_entries/appointment', entry],
    ['quotes/quote', quote], ['clients/client', client],
  ]);
  const writes = [];
  const ref = path => ({ path, id: path.split('/').at(-1) });
  const snapshot = target => ({ ref: target, exists: rows.has(target.path), data: () => rows.get(target.path) });
  const firestore = {
    collection: name => ({ doc: id => ref(name + '/' + id), where: () => ({ name }) }),
    async runTransaction(callback) {
      const pending = [];
      const result = await callback({
        getAll: async (...refs) => refs.map(snapshot),
        get: async query => ({ docs: [...rows].filter(([path]) => path.startsWith(query.name + '/'))
          .map(([path]) => ({ ...snapshot(ref(path)), id: path.split('/').at(-1) })) }),
        set: (target, data, options) => pending.push({ path: target.path, data, options }),
      });
      for (const write of pending) {
        writes.push(write);
        rows.set(write.path, write.options?.merge ? { ...rows.get(write.path), ...write.data } : write.data);
      }
      return result;
    },
  };
  let googleEvent;
  let insertCount = 0;
  const calendar = { events: {
    get: async () => { if (!googleEvent) throw { code: 404 }; return { data: googleEvent }; },
    list: async () => ({ data: { items: [] } }),
    insert: async request => { insertCount++; assert.equal(request.sendUpdates, 'none'); googleEvent = request.requestBody; return { data: googleEvent }; },
  } };
  const result = await restore.restoreCandidate({ firestore, calendar, uid, candidate, runtime: {
    assertIdentity, Timestamp: { fromDate: date => date }, FieldValue: { serverTimestamp: () => new Date() },
  } });
  assert.equal(result.restored, true);
  assert.equal(insertCount, 1);
  const saved = rows.get('planning_entries/appointment');
  for (const key of ['startDate', 'endDate', 'notes', 'cache', 'createdAt']) assert.deepEqual(saved[key], entry[key]);
  assert.equal(saved.status, 'pending');
  assert.equal(saved.calendarSyncState, 'synced');
  assert.equal(saved.googleCalendarEventId, 'deterministic-event');
  assert.equal(saved.calendarSyncLeaseToken, null);
  assert.deepEqual(rows.get('quotes/quote'), quote);
  assert.deepEqual(rows.get('clients/client'), client);
  assert.equal(writes.some(write => write.path.startsWith('quotes/') || write.path.startsWith('clients/')), false);
});
