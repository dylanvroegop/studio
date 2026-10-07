const { test } = require('node:test');
const assert = require('node:assert/strict');
const { suggestions, entry, client, pending, cached, makeRoute } = require('./telegram-appointment-test-harness.cjs');

test('één vrije datum met behoud van voorkeur voor dezelfde plaats in de eerste vier dagen', () => {
  const result = suggestions.getAppointmentSuggestions('Almere', [entry('2026-10-08T07:00Z', '2026-10-08T15:00Z', 'Almere')]);
  assert.equal(result.length, 1);
  assert.equal(result[0].date, '2026-10-08');
  assert.equal(result[0].time, '19:00');
});
test('veertien volledig bezette dagen leveren daarna één vrije datum op', () => {
  const result = suggestions.getAppointmentSuggestions('', [entry('2026-10-07T00:00Z', '2026-10-21T00:00Z')]);
  assert.equal(result.length, 1);
  assert.equal(result[0].date, '2026-10-21');
  assert.equal(result[0].startDate.toISOString(), '2026-10-21T17:00:00.000Z');
});
test('blijft zoeken na een lange bezette periode en respecteert de ingestelde werkdag', () => {
  const result = suggestions.getAppointmentSuggestions('', [entry('2026-10-06T00:00Z', '2027-01-01T00:00Z')], { workDays: [1] });
  assert.equal(result[0].date, '2027-01-04');
});
test('werkdag buiten de eerste vier dagen en wintertijd worden correct verwerkt', () => {
  const result = suggestions.getAppointmentSuggestions('', [], { workDays: [7], now: new Date('2026-10-19T10:00Z') });
  assert.equal(result[0].date, '2026-10-25');
  assert.equal(result[0].startDate.toISOString(), '2026-10-25T18:00:00.000Z');
});
test('een bezet avondslot wordt overgeslagen, een afspraak die om 19:00 eindigt niet', () => {
  const result = suggestions.getAppointmentSuggestions('', [
    entry('2026-10-07T17:30Z', '2026-10-07T18:30Z'),
    entry('2026-10-08T15:00Z', '2026-10-08T17:00Z'),
  ]);
  assert.equal(result[0].date, '2026-10-08');
});

