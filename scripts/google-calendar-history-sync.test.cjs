const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const NOW = '2026-10-06T10:00:00.000Z';
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return new Date(NOW).getTime(); }
  static [Symbol.hasInstance](value) { return value instanceof Date; }
}
const timestamp = value => ({ toDate: () => new Date(value) });

test('uren opnieuw exporteren bewaart geïmporteerde historie en ruimt alleen echte oude planning op', async () => {
  const deletedEvents = [];
  const updatedEvents = [];
  const planningWrites = [];
  const googleHistory = ['client-hours', 'daily-total'];
  const planning = [...googleHistory, 'old-planning'].map(id => ({
    id,
    data: () => ({
      userId: 'owner', googleCalendarEventId: id, planningType: 'job',
      isGoogleCalendarHistory: googleHistory.includes(id),
      status: googleHistory.includes(id) ? 'completed' : 'scheduled',
      startDate: timestamp('2026-10-05T06:00:00Z'), endDate: timestamp('2026-10-05T15:00:00Z'),
    }),
    ref: { set: async data => planningWrites.push({ id, data }) },
  }));
  const firestore = {
    collection: name => ({
      doc: id => ({
        get: async () => ({
          id, exists: true,
          data: () => name === 'users'
            ? { integrations: { googleCalendar: { connected: true, refreshToken: 'test-token' } } }
            : { userId: 'owner', klantinformatie: { voornaam: 'Test' } },
        }),
        set: async () => {},
      }),
      where: () => ({ get: async () => ({ docs: planning }) }),
    }),
  };
  const query = {
    select() { return this; }, eq() { return this; }, lt() { return this; }, not() { return this; }, order() { return this; },
    limit: async () => ({ data: [{ work_date: '2026-10-05', quote_id: 'quote', exact_minutes: 480, onsite_minutes: 480 }] }),
  };
  const dependencies = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/firebase/admin': { initFirebaseAdmin: () => ({ firestore, auth: { verifyIdToken: async () => ({ uid: 'owner' }) } }) },
    '@/lib/supabase-admin': { supabaseAdmin: { from: () => query } },
    '@/lib/planning-colors': { GOOGLE_CALENDAR_BLUE_COLOR_ID: '9', GOOGLE_CALENDAR_GREEN_COLOR_ID: '10', GOOGLE_CALENDAR_YELLOW_COLOR_ID: '5' },
    '@/lib/integrations/google-calendar': {
      isGoogleInvalidGrantError: () => false,
      getCalendarClient: async () => ({ credentials: {}, calendar: { events: {
        list: async () => ({ data: { items: googleHistory.map((id, index) => ({
          id, extendedProperties: { private: {
            calvoraType: 'worked-hours', calvoraDate: '2026-10-05', calvoraQuoteId: index ? '__daily-total__' : 'quote',
          } },
        })) } }),
        update: async value => updatedEvents.push(value),
        insert: async () => { throw new Error('Bestaande uren-events mogen niet worden gedupliceerd.'); },
        delete: async value => deletedEvents.push(value.eventId),
      } } }),
    },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/app/api/google-calendar/sync-worked-hours/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Date: FixedDate, Intl,
    require: name => { assert.ok(name in dependencies, name); return dependencies[name]; },
    console,
  });
  const response = await module.exports.POST({ headers: new Headers({ authorization: 'Bearer test-token' }) });
  assert.equal(response.status, 200);
  assert.equal(response.body.updated, 2);
  assert.equal(response.body.removedPlanning, 1);
  assert.deepEqual(updatedEvents.map(event => event.eventId), googleHistory);
  assert.deepEqual(deletedEvents, ['old-planning']);
  assert.deepEqual(planningWrites.map(write => write.id), ['old-planning']);
});
