const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies, context = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, Buffer, console: { warn() {} },
    require: name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name), ...context });
  return module.exports;
}

function setup(overrides = {}) {
  let now = Date.parse('2026-11-24T10:00:00Z');
  const due = now - 60_000;
  const session = { userId: 'owner', id: 'lead', revision: 1, state: 'done',
    client: { client_name: 'Test Klant', appointment_status: 'pending' },
    result: { appointment_id: 'appointment', appointment_status: 'pending', project_id: 'quote', google_calendar_event_id: 'event' },
    reminderDueAt: due, reminderSentAt: null, ...overrides };
  const rows = new Map([
    ['client_intake_sessions/lead', session],
    ['planning_entries/appointment', { userId: 'owner', quoteId: 'quote', status: 'pending', googleCalendarEventId: 'event', calendarSyncState: 'synced' }],
    ['users/owner', { integrations: { googleCalendar: { connected: true, refreshToken: 'synthetic-test' } } }],
  ]);
  const controls = { event: { id: 'event', status: 'tentative' }, failure: null, onGoogle: null,
    delivery: { saved: true, failed: 0, accepted: 1, skipped: 0, expired: 0, devices: 1 } };
  const sent = [], reads = [];
  const snapshot = path => ({ ref: ref(path), id: path.split('/').at(-1), exists: rows.has(path), data: () => rows.has(path) ? structuredClone(rows.get(path)) : undefined });
  const ref = path => ({ path, get: async () => snapshot(path) });
  const query = (collection, filters = []) => ({
    doc: id => ref(collection + '/' + id),
    where: (field, op, value) => query(collection, [...filters, [field, op, value]]),
    get: async () => ({ docs: [...rows].filter(([path, data]) => path.startsWith(collection + '/') && filters.every(([field, op, value]) =>
      op === '==' ? data[field] === value : op === '>' ? data[field] > value : data[field] <= value)).map(([path]) => snapshot(path)) }),
  });
  let tail = Promise.resolve();
  const firestore = {
    collection: query,
    runTransaction: callback => {
      const result = tail.then(() => callback({
        get: async reference => snapshot(reference.path),
        update: (reference, patch) => rows.set(reference.path, { ...rows.get(reference.path), ...structuredClone(patch) }),
      }));
      tail = result.catch(() => undefined);
      return result;
    },
  };
  const exports = load('src/lib/client-intake-reminders.ts', {
    '../firebase/admin': { initFirebaseAdmin: () => ({ firestore }) },
    './integrations/google-calendar': { getCalendarClient: async () => ({ calendar: { events: { get: async args => {
      reads.push(args); await controls.onGoogle?.(); if (controls.failure) throw controls.failure; return { data: controls.event };
    } } } }) },
    './push-inbox': { deliverAppMessage: async (uid, input) => { sent.push({ uid, ...input }); return controls.delivery; } },
    './telegram-appointment-calendar': { telegramCalendarConfirmed: event => event.extendedProperties?.private?.appointmentStatus === 'confirmed' },
  }, { Date: class extends Date { static now() { return now; } } });
  return { ...exports, rows, controls, sent, reads, due, advance: ms => { now += ms; }, session: () => rows.get('client_intake_sessions/lead') };
}

test('concurrent workers claim one pending reminder and use one stable event ID', async () => {
  const app = setup();
  const counts = await Promise.all([app.runClientIntakeReminders(), app.runClientIntakeReminders()]);
  assert.equal(counts.reduce((a, b) => a + b), 1);
  assert.equal(app.sent.length, 1);
  assert.equal(app.sent[0].eventId, `client-intake-reminder:lead:${app.due}`);
  assert.equal(app.sent[0].url, '/aanvragen?id=lead');
  assert.equal(app.session().reminderDueAt, null);
  assert.ok(app.session().reminderSentAt > app.due);
  assert.equal(await app.runClientIntakeReminders(), 0);
});

test('future, unfinished and other-owner sessions do not trigger reminders', async () => {
  for (const override of [{ reminderDueAt: Date.parse('2026-11-25') }, { state: 'processing' }, { state: 'error' }]) {
    const app = setup(override); await app.runClientIntakeReminders(); assert.equal(app.sent.length, 0);
  }
  const app = setup(); await app.runClientIntakeReminders('different-owner'); assert.equal(app.sent.length, 0);
});

test('live cancelled, confirmed, completed, deleted or wrong-owner planning suppresses reminder', async () => {
  for (const patch of [{ status: 'scheduled' }, { status: 'confirmed' }, { status: 'cancelled' }, { status: 'completed' }, { userId: 'other' }, null]) {
    const app = setup();
    if (patch) Object.assign(app.rows.get('planning_entries/appointment'), patch); else app.rows.delete('planning_entries/appointment');
    assert.equal(await app.runClientIntakeReminders(), 0);
    assert.equal(app.sent.length, 0); assert.equal(app.session().reminderDueAt, null);
  }
});

