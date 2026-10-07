const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { validateAppointmentDate, protectTelegramDates } = require('./protect-telegram-dates.cjs');
const today = '2026-09-18';
const client = { client_name: 'Voorbeeld', city: 'Amsterdam', job_title: 'Kozijn', appointment_date: '2026-09-19', appointment_time: '17:00', appointment_status: 'confirmed' };

test('incident: 2020 wordt geblokkeerd vóór opslag', () => {
  assert.throws(() => validateAppointmentDate({ ...client, appointment_date: '2020-09-19' }, today), /verleden/);
});
test('correcte bevestiging blijft ongewijzigd', () => {
  assert.equal(validateAppointmentDate(client, today), client);
  assert.equal(client.appointment_status, 'confirmed');
});
test('oude datum wordt ook bij pending of not_found geblokkeerd', () => {
  for (const appointment_status of ['pending', 'not_found']) {
    assert.throws(() => validateAppointmentDate({ ...client, appointment_status, appointment_date: '2026-09-17' }, today), /verleden/);
  }
});
test('vandaag en jaarwisseling zijn toegestaan', () => {
  assert.doesNotThrow(() => validateAppointmentDate({ ...client, appointment_date: today }, today));
  assert.doesNotThrow(() => validateAppointmentDate({ ...client, appointment_date: '2027-01-02' }, '2026-12-30'));
});
test('ongeldige kalenderdatums worden afgewezen, schrikkeldag correct behandeld', () => {
  for (const appointment_date of ['2026-02-29', '2026-09-31', '2026-13-01', '19-09-2026', '2026-9-19', 'null', 20260919]) {
    assert.throws(() => validateAppointmentDate({ ...client, appointment_date }, '2026-01-01'), /Ongeldige afspraakdatum/);
  }
  assert.doesNotThrow(() => validateAppointmentDate({ ...client, appointment_date: '2028-02-29' }, today));
});
test('ontbrekende of niet-uitgevoerde referentiedatum stopt veilig', () => {
  for (const referenceDate of [null, '', '{{ $now.toISODate() }}', '2026-02-30']) {
    assert.throws(() => validateAppointmentDate(client, referenceDate), /actuele datum/);
  }
});
test('eerste screenshot zonder afspraak blijft toegestaan', () => {
  assert.doesNotThrow(() => validateAppointmentDate({ ...client, appointment_status: 'not_found', appointment_date: null, appointment_time: null }, today));
});
test('afspraak met ontbrekende of onzekere datum stopt', () => {
  for (const appointment_status of ['confirmed', 'pending']) {
    assert.throws(() => validateAppointmentDate({ ...client, appointment_status, appointment_date: null }, today), /afspraakdatum ontbreekt/);
  }
});
test('tijdvalidatie voorkomt ongeldige bevestigingen', () => {
  for (const appointment_time of ['25:00', '17:60', '5:00', 'null', 1700]) {
    assert.throws(() => validateAppointmentDate({ ...client, appointment_time }, today), /Ongeldige afspraaktijd/);
  }
  assert.throws(() => validateAppointmentDate({ ...client, appointment_time: null }, today), /afspraaktijd ontbreekt/);
  assert.doesNotThrow(() => validateAppointmentDate({ ...client, appointment_status: 'pending', appointment_time: null }, today));
});

const exportPath = process.env.TELEGRAM_DATE_WORKFLOW_EXPORT;
test('echte export: alleen prompt en sessiecontrole wijzigen, identiteitsregels blijven behouden', { skip: !exportPath }, () => {
  const before = JSON.parse(fs.readFileSync(exportPath));
  const after = protectTelegramDates(before);
  assert.deepEqual(after.connections, before.connections);
  assert.equal(after.nodes.length, before.nodes.length);
  for (let i = 0; i < before.nodes.length; i++) {
    const oldNode = before.nodes[i], newNode = after.nodes[i];
    if (!['AI Agent', 'Kies bestaande sessie'].includes(oldNode.name)) assert.deepEqual(newNode, oldNode);
    assert.deepEqual(newNode.credentials, oldNode.credentials);
  }
  const prompt = after.nodes.find(n => n.name === 'AI Agent').parameters.options.systemMessage;
  assert.ok(prompt.startsWith('='));
  const rendered = prompt.slice(1).replace(/\{\{([\s\S]*?)\}\}/g, (_, expression) => new Function('$now', 'return (' + expression + ')')({ setZone: zone => {
    assert.equal(zone, 'Europe/Amsterdam'); return { toISODate: () => today };
  } }));
  assert.ok(rendered.includes('Reference date in Europe/Amsterdam:\n2026-09-18'));
  assert.ok(!rendered.includes('{{'));
  assert.ok(rendered.includes('CONTACT IDENTITY SAFETY:'));
  assert.throws(() => protectTelegramDates(after), /al toegepast/);
});
test('echte export: sessienode blokkeert AI-fout en overgenomen oude datum', { skip: !exportPath }, () => {
  const after = protectTelegramDates(JSON.parse(fs.readFileSync(exportPath)));
  const code = after.nodes.find(n => n.name === 'Kies bestaande sessie').parameters.jsCode;
  const execute = (incoming, rows = []) => new Function('$input', '$', '$now', code)(
    { all: () => rows.map(json => ({ json })) },
    name => ({ first: () => ({ json: name === 'AI Agent' ? { output: incoming } : { message: { chat: { id: 'test-chat' } } } }) }),
    { setZone: () => ({ toISODate: () => today }) },
  );
  assert.throws(() => execute({ ...client, appointment_date: '2020-09-19' }), /verleden/);
  assert.equal(execute(client)[0].json.client_json.appointment_date, '2026-09-19');
  const oldSession = { id: 'session-1', chat_id: 'test-chat', client_json: { ...client, appointment_date: '2020-09-19' } };
  assert.throws(() => execute({ ...client, appointment_date: null, appointment_time: null, appointment_status: 'not_found' }, [oldSession]), /verleden/);
  // Expliciete juiste nieuwe datum mag een oude verkeerde sessiedatum wel vervangen.
  const corrected = execute(client, [oldSession])[0].json;
  assert.equal(corrected.id, 'session-1');
  assert.equal(corrected.client_json.appointment_date, '2026-09-19');
});
