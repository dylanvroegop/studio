const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

function harness(mocks = {}, globals = {}) {
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const module = { exports: {} }; cache.set(absolute, module);
    const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Date, Intl, URL, URLSearchParams,
      Request, Response, AbortSignal, Error, console, Buffer, process: { env: { GOOGLE_MAPS_API_KEY: 'test-only' } },
      ...globals, require: name => {
        if (name in mocks) return mocks[name];
        if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts');
        return require(name);
      } }, { filename: file });
    return module.exports;
  }
  return { load };
}
const pure = harness().load('src/lib/departure-planning.ts');
const entry = { id: 'day1', quoteId: 'q1', start: '2026-11-13T07:00:00Z', end: '2026-11-13T16:00:00Z',
  status: 'scheduled', planningType: 'job', clientName: 'Klant', address: 'Projectstraat 1, Utrecht' };
const origin = { latitude: 52, longitude: 5, label: 'GPS' };
const evening = new Date('2026-11-12T18:00:00Z');

test('05:00 inclusief, 10:00 exclusief in Amsterdam, ook in de zomer', () => {
  for (const [time, expected] of [
    ['2026-11-13T03:59:00Z', false], ['2026-11-13T04:00:00Z', true],
    ['2026-11-13T08:59:00Z', true], ['2026-11-13T09:00:00Z', false],
    ['2026-07-13T03:00:00Z', true], ['2026-07-13T08:00:00Z', false],
  ]) assert.equal(pure.isMorningRoute(new Date(time)), expected, time);
});

test('lokale datums en 08:00 blijven correct over beide klokwissels', () => {
  assert.equal(pure.routeInstant('2026-03-29', '08:00').toISOString(), '2026-03-29T06:00:00.000Z');
  assert.equal(pure.routeInstant('2026-10-25', '08:00').toISOString(), '2026-10-25T07:00:00.000Z');
  assert.equal(pure.nextRouteDate('2026-12-31'), '2027-01-01');
  assert.equal(pure.routeDate('2026-11-12T23:30:00Z'), '2026-11-13');
});

test('alleen eerste klusdag; afgeronde eerste dagen blijven meetellen', () => {
  const second = { ...entry, id: 'day2', start: '2026-11-14T07:00:00Z', end: '2026-11-14T16:00:00Z', parentEntryId: entry.id };
  assert.equal(pure.isFirstJobDay(entry, [entry, second], '2026-11-13'), true);
  assert.equal(pure.isFirstJobDay(second, [{ ...entry, status: 'completed' }, second], '2026-11-14'), false);
  assert.equal(pure.isFirstJobDay({ ...entry, planningType: 'werkbespreking' }, [entry], '2026-11-13'), false);
  const earlier = { ...entry, id: 'earlier', start: '2026-11-10T07:00:00Z' };
  for (const override of [{ status: 'cancelled' }, { status: 'pending' }, { isGoogleCalendarHistory: true }, { planningType: 'werkbespreking' }]) {
    assert.equal(pure.isFirstJobDay(entry, [{ ...earlier, ...override }, entry], '2026-11-13'), true);
  }
});

test('meerdaagse blokken, hele dagen en offertes zonder koppeling', () => {
  const spanning = { ...entry, end: '2026-11-15T16:00:00Z' };
  assert.equal(pure.entriesForRouteDay([spanning], '2026-11-14').length, 1);
  assert.equal(pure.isFirstJobDay(spanning, [spanning], '2026-11-14'), false);
  const allDay = { ...entry, isAllDay: true, start: '2026-11-12T23:00:00Z', end: '2026-11-13T23:00:00Z' };
  assert.equal(pure.entriesForRouteDay([allDay], '2026-11-14').length, 0);
  assert.equal(pure.arrivalForEntry(allDay, '2026-11-13').toISOString(), '2026-11-13T07:00:00.000Z');
  const unlinked = { ...entry, quoteId: '' };
  const other = { ...unlinked, id: 'other', start: '2026-11-10T07:00:00Z' };
  assert.equal(pure.isFirstJobDay(unlinked, [other, unlinked], '2026-11-13'), true);
});

