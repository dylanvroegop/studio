const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const baseEntry = {
  userId: 'owner', quoteId: 'quote', planningType: 'werkbespreking', status: 'pending',
  source: 'telegram_werkspot', leadKey: 'telegram_session_42',
  googleCalendarEventId: 'event', calendarSyncState: 'synced',
};
const baseEvent = {
  id: 'event', etag: '"event-revision"', status: 'tentative', summary: 'PENDING · Test 19:00',
  description: 'Status: pending\nKlant: Test Klant\nTelegram-sessie: 42\nTelefoon: 0612345678\nWerk: Wand plaatsen',
  extendedProperties: { private: {
    calvoraPlanningEntryId: 'entry', calvoraQuoteId: 'quote', calvoraType: 'telegram-appointment',
    appointmentStatus: 'pending', telegramSessionId: '42', retainedMarker: 'keep',
  } },
};

function scenario({ entry = baseEntry, event = baseEvent, getError, patchError, beforeTransaction, beforePatch } = {}) {
  const calls = { calendar: [], writes: [], alerts: [] };
  const rows = new Map([
    ['planning_entries/entry', entry && { ...entry }],
    ['users/owner', { integrations: { googleCalendar: { connected: true, refreshToken: 'test-token' } } }],
  ]);
  function ref(path) {
    return {
      path, id: path.split('/').at(-1),
      get: async () => snapshot(path),
      set: async (data, options) => write(path, data, options),
      update: async data => write(path, data, { merge: true }),
    };
  }
  function snapshot(path) { return { exists: Boolean(rows.get(path)), data: () => rows.get(path), ref: ref(path) }; }
  function write(path, data, options) {
    calls.writes.push({ path, data, options });
    rows.set(path, options?.merge ? { ...rows.get(path), ...data } : data);
  }
  let firstTransaction = true;
  const firestore = {
    collection: name => ({ doc: id => ref(`${name}/${id}`) }),
    runTransaction: async fn => {
      if (firstTransaction && beforeTransaction) beforeTransaction(rows);
      firstTransaction = false;
      return fn({
        getAll: async (...refs) => refs.map(item => snapshot(item.path)),
        set: (item, data, options) => write(item.path, data, options),
      });
    },
  };
  const events = {
    get: async options => {
      calls.calendar.push({ action: 'get', options });
      if (getError) throw getError;
      return { data: event };
    },
    patch: async (options, requestOptions) => {
      calls.calendar.push({ action: 'patch', options, requestOptions });
      if (beforePatch) beforePatch(rows);
      if (patchError) throw patchError;
      return { data: { id: 'event' } };
    },
    insert: async options => {
      calls.calendar.push({ action: 'insert', options });
      return { data: { id: 'new-event' } };
    },
    update: async () => { throw new Error('Full event replacement is not allowed'); },
  };
  const dependencies = {
    'crypto': require('node:crypto'),
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/firebase/admin': { initFirebaseAdmin: () => ({ firestore, auth: { verifyIdToken: async () => ({ uid: 'owner' }) } }) },
    '@/lib/google-calendar-alerts': { reportGoogleCalendarAlert: async alert => calls.alerts.push(alert) },
    '@/lib/integrations/google-calendar': {
      getCalendarClient: async () => ({ calendar: { events }, credentials: {} }),
      isGoogleInvalidGrantError: () => false,
    },
    '@/lib/planning-colors': { GOOGLE_CALENDAR_RED_COLOR_ID: '11', GOOGLE_CALENDAR_BLUE_COLOR_ID: '9' },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/app/api/google-calendar/sync-entry/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Date, Intl,
    require: name => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    console: { error() {} },
  });
  const post = (body = {}) => module.exports.POST({
    headers: new Headers({ authorization: 'Bearer synthetic-token' }),
    json: async () => ({
      action: 'upsert', entryId: 'entry', googleCalendarEventId: entry?.googleCalendarEventId,
      quoteId: 'quote', planningType: 'werkbespreking',
      startDate: '2026-10-22T17:00:00Z', endDate: '2026-10-22T18:00:00Z',
      cache: { clientName: 'Test Klant', projectAddress: 'Teststraat 1' }, ...body,
    }),
  });
  return { post, calls, rows };
}

