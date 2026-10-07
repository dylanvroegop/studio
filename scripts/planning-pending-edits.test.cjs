const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

class Timestamp {
  constructor(value) { this.value = new Date(value); }
  static fromDate(value) { return new Timestamp(value); }
  toDate() { return this.value; }
  toMillis() { return this.value.getTime(); }
}
const baseEntry = () => ({
  id: 'entry', userId: 'owner', quoteId: 'quote', source: 'telegram_werkspot',
  status: 'pending', calendarSyncState: 'synced', planningType: 'werkbespreking',
  startDate: new Timestamp('2026-10-22T17:00:00Z'), endDate: new Timestamp('2026-10-22T18:00:00Z'),
  googleCalendarEventId: 'event',
  cache: { clientName: 'Test', projectTitle: 'Werkbespreking', projectAddress: 'Teststraat 1' },
});

function scenario({ stored = baseEntry(), retryWith } = {}) {
  let current = stored;
  const writes = [];
  const requests = [];
  const firestore = {};
  const dependencies = {
    react: { useState: value => [value, () => {}], useCallback: callback => callback, useEffect: () => {} },
    'date-fns': { addDays: () => { throw new Error('Unexpected date operation'); } },
    '@/firebase': { useUser: () => ({ user: { uid: 'owner' } }), useFirestore: () => firestore },
    'firebase/auth': { getAuth: () => ({ currentUser: { getIdToken: async () => 'synthetic-token' } }) },
    'firebase/firestore': {
      Timestamp,
      doc: (_, collection, id) => ({ path: `${collection}/${id}` }),
      serverTimestamp: () => 'timestamp',
      runTransaction: async (_, callback) => {
        let pendingWrites = [];
        const transaction = {
          get: async () => ({ exists: () => Boolean(current), id: 'entry', data: () => current }),
          update: (ref, data) => pendingWrites.push({ ref, data }),
        };
        let result = await callback(transaction);
        if (retryWith) {
          current = { ...current, ...retryWith };
          pendingWrites = [];
          result = await callback(transaction);
        }
        for (const write of pendingWrites) {
          writes.push(write);
          current = { ...current, ...write.data };
        }
        return result;
      },
    },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/hooks/usePlanningData.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Date,
    require: name => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    fetch: async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return { ok: true }; },
  });
  const hook = module.exports.usePlanningData();
  return { update: data => hook.updateEntry('entry', data), writes, requests, stored: () => current };
}

test('gewone wijziging houdt een pending Telegram-voorstel pending en gebruikt verse entrygegevens', async () => {
  const s = scenario();
  await s.update({ status: 'scheduled', notes: 'Nieuwe notitie' });
  assert.equal(s.stored().status, 'pending');
  assert.equal(s.stored().notes, 'Nieuwe notitie');
  assert.equal(s.requests.length, 1);
  assert.equal(s.requests[0].body.googleCalendarEventId, 'event');
  assert.equal(s.requests[0].body.startDate, '2026-10-22T17:00:00.000Z');
});

test('verouderde pending UI kan een al bevestigde afspraak niet terugzetten', async () => {
  const s = scenario({ stored: { ...baseEntry(), status: 'scheduled' } });
  await s.update({ status: 'pending', notes: 'Wijziging na bevestiging' });
  assert.equal(s.stored().status, 'scheduled');
  assert.equal(s.requests.length, 1);
});

test('actieve lease en onafgeronde sync stoppen voor lokale write of Google-request', async () => {
  for (const patch of [
    { calendarSyncLeaseToken: 'busy', calendarSyncLeaseUntil: new Timestamp(Date.now() + 60_000) },
    { calendarSyncState: 'pending' }, { calendarSyncState: 'failed' },
  ]) {
    const s = scenario({ stored: { ...baseEntry(), ...patch } });
    await assert.rejects(s.update({ notes: 'Mag niet worden opgeslagen' }), /gesynchroniseerd/);
    assert.equal(s.writes.length, 0);
    assert.equal(s.requests.length, 0);
  }
});

test('nieuwe importer-lease tijdens transactie-retry blokkeert de gewone edit', async () => {
  const s = scenario({ retryWith: {
    calendarSyncLeaseToken: 'new-importer', calendarSyncLeaseUntil: new Timestamp(Date.now() + 60_000),
  } });
  await assert.rejects(s.update({ notes: 'Mag niet worden opgeslagen' }), /gesynchroniseerd/);
  assert.equal(s.writes.length, 0);
  assert.equal(s.requests.length, 0);
});

test('verwijderde Telegram-afspraak en verkeerde eigenaar worden niet gewijzigd', async () => {
  for (const stored of [null, { ...baseEntry(), status: 'cancelled' }, { ...baseEntry(), userId: 'other' }]) {
    const s = scenario({ stored });
    await assert.rejects(s.update({ notes: 'Niet opslaan' }));
    assert.equal(s.writes.length, 0);
    assert.equal(s.requests.length, 0);
  }
});

test('normale statuswijziging voor niet-Telegram planning blijft werken', async () => {
  const s = scenario({ stored: { ...baseEntry(), source: 'calvora' } });
  await s.update({ status: 'scheduled', notes: 'Bevestigd' });
  assert.equal(s.stored().status, 'scheduled');
  assert.equal(s.requests.length, 1);
});