function hours(open = 7, close = 17, day = 13) {
  return { periods: [{ open: { date: { year: 2026, month: 11, day }, hour: open }, close: { date: { year: 2026, month: 11, day }, hour: close } }] };
}
test('controleert de volledige laadperiode, uitzonderlijke dag en onbekende openingstijden', () => {
  const from = new Date('2026-11-13T06:00:00Z'), to = new Date('2026-11-13T06:30:00Z');
  assert.equal(pure.storeOpenDuring(hours(), from, to), true);
  assert.equal(pure.storeOpenDuring(hours(8), from, to), false);
  assert.equal(pure.storeOpenDuring(hours(7, 17, 12), from, to), false);
  assert.equal(pure.storeOpenDuring({ periods: [] }, from, to), false);
  assert.equal(pure.storeOpenDuring(undefined, from, to), null);
  assert.equal(pure.storeOpenDuring({ periods: [{ open: { day: 5, hour: 7 }, close: { day: 5, hour: 17 } }] }, from, to), null);
  assert.equal(pure.storeOpenDuring(hours(7, 8), from, new Date('2026-11-13T07:01:00Z')), false);
});

function mapsHarness(options = {}) {
  const calls = [];
  const stores = options.stores || [
    { id: 'closed', displayName: { text: 'Bouwmaat dicht' }, formattedAddress: 'Dichtstraat 1', businessStatus: 'OPERATIONAL', currentOpeningHours: hours(8) },
    { id: 'near', displayName: { text: 'Bouwmaat dichtbij' }, formattedAddress: 'Winkelstraat 2', businessStatus: 'OPERATIONAL', currentOpeningHours: hours() },
    { id: 'far', displayName: { text: 'Bouwmaat verder' }, formattedAddress: 'Winkelstraat 3', businessStatus: 'OPERATIONAL', currentOpeningHours: hours() },
  ];
  const h = harness({}, { fetch: async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url, body, headers: init.headers });
    if (options.status) return new Response('{}', { status: options.status });
    if (init.headers['X-Goog-FieldMask'] === 'places.location') return Response.json({ places: [{ location: { latitude: 52.1, longitude: 5.1 } }] });
    if (url.includes('searchText')) return Response.json({ places: stores });
    assert.equal(body.travelMode, 'DRIVE');
    assert.equal(body.routingPreference, 'TRAFFIC_AWARE_OPTIMAL');
    assert.ok(!('arrivalTime' in body));
    const minutes = options.minutes ? options.minutes(body) : body.destination.placeId === 'far' ? 40 : body.origin.placeId === 'far' ? 5 : 30;
    return Response.json({ routes: [{ duration: `${minutes * 60}s` }] });
  } });
  return { ...h.load('src/lib/departure-maps-server.ts'), calls };
}

test('30 min + 30 min laden + 30 min = 06:30 vertrekken, dichtstbijzijnde open vestiging', async () => {
  const h = mapsHarness();
  const plan = await h.calculateDeparturePlan({ entry, date: '2026-11-13', origin, viaBouwmaat: true, now: evening });
  assert.equal(pure.routeTime(plan.departureAt), '06:30');
  assert.equal(plan.store.id, 'near');
  assert.equal(pure.routeTime(plan.store.arrivalAt), '07:00');
  assert.equal(pure.routeTime(plan.store.departureAt), '07:30');
  assert.equal(pure.routeTime(plan.arrivalAt), '08:00');
  assert.equal(plan.pickupMinutes, 30);
  const url = new URL(plan.mapsUrl);
  assert.equal(url.searchParams.get('destination'), entry.address);
  assert.equal(url.searchParams.get('waypoint_place_ids'), 'near');
  assert.equal(url.searchParams.get('origin'), null, 'Maps gebruikt verse locatie bij navigeren');
  assert.ok(h.calls.filter(c => c.url.includes('computeRoutes')).length >= 4);
});

test('vervolgdag rekent zonder laden en zonder Places-aanroep', async () => {
  const h = mapsHarness();
  const plan = await h.calculateDeparturePlan({ entry, date: '2026-11-13', origin, viaBouwmaat: false, now: evening });
  assert.equal(pure.routeTime(plan.departureAt), '07:30');
  assert.equal(plan.pickupMinutes, 0);
  assert.ok(!plan.store);
  assert.equal(h.calls.length, 2);
});

test('handmatig vertrekadres bepaalt het zoekcentrum; niet het IP-adres van de server', async () => {
  const h = mapsHarness();
  await h.calculateDeparturePlan({ entry, date: '2026-11-13', origin: { address: 'Vertrekstraat 1, Utrecht', label: 'slaapplek' }, viaBouwmaat: true, now: evening });
  const lookup = h.calls.find(call => call.body.textQuery === 'Bouwmaat');
  assert.equal(lookup.body.locationBias.circle.center.latitude, 52.1);
  assert.equal(lookup.body.locationBias.circle.center.longitude, 5.1);
});

