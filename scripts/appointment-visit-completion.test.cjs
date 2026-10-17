const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { makeRoute, client, cached, pending, entry, suggestions } = require('./telegram-appointment-test-harness.cjs');
const now = '2026-10-06T10:00:00Z';
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return Date.parse(now); } }
function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => mocks[name] || require(name), Date: FixedDate, Intl, URLSearchParams, AbortSignal, ...globals });
  return module.exports;
}
const gps = load('src/lib/quote-visit-gps.ts');
const reservations = load('src/lib/google-calendar-reservations.ts');
const info = { straat: 'Teststraat', huisnummer: '10', plaats: 'Almere' };
const geocode = { status: 'OK', results: [{ geometry: { location_type: 'ROOFTOP', location: { lat: 52, lng: 5 } },
  address_components: [['route', 'Teststraat'], ['street_number', '10'], ['locality', 'Almere']].map(([type, value]) => ({ types: [type], long_name: value })) }] };
function setup({ failDelete = false, mismatch = false, duplicate = false, gap = false, moving = false, lease = false } = {}) {
  const rows = new Map([
    ['planning_entries/visit', { userId: 'owner', quoteId: 'quote', source: 'telegram_werkspot', planningType: 'werkbespreking', status: 'scheduled',
      googleCalendarEventId: 'event', calendarSyncState: 'synced', createdAt: new FixedDate('2026-10-05T08:00Z'),
      startDate: new FixedDate('2026-10-06T17:00Z'), endDate: new FixedDate('2026-10-06T18:00Z'),
      ...(lease ? { calendarSyncLeaseUntil: new FixedDate('2026-10-06T10:01Z') } : {}) }],
    ['quotes/quote', { userId: 'owner', status: 'werkbespreking', klantinformatie: info }],
    ['telegram_lead_imports/import', { userId: 'owner', appointment_id: 'visit', appointment_status: 'pending' }],
  ]);
  if (duplicate) rows.set('quotes/other', { userId: 'owner', klantinformatie: info });
  const snap = path => ({ id: path.split('/')[1], ref: ref(path), exists: rows.has(path), data: () => rows.get(path) });
  const ref = path => ({ path, get: async () => snap(path) });
  const query = (collection, field, value) => ({ query: true, get: async () => ({ docs: [...rows].filter(([path, row]) => path.startsWith(collection + '/') && row[field] === value).map(([path]) => snap(path)) }) });
  const firestore = { collection: name => ({ doc: id => ref(name + '/' + id), where: (field, _, value) => query(name, field, value) }),
    runTransaction: async fn => {
      const writes = [];
      const result = await fn({ get: target => target.get(), getAll: (...refs) => Promise.all(refs.map(ref => ref.get())),
        set: (ref, data) => writes.push([ref.path, data]) });
      writes.forEach(([path, data]) => rows.set(path, { ...rows.get(path), ...data }));
      return result;
    } };
  const positions = Array.from({ length: 13 }, (_, minute) => ({ deviceId: 7, valid: true, latitude: minute >= 11 ? 52.002 : 52,
    longitude: 5, accuracy: 5, speed: moving ? 30 : 0, fixTime: new FixedDate(Date.parse('2026-10-06T08:00Z') + minute * 60_000).toISOString() }));
  if (gap) positions.splice(3, 5);
  const calls = [];
  const controls = { failDelete };
  let removed = false;
  const calendar = { events: { get: async () => {
    if (removed) throw { code: 404 };
    return { data: { etag: 'v1', start: { dateTime: '2026-10-06T17:00Z' }, end: { dateTime: '2026-10-06T18:00Z' },
      extendedProperties: { private: { calvoraPlanningEntryId: mismatch ? 'other' : 'visit', calvoraQuoteId: 'quote' } } } };
  }, delete: async (args, options) => { calls.push({ args, options }); if (controls.failDelete) throw new Error('offline'); removed = true; } } };
  const service = load('src/lib/appointment-visit-completion.ts', {
    '@/lib/quote-visit-gps': gps, '@/lib/google-calendar-reservations': reservations,
    '@/lib/integrations/google-calendar': { getCalendarClient: async () => ({ calendar }) },
  }, { process: { env: { CALVORA_USER_ID: 'owner', TRACCAR_API_TOKEN: 'test', TRACCAR_DEVICE_IDENTIFIER: 'device', GOOGLE_API_KEY: 'test' } },
    fetch: async url => ({ ok: true, json: async () => url.includes('geocode') ? geocode : url.includes('/devices?') ? [{ id: 7, uniqueId: 'device' }] : positions }) });
  return { rows, calls, service, controls, run: (uid = 'owner') => service.completeVisitedAppointments(firestore, uid, calendar) };
}