test('Google cancellation, confirmation, deletion and changed event ownership suppress reminder', async () => {
  for (const change of [{ event: { status: 'cancelled' } }, { event: { status: 'confirmed' } },
    { event: { status: 'tentative', extendedProperties: { private: { appointmentStatus: 'confirmed' } } } },
    { event: { status: 'tentative', extendedProperties: { private: { calvoraPlanningEntryId: 'other' } } } },
    { failure: { code: 404 } }, { failure: { response: { status: 410 } } }]) {
    const app = setup(); Object.assign(app.controls, change); await app.runClientIntakeReminders();
    assert.equal(app.sent.length, 0); assert.equal(app.session().reminderDueAt, null);
  }
});

test('calendar read errors retain due date and wait before retrying', async () => {
  const app = setup(); app.controls.failure = { response: { status: 503 } };
  await app.runClientIntakeReminders();
  assert.equal(app.sent.length, 0); assert.equal(app.session().reminderDueAt, app.due);
  assert.equal(app.session().reminderSentAt, null); assert.equal(app.session().reminderLeaseToken, null);
  app.controls.failure = null;
  assert.equal(await app.runClientIntakeReminders(), 0);
  app.advance(5 * 60_000); assert.equal(await app.runClientIntakeReminders(), 1);
});

test('failed delivery retries with same event ID and only successful completion marks sent', async () => {
  const app = setup(); app.controls.delivery = { saved: true, failed: 1, accepted: 0, skipped: 0, devices: 1 };
  await app.runClientIntakeReminders(); assert.equal(app.session().reminderSentAt, null);
  app.advance(5 * 60_000); app.controls.delivery = { saved: true, failed: 0, accepted: 0, skipped: 1, devices: 1 };
  assert.equal(await app.runClientIntakeReminders(), 1);
  assert.equal(app.sent[0].eventId, app.sent[1].eventId);
});

test('saved inbox notification completes when no device has a push subscription', async () => {
  const app = setup(); app.controls.delivery = { saved: true, failed: 0, accepted: 0, skipped: 0, devices: 0 };
  assert.equal(await app.runClientIntakeReminders(), 1);
});

test('concurrent user edit preserves new reminder and never sends outdated content', async () => {
  const app = setup(); app.controls.onGoogle = () => Object.assign(app.session(), { revision: 2, reminderDueAt: app.due + 1000 });
  assert.equal(await app.runClientIntakeReminders(), 0);
  assert.equal(app.sent.length, 0); assert.equal(app.session().reminderDueAt, app.due + 1000);
  assert.equal(app.session().reminderLeaseToken, null);
});

test('planning change during external read stops delivery', async () => {
  const app = setup(); app.controls.onGoogle = () => Object.assign(app.rows.get('planning_entries/appointment'), { status: 'scheduled' });
  assert.equal(await app.runClientIntakeReminders(), 0); assert.equal(app.sent.length, 0);
});

test('expired lease can be reclaimed after worker crash', async () => {
  const app = setup({ reminderLeaseToken: 'dead-worker', reminderLeaseUntil: Date.parse('2026-11-24T09:59:00Z') });
  assert.equal(await app.runClientIntakeReminders(), 1);
});

test('reminder route requires cron secret and owner-scopes Firebase requests', async () => {
  const calls = [], heartbeats = [];
  const route = load('src/app/api/client-intake/reminders/route.ts', {
    '@/firebase/admin': { initFirebaseAdmin: () => ({ firestore: { collection: () => ({ doc: () => ({ set: async value => heartbeats.push(value) }) }) }, auth: { verifyIdToken: async token => {
      if (token !== 'owner-token') throw new Error('invalid'); return { uid: 'owner' };
    } } }) },
    '@/lib/client-intake-reminders': { runClientIntakeReminders: async uid => { calls.push(uid); return 1; } },
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  }, { process: { env: { CRON_SECRET: 'cron-test' } } });
  const request = token => ({ headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}) });
  assert.equal((await route.GET(request())).status, 401);
  assert.equal((await route.GET(request('wrong'))).status, 401);
  assert.equal((await route.GET(request('cron-test'))).status, 200);
  assert.equal((await route.POST(request('cron-test'))).status, 401);
  assert.equal((await route.POST(request('owner-token'))).status, 200);
  assert.deepEqual(calls, [undefined, 'owner']);
  assert.equal(heartbeats.length, 2); assert.equal(heartbeats.at(-1).source, 'cron');
});