function assertSingleMessage(body) {
  assert.equal(body.success, true);
  assert.equal(body.appointment_status, 'pending');
  assert.equal(body.suggested_appointment_options.length, 1);
  assert.match(body.telegram_message, /Ik kan op .* om 19:00 langskomen/);
  assert.match(body.telegram_message, /Mocht dit moment niet uitkomen, welke dag en tijd zouden u beter uitkomen\?/);
  assert.doesNotMatch(body.telegram_message, /twee momenten|1\.|2\.|geen afspraak|geen afspraakvoorstel/i);
}
test('API geeft bij volle eerste twee weken een klantbericht en één pending afspraak', async () => {
  const route = makeRoute({ busy: [entry('2026-10-07T00:00Z', '2026-10-21T00:00Z')] });
  const result = await route.post();
  assertSingleMessage(result.body);
  assert.equal(result.body.appointment_date, '2026-10-21');
  assert.equal(new Set(route.writes.filter(write => write.path.startsWith('planning_entries/')).map(write => write.path)).size, 1);
});
test('oude cache zonder voorstel krijgt een afspraak op dezelfde offerte zonder klant/offerte te overschrijven', async () => {
  const route = makeRoute({ duplicate: { client_id: 'client', project_id: 'existing', appointment_status: 'none', telegram_message: null } });
  const result = await route.post();
  assertSingleMessage(result.body);
  assert.equal(result.body.project_id, 'existing');
  assert.ok(route.writes.every(write => !/^(clients|quotes|counters)\//.test(write.path)));
  assert.equal(route.rows.get('quotes/existing').titel, 'Bestaande omschrijving');
});
test('oude tweedatumcache wordt één voorstel met behoud van bestaande afspraak en idempotente herhaling', async () => {
  const route = makeRoute({ duplicate: cached, appointment: pending });
  const first = await route.post();
  assertSingleMessage(first.body);
  assert.equal(first.body.appointment_id, 'appointment');
  assert.equal(first.body.appointment_date, '2026-10-09');
  assert.equal(route.writes.filter(write => write.path.startsWith('quotes/')).length, 0);
  assert.equal(route.writes.filter(write => write.data.startDate).length, 0);
  const count = route.writes.length;
  const second = await route.post();
  assertSingleMessage(second.body);
  assert.equal(second.body.appointment_id, first.body.appointment_id);
  assert.equal(route.writes.length, count);
});
test('bericht gebruikt de echte bestaande afspraak als de oude cache een andere datum heeft', async () => {
  const route = makeRoute({ duplicate: { ...cached, appointment_date: '2026-10-08' }, appointment: { ...pending, ...entry('2026-10-12T17:00Z', '2026-10-12T18:00Z') } });
  const result = await route.post();
  assertSingleMessage(result.body);
  assert.equal(result.body.appointment_date, '2026-10-12');
  assert.match(result.body.telegram_message, /maandag 12 oktober/);
});
test('bestaande pending afspraak corrigeert ook verouderde status en metadata in de importcache', async () => {
  const route = makeRoute({ duplicate: { ...cached, appointment_status: 'none', suggested_appointment_date: '2026-10-08' }, appointment: pending });
  const result = await route.post();
  assertSingleMessage(result.body);
  const savedImport = route.writes.find(write => write.path.startsWith('telegram_lead_imports/')).data;
  assert.equal(savedImport.appointment_status, 'pending');
  assert.equal(savedImport.suggested_appointment_date, '2026-10-09');
});
test('verlopen pending voorstel blijft op dezelfde datum staan tot bevestiging of verwijdering', async () => {
  const route = makeRoute({ duplicate: cached, appointment: {
    ...pending, ...entry('2026-10-01T17:00Z', '2026-10-01T18:00Z'),
    createdAt: 'original-timestamp',
  } });
  const result = await route.post();
  assertSingleMessage(result.body);
  assert.equal(result.body.appointment_id, 'appointment');
  assert.equal(result.body.appointment_date, '2026-10-01');
  assert.equal(result.body.project_id, 'existing');
  assert.ok(route.rows.get('planning_entries/appointment').googleCalendarEventId);
  assert.equal(route.rows.get('planning_entries/appointment').createdAt, 'original-timestamp');
});
test('bevestigde afspraak wordt niet omgezet naar een nieuw voorstel', async () => {
  const route = makeRoute({ duplicate: { ...cached, appointment_status: 'scheduled' }, appointment: { ...pending, status: 'scheduled' } });
  const result = await route.post();
  assert.equal(result.body.appointment_status, 'scheduled');
  assert.equal(result.body.telegram_message, null);
  assert.equal(result.body.appointment_id, 'appointment');
  assert.ok(result.body.calendar_synced);
});
test('cacheherstel schrijft nooit naar een afspraak van een andere eigenaar', async () => {
  const route = makeRoute({
    duplicate: cached, appointment: { ...pending, userId: 'other-owner' },
    appointmentSuggestions: { ...suggestions, getAppointmentSuggestions: () => [] },
  });
  await route.post();
  assert.equal(route.writes.filter(write => write.path === 'planning_entries/appointment').length, 0);
  assert.equal(route.rows.get('planning_entries/appointment').userId, 'other-owner');
});
test('expliciete pending datum krijgt hetzelfde enkele klantbericht', async () => {
  const route = makeRoute();
  const result = await route.post({ ...client, appointment_date: '2026-10-22', appointment_time: '19:00', appointment_status: 'pending' });
  assertSingleMessage(result.body);
  assert.equal(result.body.appointment_date, '2026-10-22');
});