test('ochtendbezoek verwijdert uitsluitend gekoppelde avondafspraak en bewaart bezoekbewijs', async () => {
  const fixture = setup();
  assert.equal((await fixture.run()).completed, 1);
  assert.equal(fixture.rows.get('planning_entries/visit').status, 'completed');
  assert.equal(fixture.rows.get('quotes/quote').status, 'concept');
  assert.equal(fixture.rows.get('telegram_lead_imports/import').appointment_status, 'completed');
  assert.equal(fixture.rows.get('planning_entries/visit').visitCompletion.departedAt, '2026-10-06T08:12:00.000Z');
  assert.equal(fixture.calls[0].args.eventId, 'event');
  assert.equal(fixture.calls[0].options.headers['If-Match'], 'v1');
  assert.equal((await fixture.run()).completed, 0);
  assert.equal(fixture.calls.length, 1);
});
test('onduidelijk bezoek, dubbel adres, lopende synchronisatie en verkeerde eigenaar verwijderen niets', async () => {
  for (const options of [{ duplicate: true }, { gap: true }, { moving: true }, { lease: true }]) {
    const fixture = setup(options);
    assert.equal((await fixture.run()).completed, 0);
    assert.equal(fixture.calls.length, 0);
  }
  const fixture = setup();
  assert.equal((await fixture.run('other')).completed, 0);
});
test('fout bij verwijderen of afwijkende Google-koppeling geeft tijdslot niet vrij', async () => {
  for (const options of [{ failDelete: true }, { mismatch: true }]) {
    const fixture = setup(options);
    await assert.rejects(fixture.run());
    assert.equal(fixture.rows.get('planning_entries/visit').status, 'scheduled');
    assert.equal(fixture.rows.get('planning_entries/visit').calendarSyncState, options.mismatch ? 'synced' : 'failed');
    assert.equal(fixture.rows.get('telegram_lead_imports/import').appointment_status, 'pending');
  }
});
test('volledig projectadres en exacte geocodering zijn vereist', () => {
  const { service } = setup();
  assert.equal(service.visitAddress({ klantinformatie: { ...info, huisnummer: '' } }), null);
  assert.equal(service.visitAddress({ klantinformatie: { ...info, afwijkendProjectadres: true, projectadres: { plaats: 'Almere' } } }), null);
  const address = service.visitAddress({ klantinformatie: info });
  assert.ok(service.exactVisitSite(geocode, address));
  const approximate = structuredClone(geocode); approximate.results[0].geometry.location_type = 'APPROXIMATE';
  assert.equal(service.exactVisitSite(approximate, address), null);
  assert.equal(service.exactVisitSite({ ...geocode, results: [...geocode.results, ...geocode.results] }, address), null);
});
test('afgeronde afspraak wordt bij herhaalde import niet opnieuw geboekt', async () => {
  const route = makeRoute({ duplicate: { ...cached, appointment_status: 'completed' },
    appointment: { ...pending, status: 'completed', calendarSyncState: 'completed' } });
  const result = await route.post(client);
  assert.equal(result.body.appointment_status, 'completed');
  assert.equal(result.body.telegram_message, null);
  assert.equal(route.calendarCalls.filter(call => call.action === 'insert').length, 0);
});
test('afgeronde ochtendafspraak blokkeert dezelfde avond niet voor een nieuwe klant', async () => {
  const route = makeRoute({ extraRows: [['planning_entries/finished', { userId: 'owner', source: 'telegram_werkspot',
    status: 'completed', calendarSyncState: 'completed', googleCalendarEventId: 'old', visitCompletion: { departedAt: '2026-10-06T08:12Z' }, ...entry('2026-10-06T17:00Z', '2026-10-06T18:00Z') }],
    ['planning_entries/legacy-copy', { userId: 'owner', status: 'scheduled', googleCalendarEventId: 'old', visitCompletion: { departedAt: '2026-10-06T08:12Z' }, ...entry('2026-10-06T17:00Z', '2026-10-06T18:00Z') }]] });
  const result = await route.post(client);
  assert.equal(result.body.appointment_date, '2026-10-06');
  assert.equal(result.body.appointment_time, '19:00');
});

test('tijdelijke Google-fout wordt opnieuw geprobeerd zonder tweede boeking', async () => {
  const fixture = setup({ failDelete: true });
  await assert.rejects(fixture.run());
  fixture.controls.failDelete = false;
  assert.equal((await fixture.run()).completed, 1);
  assert.equal(fixture.rows.get('planning_entries/visit').status, 'completed');
});
test('vandaag vrijgeven respecteert bezetting en biedt nooit een verstreken tijdstip aan', () => {
  const today = new Date('2026-10-06T10:00Z');
  assert.equal(suggestions.getAppointmentSuggestions('', [], { now: today, allowToday: true })[0].date, '2026-10-06');
  assert.equal(suggestions.getAppointmentSuggestions('', [entry('2026-10-06T17:00Z', '2026-10-06T18:00Z')], { now: today, allowToday: true })[0].date, '2026-10-07');
  assert.equal(suggestions.getAppointmentSuggestions('', [], { now: new Date('2026-10-06T17:01Z'), allowToday: true })[0].date, '2026-10-07');
});