test('bij andere ochtenddrukte wordt reistijd opnieuw berekend en naar boven afgerond', async () => {
  let call = 0;
  const h = mapsHarness({ minutes: () => ++call === 1 ? 30 : 35.2 });
  const plan = await h.calculateDeparturePlan({ entry, date: '2026-11-13', origin, viaBouwmaat: false, now: evening });
  assert.equal(pure.routeTime(plan.departureAt), '07:24');
  assert.equal(h.calls[1].body.departureTime, '2026-11-13T06:30:00.000Z');
});

test('geen fictieve route bij ontbrekende uren, gesloten winkel of API-fout', async () => {
  for (const currentOpeningHours of [undefined, hours(8), { periods: [] }]) {
    const h = mapsHarness({ stores: [{ id: 'x', displayName: { text: 'Bouwmaat X' }, formattedAddress: 'X', businessStatus: 'OPERATIONAL', currentOpeningHours }] });
    await assert.rejects(h.calculateDeparturePlan({ entry, date: '2026-11-13', origin, viaBouwmaat: true, now: evening }), /Geen gecontroleerde Bouwmaat/);
  }
  await assert.rejects(mapsHarness({ status: 403 }).calculateDeparturePlan({ entry, date: '2026-11-13', origin, viaBouwmaat: false, now: evening }), /geen toegang/);
});

test('te laat: geen vertrek in het verleden naar Google en waarschuwing in de app', async () => {
  const h = mapsHarness(), now = new Date('2026-11-13T08:30:00Z');
  const plan = await h.calculateDeparturePlan({ entry, date: '2026-11-13', origin, viaBouwmaat: true, now });
  assert.match(plan.warning, /al voorbij/);
  assert.ok(h.calls.filter(c => c.body.departureTime).every(c => new Date(c.body.departureTime) > now));
  const closed = mapsHarness({ stores: [{ id: 'x', displayName: { text: 'Bouwmaat X' }, formattedAddress: 'X', businessStatus: 'OPERATIONAL', currentOpeningHours: hours(7, 9) }] });
  await assert.rejects(closed.calculateDeparturePlan({ entry, date: '2026-11-13', origin, viaBouwmaat: true, now }), /Geen gecontroleerde/);
});

test('GPS verwerpt toekomst, onnauwkeurige/oude punten; beperkte stilstandaanname is zichtbaar', () => {
  const { validRecentOrigin } = harness({ '@/firebase/admin': {}, '@/lib/supabase-admin': {} }).load('src/lib/departure-server.ts');
  const fresh = { latitude: 52, longitude: 5, recordedAt: evening.toISOString() };
  assert.ok(validRecentOrigin(fresh, evening));
  for (const patch of [{ latitude: NaN }, { longitude: 181 }, { valid: false }, { accuracy: 600 },
    { recordedAt: '2026-11-12T18:10:00Z' }, { recordedAt: '2026-11-12T17:00:00Z' }]) assert.equal(validRecentOrigin({ ...fresh, ...patch }, evening), null);
  const parked = { ...fresh, recordedAt: '2026-11-12T16:00:00Z', attributes: { motion: false }, speed: 0 };
  assert.match(validRecentOrigin(parked, evening).label, /aangenomen/);
  assert.equal(validRecentOrigin({ ...parked, speed: 3 }, evening), null);
  assert.equal(validRecentOrigin({ ...parked, recordedAt: '2026-11-11T18:00:00Z' }, evening), null);
});

