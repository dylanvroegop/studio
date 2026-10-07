const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const NOW = '2026-10-06T10:00:00.000Z';
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return new Date(NOW).getTime(); }
  static [Symbol.hasInstance](value) { return value instanceof Date; }
}
class Timestamp {
  constructor(date) { this.date = new Date(date); }
  static fromDate(date) { return new Timestamp(date); }
  toDate() { return new Date(this.date); }
}
function loadTs(file, overrides = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, Buffer, Intl, Date: FixedDate,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : require(name),
    console: { error() {}, info() {} },
  }, { filename: file });
  return module.exports;
}
const reservations = loadTs('src/lib/google-calendar-reservations.ts');
const timestamp = value => Timestamp.fromDate(new Date(value));
const start = '2026-10-09T17:00:00.000Z';
const end = '2026-10-09T18:00:00.000Z';
const requestRange = { startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-10-31T23:59:59.000Z' };
const reservation = extra => ({
  userId: 'owner', source: 'telegram_werkspot', leadKey: 'telegram_session_test',
  status: 'pending', appointmentState: 'pending', calendarSyncState: 'synced',
  quoteId: 'quote', googleCalendarEventId: 'event', planningType: 'werkbespreking',
  startDate: timestamp(start), endDate: timestamp(end),
  updatedAt: timestamp('2026-10-05T10:00:00Z'),
  cache: { clientName: 'Test Klant', projectTitle: 'Werkbespreking', proposedOptions: [{ date: '2026-10-09', time: '19:00' }] },
  suggested_appointment_options: [{ date: '2026-10-09', time: '19:00' }],
  ...extra,
});
const event = extra => ({
  id: 'event', summary: 'PENDING — Test Klant', status: 'confirmed',
  start: { dateTime: start }, end: { dateTime: end },
  extendedProperties: { private: { appointmentStatus: 'pending', calvoraPlanningEntryId: 'reservation' } },
  ...extra,
});
const apiError = status => Object.assign(new Error('Synthetic calendar failure'), { response: { status } });

// Firestore merge:true merges nested maps, preserving cached proposal metadata.
function mergeData(current, incoming) {
  const result = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    const isMap = value && typeof value === 'object' && !Array.isArray(value)
      && !(value instanceof Date) && !(value instanceof Timestamp);
    result[key] = isMap ? mergeData(current?.[key] || {}, value) : value;
  }
  return result;
}
function makeRoute({ entries = { reservation: reservation() }, events = [], getResults = {}, beforeTransaction } = {}) {
  const trace = [];
  const alerts = [];
  const rows = new Map([
    ['users/owner', { integrations: { googleCalendar: { connected: true, refreshToken: 'synthetic-refresh-token' } } }],
    ...Object.entries(entries).map(([id, value]) => ['planning_entries/' + id, value]),
  ]);
  const snap = ref => {
    const data = rows.get(ref.path);
    return { ref, id: ref.id, exists: data !== undefined, data: () => data };
  };
  function mutate(operation) {
    trace.push(operation);
    if (operation.type === 'delete') rows.delete(operation.path);
    else rows.set(operation.path, operation.options?.merge
      ? mergeData(rows.get(operation.path) || {}, operation.data) : operation.data);
  }
  function ref(path) {
    return { path, id: path.split('/').at(-1), get: async () => snap(ref(path)),
      set: async (data, options) => mutate({ type: 'set', path, data, options }),
    };
  }
  const firestore = {
    collection: name => ({
      doc: id => ref(name + '/' + id),
      where: (field, operation, value) => ({ get: async () => {
        assert.equal(operation, '==');
        const docs = [...rows].filter(([path, data]) => path.startsWith(name + '/') && data[field] === value)
          .map(([path]) => snap(ref(path)));
        return { docs, size: docs.length };
      } }),
    }),
    batch() {
      const pending = [];
      return {
        set: (target, data, options) => pending.push({ type: 'set', path: target.path, data, options }),
        delete: target => pending.push({ type: 'delete', path: target.path }),
        commit: async () => pending.forEach(mutate),
      };
    },
    async runTransaction(callback) {
      if (beforeTransaction) beforeTransaction(rows);
      const pending = [];
      const result = await callback({
        getAll: async (...refs) => refs.map(snap),
        set: (target, data, options) => pending.push({ type: 'set', path: target.path, data, options }),
      });
      pending.forEach(mutate);
      return result;
    },
  };
  const calendar = { events: {
    list: async options => { trace.push({ type: 'list', options }); return { data: { items: events } }; },
    get: async options => {
      trace.push({ type: 'get', eventId: options.eventId });
      assert.equal(options.calendarId, 'primary');
      const result = getResults[options.eventId];
      if (result instanceof Error) throw result;
      assert.ok(result, 'events.get requires an explicit test result for ' + options.eventId);
      return { data: result };
    },
  } };
  const route = loadTs('src/app/api/google-calendar/refresh/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    'firebase-admin/firestore': { Timestamp, FieldValue: { serverTimestamp: () => timestamp(NOW) } },
    '@/firebase/admin': { initFirebaseAdmin: () => ({ firestore, auth: { verifyIdToken: async () => ({ uid: 'owner' }) } }) },
    '@/lib/google-calendar-alerts': { reportGoogleCalendarAlert: async alert => alerts.push(alert) },
    '@/lib/integrations/google-calendar': {
      getCalendarClient: async () => ({ calendar, credentials: {} }), isGoogleInvalidGrantError: () => false,
    },
    '@/lib/planning-colors': { GOOGLE_CALENDAR_RED_COLOR_ID: '11' },
    '@/lib/google-calendar-reservations': reservations,
  });
  return {
    rows, trace, alerts,
    mutations: () => trace.filter(item => ['set', 'delete'].includes(item.type)
      && (item.path.startsWith('planning_entries/') || item.path.startsWith('telegram_appointment_locks/'))),
    post: () => route.POST({ headers: new Headers({ authorization: 'Bearer synthetic-id-token' }), json: async () => requestRange }),
  };
}