test('pending blijft pending; client kan status of identiteitmarkers niet overschrijven', async () => {
  const s = scenario();
  const response = await s.post({ status: 'scheduled', planningType: 'job', quoteId: 'spoofed' });
  assert.equal(response.status, 200);
  const payload = s.calls.calendar.find(call => call.action === 'patch').options.requestBody;
  assert.match(payload.summary, /^PENDING · Test 19$/);
  assert.equal(payload.status, 'tentative');
  assert.equal(payload.transparency, 'opaque');
  assert.match(payload.description, /Status: pending/);
  assert.match(payload.description, /Telegram-sessie: 42/);
  assert.match(payload.description, /Telefoon: 0612345678/);
  assert.match(payload.description, /Werk: Wand plaatsen/);
  assert.equal(payload.extendedProperties.private.calvoraType, 'telegram-appointment');
  assert.equal(payload.extendedProperties.private.calvoraQuoteId, 'quote');
  assert.equal(payload.extendedProperties.private.retainedMarker, 'keep');
  assert.equal(payload.extendedProperties.private.appointmentStatus, 'pending');
  assert.equal(s.calls.calendar.find(call => call.action === 'patch').requestOptions.headers['If-Match'], baseEvent.etag);
  assert.equal(s.rows.get('planning_entries/entry').calendarSyncState, 'synced');
  assert.equal(s.rows.get('planning_entries/entry').calendarSyncLeaseToken, null);
});

test('bevestigde opgeslagen afspraak verwijdert pending-label en behoudt dezelfde Google-id', async () => {
  const s = scenario({ entry: { ...baseEntry, status: 'scheduled' } });
  assert.equal((await s.post({ status: 'pending' })).status, 200);
  const patch = s.calls.calendar.find(call => call.action === 'patch');
  assert.equal(patch.options.eventId, 'event');
  assert.doesNotMatch(patch.options.requestBody.summary, /PENDING/);
  assert.match(patch.options.requestBody.description, /Status: confirmed/);
  assert.equal(patch.options.requestBody.extendedProperties.private.appointmentStatus, 'confirmed');
  assert.equal(s.calls.calendar.filter(call => call.action === 'insert').length, 0);
});

test('vreemde, ontbrekende en gespoofte Google-koppelingen stoppen voor Google of writes', async () => {
  for (const { entry, body, status } of [
    { entry: { ...baseEntry, userId: 'other' }, status: 401 },
    { entry: null, status: 404 },
    { entry: baseEntry, body: { googleCalendarEventId: 'another-event' }, status: 409 },
  ]) {
    const s = scenario({ entry });
    assert.equal((await s.post(body)).status, status);
    assert.equal(s.calls.calendar.length, 0);
    assert.equal(s.calls.writes.length, 0);
  }
});

test('actieve of onafgeronde importer-sync wordt niet door een app-edit overschreven', async () => {
  for (const patch of [
    { calendarSyncLeaseToken: 'busy', calendarSyncLeaseUntil: new Date(Date.now() + 60_000) },
    { calendarSyncState: 'pending' }, { calendarSyncState: 'failed' },
    { googleCalendarEventId: null },
  ]) {
    const s = scenario({ entry: { ...baseEntry, ...patch } });
    const result = await s.post();
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'calendar_sync_pending');
    assert.equal(s.calls.calendar.length, 0);
  }
});

test('gelijktijdige importer-lease wordt opnieuw gecontroleerd onder de gedeelde lock', async () => {
  const s = scenario({ beforeTransaction: rows => rows.set('planning_entries/entry', {
    ...baseEntry, calendarSyncLeaseToken: 'importer', calendarSyncLeaseUntil: new Date(Date.now() + 60_000),
  }) });
  assert.equal((await s.post()).status, 409);
  assert.equal(s.calls.calendar.filter(call => call.action === 'patch').length, 0);
  assert.equal(s.rows.get('planning_entries/entry').calendarSyncLeaseToken, 'importer');
});

