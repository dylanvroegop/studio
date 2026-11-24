const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, overrides = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, Intl, Date, require: name => overrides[name] || require(name) });
  return module.exports;
}
const types = load('src/lib/client-intake.ts');
const identity = load('src/lib/telegram-client-identity.ts');
const flow = load('src/lib/client-intake-flow.ts', { './client-intake': types, './telegram-client-identity': identity });
const client = types.intakeClientSchema.parse({ client_name: 'Test Klant', city: 'Utrecht', phone: '0612345678', job_title: 'Binnendeur' });
const session = { id: 'one', state: 'done', client, result: { appointment_status: 'pending', appointment_date: '2027-01-12', appointment_time: '19:00', calendar_synced: true, telegram_message: 'Beschikbaar op dinsdag om 19:00.' } };
const incoming = fields => types.intakeClientSchema.parse(fields);
test('followup recognizes normalized contact and preserves original session id', () => {
  assert.equal(flow.matchAppointmentIntake([session], incoming({ phone: '+31 6 12345678' })).id, 'one');
});
test('name alone, conflicting identity, unknown client and closed appointments never auto-match', () => {
  for (const data of [{ client_name: 'Test Klant' }, { phone: '0612345678', client_name: 'Andere Klant' }, { phone: '0687654321' }]) assert.equal(flow.matchAppointmentIntake([session], incoming(data)), null);
  assert.equal(flow.matchAppointmentIntake([{ ...session, result: { appointment_status: 'cancelled' } }], client), null);
});
test('multiple jobs require matching job or explicit choice', () => {
  const second = { ...session, id: 'two', client: { ...client, job_title: 'Schutting' } };
  assert.equal(flow.matchAppointmentIntake([session, second], incoming({ phone: client.phone })), null);
  assert.equal(flow.matchAppointmentIntake([session, second], incoming({ phone: client.phone, job_title: 'Schutting' })).id, 'two');
});
test('confirmation supplements existing client without creating a new customer', () => {
  const merged = flow.appointmentFollowup(session, incoming({ appointment_status: 'confirmed', appointment_date: '2027-01-12', appointment_time: '19:00' }));
  assert.equal(merged.phone, client.phone); assert.equal(merged.job_title, client.job_title); assert.equal(merged.appointment_status, 'confirmed');
});
test('missing appointment and selected wrong client stop automatic processing', () => {
  assert.throws(() => flow.appointmentFollowup(session, incoming({})), /Geen afspraak/);
  assert.throws(() => flow.appointmentFollowup(session, incoming({ phone: '0699999999', appointment_status: 'confirmed' })), /andere klantgegevens/);
});
test('unresolved new date never inherits old reserved time', () => {
  const merged = flow.appointmentFollowup({ ...session, client: { ...client, appointment_date: '2027-01-12', appointment_time: '19:00' } }, incoming({ appointment_status: 'pending', appointment_date: '2027-01-13' }));
  assert.equal(merged.appointment_time, null);
});
test('copyable message requires completed calendar sync; confirmations contain actual saved moment', () => {
  assert.equal(flow.intakeCustomerMessage(session), session.result.telegram_message);
  assert.equal(flow.intakeCustomerMessage({ ...session, state: 'error' }), '');
  assert.equal(flow.intakeCustomerMessage({ ...session, result: { ...session.result, calendar_synced: false } }), '');
  const text = flow.intakeCustomerMessage({ ...session, result: { ...session.result, appointment_status: 'scheduled' } });
  assert.match(text, /12 januari 2027/); assert.match(text, /19:00/);
});