test('statusmarkering confirmed bevestigt ook een oude pending titel en tekst', () => {
  assert.equal(reservations.googleAppointmentStatus(event({
    description: 'Status: pending', extendedProperties: { private: { appointmentStatus: 'confirmed' } },
  }), 'pending'), 'scheduled');
  assert.equal(reservations.googleAppointmentStatus({ summary: 'Andere titel' }, 'pending'), 'pending');
  assert.equal(reservations.googleAppointmentStatus({ description: 'Status: confirmed' }, 'pending'), 'scheduled');
  assert.equal(reservations.googleAppointmentStatus({}), 'scheduled');
});
test('alleen 404 en 410 bewijzen een verwijderd Google-event', () => {
  assert.equal(reservations.googleEventIsMissing(apiError(404)), true);
  assert.equal(reservations.googleEventIsMissing({ code: 410 }), true);
  for (const status of [401, 403, 429, 500]) assert.equal(reservations.googleEventIsMissing(apiError(status)), false);
  assert.equal(reservations.googleEventIsMissing(null), false);
});
test('herkent Telegrambron of sessiesleutel zonder gewone planning te beschermen', () => {
  assert.equal(reservations.isTelegramReservation({ source: 'telegram_werkspot' }), true);
  assert.equal(reservations.isTelegramReservation({ leadKey: 'telegram_session_42' }), true);
  assert.equal(reservations.isTelegramReservation({ source: 'calvora' }), false);
  assert.equal(reservations.reservationDate(new Date('invalid')), null);
  assert.equal(reservations.reservationDate(timestamp(NOW)).toISOString(), NOW);
});

test('nog niet gesynchroniseerde Telegramreservering blijft bestaan na lege refresh', async () => {
  const original = reservation({ googleCalendarEventId: null, calendarSyncState: 'pending' });
  const route = makeRoute({ entries: { reservation: original } });
  const result = await route.post();
  assert.equal(result.status, 200);
  assert.equal(result.body.removed, 0);
  assert.deepEqual(route.rows.get('planning_entries/reservation'), original);
  assert.equal(route.mutations().length, 0);
  assert.equal(route.trace.filter(item => item.type === 'get').length, 0);
});

