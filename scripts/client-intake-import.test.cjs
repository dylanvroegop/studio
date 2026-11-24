const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeRoute, client } = require('./telegram-appointment-test-harness.cjs');

const onDay = (date = '2026-10-10') => ({ ...client, appointment_date: date, appointment_status: 'pending' });
const googleEvent = (id, start, end) => ({ id, start: { dateTime: start }, end: { dateTime: end } });

test('native verwerking gebruikt dezelfde kern zonder automatiseringssecret', async () => {
  const route = makeRoute();
  const native = await route.nativePost(onDay());
  assert.equal(native.status, 200);
  assert.equal(native.body.appointment_date, '2026-10-10');
  assert.equal(native.body.appointment_time, '19:00');
  assert.equal(native.body.calendar_synced, true);
  const legacy = await route.post(onDay());
  assert.equal(legacy.body.project_id, native.body.project_id);
  assert.equal(legacy.body.appointment_id, native.body.appointment_id);
  assert.equal(route.events.size, 1);
});

test('compatibiliteitsroute blijft zonder geldig secret ontoegankelijk', async () => {
  const route = makeRoute();
  const result = await route.rawPost({ headers: new Headers(), json: async () => ({ lead_key: 'attack', client }) });
  assert.equal(result.status, 401);
  assert.equal(route.writes.length, 0);
});

test('datum zonder tijd zoekt op dezelfde zaterdag terug inclusief reistijd', async () => {
  const route = makeRoute({ googleEvents: [googleEvent('evening', '2026-10-10T17:00:00Z', '2026-10-10T18:00:00Z')] });
  const result = await route.nativePost(onDay());
  assert.equal(result.status, 200);
  assert.equal(result.body.appointment_date, '2026-10-10');
  assert.equal(result.body.appointment_time, '17:30');
  assert.equal(result.body.appointment_status, 'pending');
});

test('volle gevraagde dag geeft conflict zonder andere dag te beloven of gegevens aan te maken', async () => {
  const route = makeRoute({ googleEvents: [googleEvent('full-day', '2026-10-09T22:00:00Z', '2026-10-10T22:00:00Z')] });
  const result = await route.nativePost(onDay());
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'APPOINTMENT_SLOT_CONFLICT');
  assert.equal(route.writes.length, 0);
});

test('datum zonder tijd verplaatst een bestaande reservering op dezelfde offerte', async () => {
  const route = makeRoute();
  const initial = await route.nativePost(onDay('2026-10-07'));
  const moved = await route.nativePost(onDay('2026-10-10'));
  assert.equal(moved.status, 200);
  assert.equal(moved.body.appointment_date, '2026-10-10');
  assert.equal(moved.body.project_id, initial.body.project_id);
  assert.equal(moved.body.appointment_id, initial.body.appointment_id);
  assert.equal(route.events.size, 1);
});

test('herhaling op dezelfde dag bewaart een bevestigde afspraak en haar tijd', async () => {
  const route = makeRoute();
  const initial = await route.nativePost({ ...onDay(), appointment_time: '16:00', appointment_status: 'confirmed' });
  const repeated = await route.nativePost(onDay());
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.appointment_status, 'scheduled');
  assert.equal(repeated.body.appointment_time, '16:00');
  assert.equal(repeated.body.appointment_id, initial.body.appointment_id);
});

for (const incoming of [
  { ...onDay(), appointment_status: 'confirmed' },
  onDay('2026-02-30'),
  onDay('2026-10-05'),
  { ...onDay('2026-10-05'), appointment_time: '19:00' },
  { ...client, appointment_time: '19:00', appointment_status: 'pending' },
  { ...onDay(), appointment_time: '25:00' },
]) test('ongeldige of verstreken afspraak stopt zonder writes: ' + JSON.stringify(incoming), async () => {
  const route = makeRoute();
  const result = await route.nativePost(incoming);
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'INVALID_APPOINTMENT_DATE');
  assert.equal(route.writes.length, 0);
});

test('concurrente aanvragen op dezelfde dag reserveren verschillende momenten', async () => {
  const route = makeRoute();
  const results = await Promise.all([1, 2, 3].map(index => route.nativePost({
    ...onDay(), client_name: `Nieuwe klant ${index}`, phone: `+3167777777${index}`, email: `nieuw${index}@example.com`,
  }, 'native-' + index)));
  assert.ok(results.every(result => result.status === 200));
  assert.ok(results.every(result => result.body.appointment_date === '2026-10-10'));
  assert.equal(new Set(results.map(result => result.body.appointment_time)).size, 3);
  assert.equal(route.events.size, 3);
});

test('expliciet wissen corrigeert klant, offerte en dezelfde agenda-afspraak', async () => {
  const route = makeRoute();
  const initial = await route.nativePost({ ...onDay(), address: 'Teststraat 10', job_title: 'Kozijn vervangen' });
  const corrected = await route.nativePost({ ...onDay(), email: null, phone: null, address: null, job_title: null }, 'test-session', ['email', 'phone', 'address', 'job_title']);
  assert.equal(corrected.status, 200);
  assert.equal(corrected.body.appointment_id, initial.body.appointment_id);
  const savedClient = route.rows.get('clients/' + initial.body.client_id);
  assert.equal(savedClient.emailadres, null);
  assert.equal(savedClient.telefoonnummer, null);
  assert.equal(savedClient.straat, null);
  assert.equal(savedClient.huisnummer, null);
  const quote = route.rows.get('quotes/' + initial.body.project_id);
  assert.equal(quote.klantinformatie['e-mailadres'], null);
  assert.equal(quote.klantinformatie.projectStraat, null);
  assert.equal(quote.klantinformatie.projectadres.straat, null);
  assert.equal(quote.klantinformatie.factuuradres.huisnummer, null);
  assert.equal(quote.werkomschrijving, '');
  const event = route.events.get(initial.body.google_calendar_event_id);
  assert.doesNotMatch(event.location, /Teststraat/);
  assert.doesNotMatch(event.description, /31611111111/);
  assert.equal(route.events.size, 1);
});

test('leeg vervolg zonder clear_fields bewaart bestaande contactgegevens', async () => {
  const route = makeRoute();
  const initial = await route.nativePost({ ...onDay(), address: 'Teststraat 10' });
  const repeated = await route.nativePost({ ...onDay(), email: null, phone: null, address: null });
  assert.equal(repeated.status, 200);
  assert.equal(route.rows.get('clients/' + initial.body.client_id).emailadres, client.email);
  assert.equal(route.rows.get('clients/' + initial.body.client_id).straat, 'Teststraat');
});

test('wissen van klantnaam stopt zonder identiteit te beschadigen', async () => {
  const route = makeRoute();
  const initial = await route.nativePost(onDay());
  const result = await route.nativePost({ ...onDay(), client_name: null }, 'test-session', ['client_name']);
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'CLIENT_IDENTITY_REQUIRED');
  assert.equal(route.rows.get('clients/' + initial.body.client_id).voornaam, 'Test');
});
