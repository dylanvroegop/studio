const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadTs(file, overrides = {}, globals = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { exports: module.exports, module,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : require(name),
    process, console, Buffer, Intl, Date, ...globals }, { filename: file });
  return module.exports;
}
const identity = loadTs('src/lib/telegram-client-identity.ts');
const client = { client_name: 'Klant A', city: 'Almere', phone: '+31611111111', email: 'a@example.com' };
const other = { client_name: 'Klant B', city: 'Beverwijk', phone: '+31622222222', email: 'b@example.com' };
const stored = c => ({ userId: 'owner', voornaam: c.client_name, telefoonnummer: c.phone, emailadres: c.email, plaats: c.city });
const rows = [client, other].map((identity, i) => ({ id: String(i), identity }));
test('zelfde identiteit met Nederlandse telefoonnotatie wordt herkend', () => assert.equal(identity.selectTelegramClient(rows, { ...client, phone: '0611111111' }).id, '0'));
test('andere naam met bestaand nummer stopt', () => assert.throws(() => identity.selectTelegramClient(rows, { ...other, phone: client.phone }), /Klantgegevens/));
test('telefoon en e-mail van twee klanten stoppen', () => assert.throws(() => identity.selectTelegramClient(rows, { ...client, email: other.email }), /Klantgegevens/));
test('naam en plaats mogen bestaand contact niet wijzigen', () => assert.throws(() => identity.selectTelegramClient(rows, { ...client, phone: '+31633333333' }), /Klantgegevens/));
test('dubbel nummer kiest nooit de eerste klant', () => assert.throws(() => identity.selectTelegramClient([...rows, { id: 'duplicate', identity: client }], client), /Klantgegevens/));
test('nieuwe klant blijft een aparte klant', () => assert.equal(identity.selectTelegramClient(rows, { client_name: 'Nieuw', phone: '+31633333333' }), undefined));

function makeRoute({ clients = { a: stored(client), b: stored(other) }, duplicate, project } = {}) {
  return require('./telegram-appointment-test-harness.cjs').makeRoute({ clients, duplicate, existingProject: project || null });
}
for (const [name, incoming] of [
  ['gemengd telefoonnummer', { ...other, phone: client.phone }],
  ['gemengde e-mail', { ...client, email: other.email }],
  ['overschrijven op naam en plaats', { ...client, phone: '+31633333333' }],
]) test('API weigert ' + name + ' zonder databasewrites', async () => {
  const route = makeRoute(); const result = await route.post(incoming);
  assert.equal(result.status, 409); assert.equal(result.body.code, 'CLIENT_IDENTITY_CONFLICT'); assert.equal(route.writes.length, 0);
});
test('API valideert ook een bestaande lead_key voordat een eerder resultaat terugkomt', async () => {
  const route = makeRoute({ duplicate: { client_id: 'a', project_id: 'existing' }, project: { userId: 'owner', clientId: 'a', klantinformatie: stored(client) } });
  const result = await route.post(other); assert.equal(result.status, 409); assert.equal(route.writes.length, 0);
});
test('API weigert een oude offerte die aan een andere klant vastzit', async () => {
  const route = makeRoute({ duplicate: { client_id: 'a', project_id: 'existing' }, project: { userId: 'owner', clientId: 'a', klantinformatie: stored(other) } });
  const result = await route.post(client); assert.equal(result.status, 409); assert.equal(route.writes.length, 0);
});
test('API weigert afspraak-update voor een andere klant op dezelfde sessie', async () => {
  const route = makeRoute({ duplicate: { client_id: 'a', project_id: 'existing' }, project: { userId: 'owner', clientId: 'a', klantinformatie: stored(client) } });
  const result = await route.post({ ...other, appointment_date: '2026-10-01', appointment_time: '19:00', appointment_status: 'confirmed' });
  assert.equal(result.status, 409); assert.equal(route.writes.length, 0);
});
test('geldige herhaalde import hergebruikt offerte zonder nieuwe offerte te maken', async () => {
  const route = makeRoute({ duplicate: { client_id: 'a', project_id: 'existing' }, project: { userId: 'owner', clientId: 'a', klantinformatie: stored(client) } });
  const result = await route.post(client); assert.equal(result.status, 200); assert.equal(result.body.project_id, 'existing'); assert.equal(route.writes.filter(write => write.path.startsWith('quotes/')).length, 0);
});
test('geldige eerste import gebruikt gecontroleerde klant binnen transactie', async () => {
  const route = makeRoute(); const result = await route.post(client);
  assert.equal(result.status, 200); assert.equal(result.body.client_id, 'a');
  assert.equal(route.writes.filter(w => w.path.startsWith('clients/')).length, 1);
  assert.equal(route.writes.find(write => write.path.startsWith('clients/')).path, 'clients/a');
  assert.equal(route.reads.filter(r => r === 'clients/query').length, 1);
});
test('nieuwe klant maakt een aparte klant en offerte', async () => {
  const route = makeRoute(); const result = await route.post({ client_name: 'Nieuwe klant', city: 'Utrecht', phone: '+31633333333' });
  assert.equal(result.status, 200); assert.notEqual(result.body.client_id, 'a'); assert.notEqual(result.body.client_id, 'b');
  assert.equal(route.writes.filter(w => w.path.startsWith('quotes/')).length, 1);
});