test('buiten het datumbereik verplaatst event wordt expliciet opgehaald en behoudt de reservering', async () => {
  const route = makeRoute({ getResults: { event: event({
    start: { dateTime: '2026-11-16T18:00:00Z' }, end: { dateTime: '2026-11-16T19:00:00Z' },
  }) } });
  const result = await route.post();
  assert.equal(result.status, 200);
  assert.deepEqual(route.trace.filter(item => item.type === 'get').map(item => item.eventId), ['event']);
  const saved = route.rows.get('planning_entries/reservation');
  assert.equal(saved.startDate.toDate().toISOString(), '2026-11-16T18:00:00.000Z');
  assert.equal(saved.status, 'pending');
  assert.equal(saved.googleCalendarEventId, 'event');
  assert.equal(result.body.removed, 0);
  assert.equal(route.trace.filter(item => item.type === 'delete').length, 0);
});

for (const [label, response] of [['404', apiError(404)], ['410', apiError(410)], ['cancelled', { id: 'event', status: 'cancelled' }]]) {
  test('expliciete Google-verwijdering ' + label + ' bewaart een tombstone en verwijdert nooit de reservering', async () => {
    const route = makeRoute({ getResults: { event: response } });
    const result = await route.post();
    assert.equal(result.status, 200);
    const lookupIndex = route.trace.findIndex(item => item.type === 'get');
    const mutationIndex = route.trace.findIndex(item => item.type === 'set' && item.path === 'planning_entries/reservation');
    assert.ok(lookupIndex >= 0 && mutationIndex > lookupIndex);
    const saved = route.rows.get('planning_entries/reservation');
    assert.equal(saved.status, 'cancelled');
    assert.equal(saved.appointmentState, 'cancelled');
    assert.equal(saved.calendarSyncState, 'cancelled');
    assert.equal(saved.cancelledInGoogle, true);
    assert.equal(saved.leadKey, 'telegram_session_test');
    assert.equal(saved.googleCalendarEventId, 'event');
    assert.equal(route.trace.filter(item => item.type === 'delete').length, 0);
    assert.equal(route.rows.get('telegram_appointment_locks/owner').version, 1);
  });
}

test('Google 403 stopt refresh zonder planning- of reserveringsmutaties', async () => {
  const original = reservation();
  const route = makeRoute({
    entries: { reservation: original }, getResults: { event: apiError(403) },
    events: [event({ id: 'unrelated', summary: 'Andere afspraak', extendedProperties: {} })],
  });
  const result = await route.post();
  assert.equal(result.status, 500);
  assert.equal(route.mutations().length, 0);
  assert.deepEqual(route.rows.get('planning_entries/reservation'), original);
  assert.equal(route.alerts[0].code, 'google_calendar_refresh_failed');
});

test('bevestigde private markering wint van pending en merge behoudt leadKey en voorstelopties', async () => {
  const original = reservation();
  const route = makeRoute({ entries: { reservation: original }, events: [event({
    extendedProperties: { private: { appointmentStatus: 'confirmed', calvoraPlanningEntryId: 'reservation' } },
  })] });
  const result = await route.post();
  assert.equal(result.status, 200);
  const saved = route.rows.get('planning_entries/reservation');
  assert.equal(saved.status, 'scheduled');
  assert.equal(saved.appointmentState, 'scheduled');
  assert.equal(saved.calendarSyncState, 'synced');
  assert.equal(saved.leadKey, original.leadKey);
  assert.equal(saved.cache.clientName, 'Test Klant');
  assert.deepEqual(saved.cache.proposedOptions, original.cache.proposedOptions);
  assert.deepEqual(saved.suggested_appointment_options, original.suggested_appointment_options);
  assert.ok(route.mutations().every(item => item.options?.merge === true));
});

for (const [label, extra] of [
  ['pending met verlopen lease', { calendarSyncState: 'pending', calendarSyncLeaseUntil: timestamp('2026-10-05T10:00:00Z') }],
  ['mislukte synchronisatie', { calendarSyncState: 'failed' }],
  ['actieve lease', { calendarSyncLeaseUntil: timestamp('2026-10-06T10:05:00Z') }],
  ['gewijzigd nadat refresh begon', { updatedAt: timestamp('2026-10-06T10:00:01Z') }],
]) {
  test('beschermt ' + label + ' zowel bij zichtbare als ontbrekende Google-events', async () => {
    assert.equal(reservations.reservationRefreshIsProtected(reservation(extra), new Date(NOW)), true);
    for (const events of [[], [event()]]) {
      const original = reservation(extra);
      const route = makeRoute({ entries: { reservation: original }, events });
      const result = await route.post();
      assert.equal(result.status, 200);
      assert.equal(route.mutations().length, 0);
      assert.equal(route.trace.filter(item => item.type === 'get').length, 0);
      assert.deepEqual(route.rows.get('planning_entries/reservation'), original);
    }
  });
}

