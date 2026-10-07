const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeRoute, client, entry, pending, cached, calendarHelper, importId } = require('./telegram-appointment-test-harness.cjs');

const other = number => ({ client_name: `Klant ${number}`, city: 'Utrecht', phone: `+3162222222${number}`, email: `klant${number}@example.com` });
const successful = result => { assert.equal(result.status, 200); assert.equal(result.body.calendar_synced, true); assert.ok(result.body.google_calendar_event_id); };
test('drie gelijktijdige nieuwe klanten krijgen drie gereserveerde momenten en Google-events', async () => {
  const route = makeRoute();
  const results = await Promise.all([1, 2, 3].map(number => route.post(other(number), 'lead-' + number)));
  results.forEach(successful);
  assert.equal(new Set(results.map(result => result.body.appointment_date + result.body.appointment_time)).size, 3);
  assert.equal(route.events.size, 3);
  assert.ok(route.retries() > 0, 'de test oefent echte transactieretries');
  for (const event of route.events.values()) {
    assert.match(event.summary, /^PENDING · /);
    assert.equal(event.status, 'tentative');
    assert.equal(event.transparency, 'opaque');
    assert.equal(event.extendedProperties.private.appointmentStatus, 'pending');
    assert.match(event.description, /Telegram-sessie: lead-/);
  }
});
test('verse Google Calendar-bezetting wordt gepagineerd gelezen en blokkeert een voorstel', async () => {
  const route = makeRoute({ googleEvents: [
    { id: 'external-1', start: { dateTime: '2026-10-07T17:00:00Z' }, end: { dateTime: '2026-10-07T18:00:00Z' } },
    { id: 'external-2', start: { dateTime: '2026-10-08T17:00:00Z' }, end: { dateTime: '2026-10-08T18:00:00Z' } },
  ] });
  route.controls.pageSize = 1;
  const result = await route.post();
  successful(result);
  assert.equal(result.body.appointment_date, '2026-10-09');
  assert.ok(route.calendarCalls.some(call => call.action === 'list' && call.pageToken === '1'));
});
test('beschikbaarheid wordt ook na de eerste Google-window verder opgehaald', async () => {
  const route = makeRoute({ googleEvents: [{ id: 'long-holiday', start: { dateTime: '2026-10-06T00:00:00Z' }, end: { dateTime: '2026-12-01T00:00:00Z' } }] });
  const result = await route.post();
  successful(result);
  assert.equal(result.body.appointment_date, '2026-12-01');
  assert.ok(route.calendarCalls.filter(call => call.action === 'list').some(call => new Date(call.timeMax) > new Date('2026-12-01')));
});
test('een onzekere insert bewaart de reservering en retry maakt geen tweede Google-event', async () => {
  const route = makeRoute();
  route.controls.failNextInsertAfter = true;
  const first = await route.post();
  assert.equal(first.status, 503);
  assert.equal(first.body.success, false);
  assert.equal(first.body.telegram_message, undefined);
  assert.equal(route.events.size, 1);
  const reserved = [...route.rows].find(([path, data]) => path.startsWith('planning_entries/') && data.source === 'telegram_werkspot');
  assert.equal(reserved[1].status, 'pending');
  assert.equal(reserved[1].calendarSyncState, 'failed');
  const second = await route.post();
  successful(second);
  assert.equal(second.body.appointment_id, reserved[0].split('/')[1]);
  assert.equal(route.events.size, 1);
  assert.equal(route.calendarCalls.filter(call => call.action === 'insert').length, 1);
});
test('een mislukte sync blijft gereserveerd voor een volgende nieuwe klant', async () => {
  const route = makeRoute();
  route.controls.failInsertBefore = true;
  const failed = await route.post();
  assert.equal(failed.status, 503);
  route.controls.failInsertBefore = false;
  const second = await route.post(other(1), 'lead-2');
  successful(second);
  assert.equal(second.body.appointment_date, '2026-10-08');
});
test('bevestiging verplaatst en bevestigt hetzelfde event en maakt het oude moment vrij', async () => {
  const route = makeRoute();
  const proposed = await route.post();
  successful(proposed);
  const confirmed = await route.post({ ...client, appointment_date: '2026-10-12', appointment_time: '16:00', appointment_status: 'confirmed' });
  successful(confirmed);
  assert.equal(confirmed.body.appointment_id, proposed.body.appointment_id);
  assert.equal(confirmed.body.google_calendar_event_id, proposed.body.google_calendar_event_id);
  assert.equal(confirmed.body.appointment_status, 'scheduled');
  const event = route.events.get(confirmed.body.google_calendar_event_id);
  assert.equal(event.status, 'confirmed');
  assert.doesNotMatch(event.summary, /PENDING/);
  assert.equal(event.start.dateTime, '2026-10-12T14:00:00.000Z');
  assert.equal(route.events.size, 1);
  const next = await route.post(other(1), 'lead-2');
  assert.equal(next.body.appointment_date, proposed.body.appointment_date);
});
test('bevestiging mag niet over een andere gereserveerde afspraak heen schrijven', async () => {
  const route = makeRoute();
  const first = await route.post();
  const second = await route.post(other(1), 'lead-2');
  const conflict = await route.post({ ...client, appointment_date: second.body.appointment_date, appointment_time: second.body.appointment_time, appointment_status: 'confirmed' });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, 'APPOINTMENT_SLOT_CONFLICT');
  assert.equal(route.events.get(first.body.google_calendar_event_id).status, 'tentative');
  assert.equal(route.events.size, 2);
});
test('handmatige Google-verwijdering maakt het moment vrij en herhaling maakt de afspraak niet opnieuw', async () => {
  const route = makeRoute();
  const first = await route.post();
  route.events.get(first.body.google_calendar_event_id).status = 'cancelled';
  const next = await route.post(other(1), 'lead-2');
  successful(next);
  assert.equal(next.body.appointment_date, first.body.appointment_date);
  const repeated = await route.post();
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.appointment_status, 'cancelled');
  assert.equal(repeated.body.telegram_message, null);
  assert.equal(route.calendarCalls.filter(call => call.action === 'insert').length, 2);
});
test('Google 404 op eerder gesynchroniseerd event geldt als verwijdering', async () => {
  const route = makeRoute();
  const first = await route.post();
  route.events.delete(first.body.google_calendar_event_id);
  const repeated = await route.post();
  assert.equal(repeated.body.appointment_status, 'cancelled');
  assert.equal(route.events.size, 0);
});
test('Google 500 geldt nooit als verwijdering en veroorzaakt geen lokale vrijgave', async () => {
  const route = makeRoute();
  const first = await route.post();
  route.controls.failNextGetCode = 500;
  const failed = await route.post(other(1), 'lead-2');
  assert.equal(failed.status, 503);
  assert.equal(route.rows.get('planning_entries/' + first.body.appointment_id).status, 'pending');
});
test('ontbrekende oude planningrij blijft via de verstuurde importcache gereserveerd', async () => {
  const route = makeRoute({ duplicate: { ...cached, appointment_date: '2026-10-07', suggested_appointment_date: '2026-10-07' } });
  const result = await route.post(other(1), 'new-lead');
  successful(result);
  assert.equal(result.body.appointment_date, '2026-10-08');
});
test('herstel van oud voorstel bewaart eerder beloofde dag en oorspronkelijke afspraak-id', async () => {
  const route = makeRoute({ duplicate: cached });
  const result = await route.post();
  successful(result);
  assert.equal(result.body.appointment_date, '2026-10-09');
  assert.equal(result.body.appointment_id, 'appointment');
});
test('historisch overlappende voorstellen worden gemeld in plaats van stilzwijgend verplaatst', async () => {
  const route = makeRoute({ duplicate: cached, extraRows: [[
    'telegram_lead_imports/' + importId('other-old-lead'), { ...cached, userId: 'owner', appointment_id: 'other-appointment', project_id: 'other-project' },
  ]] });
  const result = await route.post();
  assert.equal(result.status, 409);
  assert.equal(route.events.size, 0);
  assert.equal(route.writes.length, 0);
});
test('ook een oude nog niet gesynchroniseerde planningrij respecteert andere beloofde momenten', async () => {
  const route = makeRoute({ duplicate: cached, appointment: pending, extraRows: [[
    'telegram_lead_imports/' + importId('other-old-lead'), { ...cached, userId: 'owner', appointment_id: 'other-appointment', project_id: 'other-project' },
  ]] });
  const result = await route.post();
  assert.equal(result.status, 409);
  assert.equal(route.events.size, 0);
  assert.equal(route.writes.length, 0);
});
test('kalender-event-id is deterministisch en Google base32hex-compatibel', () => {
  const id = calendarHelper.telegramCalendarEventId('appointment');
  assert.equal(id, calendarHelper.telegramCalendarEventId('appointment'));
  assert.match(id, /^[a-v0-9]{5,1024}$/);
  assert.notEqual(id, calendarHelper.telegramCalendarEventId('other'));
});
test('bestaand n8n-event wordt exact op sessiemarker gekoppeld en niet gedupliceerd', async () => {
  const route = makeRoute({ duplicate: { ...cached, appointment_status: 'scheduled' }, appointment: { ...pending, status: 'scheduled' }, googleEvents: [{
    id: 'old-n8n-event', description: 'Klant: Test Klant\nTelegram-sessie: test-session', status: 'confirmed', etag: 'old-etag',
    start: { dateTime: '2026-10-09T17:00:00Z' }, end: { dateTime: '2026-10-09T18:00:00Z' },
  }] });
  const result = await route.post();
  successful(result);
  assert.equal(result.body.google_calendar_event_id, 'old-n8n-event');
  assert.equal(route.events.size, 1);
  assert.equal(route.calendarCalls.filter(call => call.action === 'insert').length, 0);
  assert.equal(route.calendarCalls.find(call => call.action === 'patch').options.headers['If-Match'], 'old-etag');
  assert.equal(route.events.get('old-n8n-event').extendedProperties.private.calvoraPlanningEntryId, 'appointment');
});
test('handmatig verplaatste Google-afspraak levert direct de echte datum en tijd op', async () => {
  const route = makeRoute();
  const first = await route.post();
  const event = route.events.get(first.body.google_calendar_event_id);
  event.start.dateTime = '2026-10-12T18:00:00Z';
  event.end.dateTime = '2026-10-12T19:00:00Z';
  const repeated = await route.post();
  successful(repeated);
  assert.equal(repeated.body.appointment_date, '2026-10-12');
  assert.equal(repeated.body.appointment_time, '20:00');
  assert.match(repeated.body.telegram_message, /maandag 12 oktober om 20:00/);
  assert.equal(route.rows.get('planning_entries/' + first.body.appointment_id).startDate.toISOString(), '2026-10-12T18:00:00.000Z');
});
test('verwijdering tussen GET en PATCH geeft een annulering en nooit een nieuw event', async () => {
  const route = makeRoute();
  const first = await route.post();
  route.controls.deleteBeforePatch = true;
  const confirmed = await route.post({ ...client, appointment_date: first.body.appointment_date, appointment_time: first.body.appointment_time, appointment_status: 'confirmed' });
  assert.equal(confirmed.body.appointment_status, 'cancelled');
  assert.equal(route.rows.get('planning_entries/' + first.body.appointment_id).status, 'cancelled');
  assert.equal(route.calendarCalls.filter(call => call.action === 'insert').length, 1);
});
test('gelijktijdige kalenderwijziging met 412 behoudt reservering en meldt geen succes', async () => {
  const route = makeRoute();
  const first = await route.post();
  route.controls.failPatchCode = 412;
  const confirmed = await route.post({ ...client, appointment_date: first.body.appointment_date, appointment_time: first.body.appointment_time, appointment_status: 'confirmed' });
  assert.equal(confirmed.status, 503);
  assert.equal(route.rows.get('planning_entries/' + first.body.appointment_id).calendarSyncState, 'failed');
  assert.notEqual(route.rows.get('planning_entries/' + first.body.appointment_id).status, 'cancelled');
});
test('wijziging tussen reserveren en sync gebruikt de nieuwste opgeslagen afspraak in antwoord en Google', async () => {
  const route = makeRoute();
  route.controls.beforeTransaction = async (number, rows) => {
    if (number !== 2) return;
    const [path, data] = [...rows].find(([path]) => path.startsWith('planning_entries/'));
    rows.set(path, { ...data, status: 'scheduled', startDate: new Date('2026-10-12T14:00Z'), endDate: new Date('2026-10-12T15:00Z'), calendarSyncRevision: 'newer-edit' });
  };
  const result = await route.post();
  successful(result);
  assert.equal(result.body.appointment_status, 'scheduled');
  assert.equal(result.body.appointment_date, '2026-10-12');
  assert.equal(result.body.appointment_time, '16:00');
  assert.equal(result.body.telegram_message, null);
  assert.equal(route.events.get(result.body.google_calendar_event_id).status, 'confirmed');
});
test('annulering tussen reserveren en sync wordt niet opnieuw aangemaakt', async () => {
  const route = makeRoute();
  route.controls.beforeTransaction = async (number, rows) => {
    if (number !== 2) return;
    const [path, data] = [...rows].find(([path]) => path.startsWith('planning_entries/'));
    rows.set(path, { ...data, status: 'cancelled', calendarSyncState: 'cancelled' });
  };
  const result = await route.post();
  assert.equal(result.status, 200);
  assert.equal(result.body.appointment_status, 'cancelled');
  assert.equal(route.events.size, 0);
});
test('bevestiging tijdens lopende sync wacht veilig op retry en wordt niet door pending overschreven', async () => {
  const route = makeRoute();
  let signal;
  let release;
  const started = new Promise(resolve => { signal = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  route.controls.beforeInsert = async () => { signal(); await blocked; };
  const initial = route.post();
  await started;
  const during = await route.post({ ...client, appointment_date: '2026-10-12', appointment_time: '16:00', appointment_status: 'confirmed' });
  assert.equal(during.status, 503);
  assert.equal(during.body.code, 'CALENDAR_SYNC_IN_PROGRESS');
  release();
  await initial;
  const confirmed = await route.post({ ...client, appointment_date: '2026-10-12', appointment_time: '16:00', appointment_status: 'confirmed' });
  successful(confirmed);
  assert.equal(route.events.get(confirmed.body.google_calendar_event_id).status, 'confirmed');
  assert.equal(route.events.size, 1);
});
for (const missingPlanning of [false, true]) test(`oud bevestigd n8n-event houdt echte datum en status bij adoptie (${missingPlanning ? 'ontbrekende' : 'bestaande'} planning)`, async () => {
  const event = {
    id: 'old-n8n', description: 'Telegram-sessie: test-session\nStatus: confirmed', status: 'confirmed',
    start: { dateTime: '2026-10-12T14:00:00Z' }, end: { dateTime: '2026-10-12T15:00:00Z' },
  };
  const route = makeRoute({ duplicate: cached, appointment: missingPlanning ? undefined : pending, googleEvents: [event],
    extraRows: missingPlanning ? [['planning_entries/google_old-n8n', {
      userId: 'owner', status: 'scheduled', source: 'google_calendar', googleCalendarEventId: 'old-n8n',
      startDate: new Date(event.start.dateTime), endDate: new Date(event.end.dateTime),
    }]] : [],
  });
  const result = await route.post();
  successful(result);
  assert.equal(result.body.appointment_date, '2026-10-12');
  assert.equal(result.body.appointment_time, '16:00');
  assert.equal(result.body.appointment_status, 'scheduled');
  assert.equal(result.body.telegram_message, null);
  assert.equal(route.events.get('old-n8n').start.dateTime, '2026-10-12T14:00:00.000Z');
  assert.equal(route.events.get('old-n8n').status, 'confirmed');
  assert.equal(route.events.size, 1);
});
test('agenda langer dan een jaar vol geeft begrensde fout zonder een bezet moment te beloven', async () => {
  const route = makeRoute({ googleEvents: [{ id: 'always-busy', start: { dateTime: '2026-10-06T00:00:00Z' }, end: { dateTime: '2028-01-01T00:00:00Z' } }] });
  const result = await route.post();
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'APPOINTMENT_AVAILABILITY_UNAVAILABLE');
  assert.equal(result.body.telegram_message, undefined);
  assert.equal(route.writes.length, 0);
  assert.ok(route.calendarCalls.filter(call => call.action === 'list').length < 15);
});
test('verwijdering van gekoppeld legacy-event maakt ook de oude lokale Google-spiegel vrij', async () => {
  const event = { id: 'old-event', description: 'Telegram-sessie: test-session\nStatus: pending',
    start: { dateTime: '2026-10-09T17:00:00Z' }, end: { dateTime: '2026-10-09T18:00:00Z' } };
  const route = makeRoute({ duplicate: cached, workDays: [5], googleEvents: [event], extraRows: [[
    'planning_entries/google_old-event', { userId: 'owner', source: 'google', status: 'pending', googleCalendarEventId: 'old-event',
      startDate: new Date(event.start.dateTime), endDate: new Date(event.end.dateTime) },
  ]] });
  successful(await route.post());
  route.events.get('old-event').status = 'cancelled';
  const next = await route.post(other(1), 'lead-2');
  successful(next);
  assert.equal(next.body.appointment_date, '2026-10-09');
  assert.equal(route.rows.get('planning_entries/google_old-event').status, 'cancelled');
  assert.equal(route.rows.get('planning_entries/appointment').status, 'cancelled');
});