test('handmatig verwijderde Google-afspraak wordt nooit opnieuw aangemaakt', async () => {
  for (const options of [
    { getError: { code: 404 } }, { getError: { response: { status: 410 } } },
    { event: { ...baseEvent, status: 'cancelled' } }, { patchError: { code: 404 } },
  ]) {
    const s = scenario(options);
    const result = await s.post();
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'calendar_event_deleted');
    assert.equal(s.calls.calendar.filter(call => call.action === 'insert').length, 0);
  }
});

test('verwijdering tussen Google GET en PATCH geeft gereserveerd blok vrij als cancelled tombstone', async () => {
  for (const code of [404, 410]) {
    const s = scenario({ patchError: { code } });
    const result = await s.post();
    assert.equal(result.status, 409);
    const stored = s.rows.get('planning_entries/entry');
    assert.equal(stored.status, 'cancelled');
    assert.equal(stored.appointmentState, 'cancelled');
    assert.equal(stored.calendarSyncState, 'cancelled');
    assert.equal(stored.cancelledInGoogle, true);
    assert.equal(stored.calendarSyncLeaseToken, null);
    assert.equal(stored.googleCalendarEventId, 'event');
    assert.equal(s.calls.calendar.filter(call => call.action === 'insert').length, 0);
  }
});

test('verouderde mislukte PATCH overschrijft geen nieuwere lease of revisie', async () => {
  const s = scenario({
    patchError: { code: 404 },
    beforePatch: rows => rows.set('planning_entries/entry', {
      ...baseEntry, status: 'scheduled', calendarSyncState: 'synced',
      calendarSyncLeaseToken: 'new-owner', calendarSyncRevision: 'new-revision',
    }),
  });
  assert.equal((await s.post()).status, 409);
  const stored = s.rows.get('planning_entries/entry');
  assert.equal(stored.status, 'scheduled');
  assert.equal(stored.calendarSyncState, 'synced');
  assert.equal(stored.calendarSyncLeaseToken, 'new-owner');
});

test('Google 412 vraagt om verversen en houdt de reservering vast zonder onveilige retry', async () => {
  const s = scenario({ patchError: { response: { status: 412 } } });
  const result = await s.post();
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'calendar_event_changed');
  assert.match(result.body.error, /Ververs/);
  assert.equal(s.rows.get('planning_entries/entry').status, 'pending');
  assert.equal(s.rows.get('planning_entries/entry').calendarSyncState, 'failed');
  assert.equal(s.calls.calendar.filter(call => call.action === 'patch').length, 1);
  assert.equal(s.calls.calendar.filter(call => call.action === 'insert').length, 0);
});

test('Google-event met andere planningmarker wordt niet gewijzigd', async () => {
  const s = scenario({ event: { ...baseEvent, extendedProperties: { private: { calvoraPlanningEntryId: 'other' } } } });
  assert.equal((await s.post()).status, 409);
  assert.equal(s.calls.calendar.filter(call => call.action === 'patch').length, 0);
});

test('gewone nieuwe klus houdt bestaande titel en kleur', async () => {
  const s = scenario({ entry: { userId: 'owner', quoteId: 'quote', planningType: 'job', status: 'scheduled', source: 'calvora' } });
  assert.equal((await s.post({ planningType: 'job' })).status, 200);
  const payload = s.calls.calendar.find(call => call.action === 'insert').options.requestBody;
  assert.equal(payload.summary, 'Test 19');
  assert.equal(payload.colorId, '9');
  assert.equal(payload.status, undefined);
  assert.doesNotMatch(payload.description, /Status:/);
});

test('Calvora verwijderen blijft uitsluitend ontkoppelen', async () => {
  const s = scenario();
  assert.equal((await s.post({ action: 'delete' })).status, 200);
  assert.equal(s.calls.calendar.length, 0);
  assert.equal(s.rows.get('planning_entries/entry').googleCalendarEventId, null);
});