test('transactie leest opnieuw en overschrijft geen reservering die tijdens refresh gewijzigd is', async () => {
  const changed = reservation({ calendarSyncState: 'pending', updatedAt: timestamp('2026-10-06T10:00:01Z') });
  const route = makeRoute({ events: [event()], beforeTransaction: rows => rows.set('planning_entries/reservation', changed) });
  const result = await route.post();
  assert.equal(result.status, 200);
  assert.equal(route.mutations().length, 0);
  assert.deepEqual(route.rows.get('planning_entries/reservation'), changed);
});

test('Google-verwijdering annuleert geen inmiddels opnieuw ingeplande reservering', async () => {
  const changed = reservation({
    calendarSyncState: 'pending', updatedAt: timestamp('2026-10-06T10:00:01Z'),
    startDate: timestamp('2026-10-12T17:00:00Z'), endDate: timestamp('2026-10-12T18:00:00Z'),
  });
  const route = makeRoute({
    getResults: { event: apiError(404) }, beforeTransaction: rows => rows.set('planning_entries/reservation', changed),
  });
  const result = await route.post();
  assert.equal(result.status, 200);
  assert.equal(route.mutations().length, 0);
  assert.deepEqual(route.rows.get('planning_entries/reservation'), changed);
});

test('private planning-id herstelt een ontbrekende eventkoppeling zonder een tweede reservering', async () => {
  const route = makeRoute({ entries: { reservation: reservation({ googleCalendarEventId: null }) }, events: [event()] });
  const result = await route.post();
  assert.equal(result.status, 200);
  assert.equal(route.rows.get('planning_entries/reservation').googleCalendarEventId, 'event');
  assert.equal([...route.rows.keys()].filter(path => path.startsWith('planning_entries/')).length, 1);
  assert.equal(route.trace.filter(item => item.type === 'delete').length, 0);
});

for (const [label, linked, marked] of [
  ['met private marker en bestaande koppeling', true, true],
  ['met private marker zonder opgeslagen koppeling', false, true],
  ['zonder private marker met bestaande koppeling', true, false],
]) {
  test('oudere Google-kopie verdwijnt; canonieke Telegramreservering blijft behouden ' + label, async () => {
    const mirror = {
      userId: 'owner', source: 'google', status: 'pending', googleCalendarEventId: 'event',
      startDate: timestamp(start), endDate: timestamp(end), cache: { clientName: 'PENDING · Test Klant' },
    };
    const original = reservation({ googleCalendarEventId: linked ? 'event' : null });
    const moved = event({
      start: { dateTime: '2026-10-12T17:00:00Z' }, end: { dateTime: '2026-10-12T18:00:00Z' },
      extendedProperties: { private: { appointmentStatus: 'pending', ...(marked ? { calvoraPlanningEntryId: 'reservation' } : {}) } },
    });
    // Spiegel eerst: de oude implementatie koos hierdoor ten onrechte de kopie.
    const route = makeRoute({ entries: { google_mirror: mirror, reservation: original }, events: [moved] });
    const result = await route.post();
    assert.equal(result.status, 200);
    assert.equal(result.body.removed, 1);
    assert.equal(route.rows.has('planning_entries/google_mirror'), false);
    const saved = route.rows.get('planning_entries/reservation');
    assert.equal(saved.startDate.toDate().toISOString(), '2026-10-12T17:00:00.000Z');
    assert.equal(saved.status, 'pending');
    assert.equal(saved.source, 'telegram_werkspot');
    assert.equal(saved.googleCalendarEventId, 'event');
    assert.equal(saved.quoteId, original.quoteId);
    assert.equal(saved.leadKey, original.leadKey);
    assert.deepEqual(saved.cache.proposedOptions, original.cache.proposedOptions);
    assert.deepEqual(route.trace.filter(item => item.type === 'delete').map(item => item.path), ['planning_entries/google_mirror']);
  });
}