function reminderHarness() {
  const rows = new Map(), delivered = [], state = { entries: [entry], enabled: true, failure: false, noGps: false, calculations: 0 };
  const firestore = {
    collection: name => ({ doc: id => {
      const key = `${name}/${id}`;
      return { get: async () => ({ data: () => rows.get(key) }), set: async data => rows.set(key, { ...rows.get(key), ...data }) };
    } }),
    runTransaction: async callback => callback({ get: ref => ref.get(), set: (ref, data) => ref.set(data) }),
  };
  const h = harness({
    '@/firebase/admin': { initFirebaseAdmin: () => ({ firestore }) },
    '@/lib/departure-server': { readDepartureSettings: async () => ({ remindersEnabled: state.enabled }),
      readRouteEntries: async () => state.entries, fillRouteAddress: async (_, item) => item,
      readRouteOrigin: async () => { if (state.noGps) throw Error('Geen recente GPS-locatie.'); return origin; } },
    '@/lib/departure-maps-server': { calculateDeparturePlan: async input => {
      state.calculations++;
      return { entry: input.entry, date: input.date, origin, arrivalAt: entry.start, departureAt: '2026-11-13T05:30:00Z',
        driveToClientMinutes: 30, driveToStoreMinutes: 30, pickupMinutes: 30 };
    } },
    '@/lib/push-inbox': { deliverAppMessage: async (uid, message) => { delivered.push({ uid, message });
      return { accepted: state.failure ? 0 : 1, failed: state.failure ? 1 : 0, skipped: 0, saved: true }; } },
  });
  return { ...h.load('src/lib/departure-reminder-server.ts'), state, rows, delivered };
}

test('avondmelding eenmaal, alleen avond en ingeschakelde meldingen', async () => {
  const h = reminderHarness();
  assert.equal((await h.sendDepartureReminder('owner', new Date('2026-11-12T17:59:00Z'))).reason, 'outside_evening');
  h.state.enabled = false;
  assert.equal((await h.sendDepartureReminder('owner', evening)).reason, 'disabled');
  h.state.enabled = true;
  await h.sendDepartureReminder('owner', evening);
  await h.sendDepartureReminder('owner', new Date('2026-11-12T18:05:00Z'));
  assert.equal(h.delivered.length, 1);
  assert.equal(h.delivered[0].uid, 'owner');
  assert.equal(h.delivered[0].message.eventId, 'departure:2026-11-13');
});

test('geen planning sluit latere avondtoevoeging niet uit; push-retry hergebruikt hetzelfde bericht', async () => {
  const h = reminderHarness(); h.state.entries = [];
  assert.equal((await h.sendDepartureReminder('owner', evening)).reason, 'no_planning');
  h.state.entries = [entry]; h.state.failure = true;
  await h.sendDepartureReminder('owner', evening);
  h.state.failure = false;
  await h.sendDepartureReminder('owner', evening);
  assert.equal(h.state.calculations, 1);
  assert.equal(h.delivered.length, 2);
  assert.deepEqual(h.delivered[0], h.delivered[1]);
});

test('bij ontbrekende GPS blijft afspraak zichtbaar zonder verzonnen vertrektijd', async () => {
  const h = reminderHarness(); h.state.noGps = true;
  await h.sendDepartureReminder('owner', evening);
  assert.match(h.delivered[0].message.body, /08:00 bij Klant/);
  assert.match(h.delivered[0].message.body, /Geen recente GPS/);
  assert.equal(h.state.calculations, 0);
});

test('beveiligde routes weigeren anoniem en de ochtendroute gebruikt uitsluitend eigen planning', async () => {
  const FixedDate = class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-11-13T05:00:00Z'])); } };
  let reads = 0;
  const h = harness({
    '@/lib/push-server': { pushUser: async request => request.headers.get('authorization') === 'Bearer owner' ? 'owner' : null,
      pushError: (error, status) => Response.json({ error }, { status }), pushHeaders: {} },
    '@/lib/departure-server': { readRouteEntries: async uid => { reads++; assert.equal(uid, 'owner'); return [entry]; },
      fillRouteAddress: async (_, item) => item, readRouteOrigin: async () => origin },
    '@/lib/departure-maps-server': { calculateDeparturePlan: async input => ({ entry: input.entry }) },
    '@/lib/departure-reminder-server': { sendDepartureReminder: async () => ({ ok: true }) },
  }, { Date: FixedDate });
  const route = h.load('src/app/api/planning/route/route.ts');
  const req = (body, auth = '') => new Request('https://app.calvora.nl/api/planning/route', {
    method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await route.POST(req({ quoteId: 'q1' }))).status, 401);
  assert.equal(reads, 0);
  assert.equal((await route.POST(req({ quoteId: 'q1' }, 'Bearer owner')).then(r => r.json())).eligible, true);
  assert.equal((await route.POST(req({ quoteId: 'someone-elses-quote' }, 'Bearer owner')).then(r => r.json())).eligible, false);
  assert.equal((await h.load('src/app/api/planning/departure-reminder/route.ts').POST(req({}))).status, 401);
});
