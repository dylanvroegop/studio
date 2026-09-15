const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });

let database;
const originalLoad = Module._load;
Module._load = function (id, parent, main) {
  if (id === '@/firebase/admin') return { initFirebaseAdmin: () => ({ firestore: database }) };
  if (id.startsWith('@/')) id = path.join(__dirname, '../src', id.slice(2));
  return originalLoad.call(this, id, parent, main);
};
const { createChecklistTelegramHandler } = require('../src/lib/checklist-telegram-handler.ts');
const { createChecklistReminderHandler } = require('../src/lib/checklist-reminder-handler.ts');
const { copyGroceryWorkflow } = require('./copy-grocery-workflow.cjs');

function fakeDatabase() {
  const collections = new Map();
  function collection(name) {
    if (!collections.has(name)) collections.set(name, new Map());
    const rows = collections.get(name);
    const doc = id => ({
      id,
      async get() { return { id, exists: rows.has(id), data: () => rows.get(id), ref: doc(id) }; },
      async set(value) { rows.set(id, value); },
      async update(value) { rows.set(id, { ...rows.get(id), ...value }); },
    });
    function query(filters = [], limit = Infinity) {
      return {
        where(field, op, value) { assert.equal(op, '=='); return query([...filters, [field, value]], limit); },
        limit(value) { return query(filters, value); },
        async get() {
          const docs = await Promise.all([...rows].filter(([, value]) => filters.every(([field, expected]) => value[field] === expected)).slice(0, limit).map(([id]) => doc(id).get()));
          return { docs, empty: docs.length === 0 };
        },
      };
    }
    return { doc, ...query() };
  }
  return { collection, collections };
}

const secret = 'isolated-test-secret';
function request(body, headers = {}) {
  return new Request('http://localhost/api/test', { method: 'POST', headers: { 'x-offertehulp-secret': secret, ...headers }, body: JSON.stringify(body) });
}

test('beide lijsten slaan apart op, weigeren ongeldige invoer en verwerken herlevering eenmaal', async () => {
  process.env.N8N_HEADER_SECRET = secret;
  database = fakeDatabase();
  for (const [kind, prefix] of [['materials', 'material'], ['groceries', 'grocery']]) {
    await database.collection(`${prefix}_lists`).doc(`${prefix}-list`).set({ userId: 'owner', is_general: true, item_count: 0 });
    const handler = createChecklistTelegramHandler(kind);
    assert.equal((await handler(request({ material: 'melk' }, { 'x-offertehulp-secret': 'wrong' }))).status, 401);
    assert.equal((await handler(request({ material: '' }))).status, 400);
    assert.equal((await handler(request({ material: 'x'.repeat(501) }))).status, 400);
    const message = { material: kind === 'groceries' ? 'melk' : 'kit', chatId: '42', messageId: '7' };
    const first = await (await handler(request(message))).json();
    const replay = await (await handler(request(message))).json();
    assert.equal(first.duplicate, false);
    assert.equal(replay.duplicate, true);
    assert.equal(first.listId, `${prefix}-list`);
    assert.equal(database.collections.get(`${prefix}_list_items`).size, 1);
    assert.equal(database.collections.get(`${prefix}_list_items`).get('telegram-42-7').product_name, message.material);
    assert.equal(database.collections.get(`${prefix}_lists`).get(`${prefix}-list`).item_count, 1);
  }
});

test('herinneringen bevatten alleen eigen open regels en verwijzen naar de juiste lijst', async () => {
  process.env.N8N_HEADER_SECRET = secret;
  database = fakeDatabase();
  for (const [kind, prefix, route] of [['materials', 'material', 'materiaallijsten'], ['groceries', 'grocery', 'boodschappenlijst']]) {
    const listId = `${prefix}-list`;
    await database.collection(`${prefix}_lists`).doc(listId).set({ userId: 'owner', is_general: true });
    await database.collection(`${prefix}_lists`).doc('other').set({ userId: 'someone-else', is_general: true });
    for (const [id, data] of Object.entries({ late: { sort_order: 4 }, first: { sort_order: 0 }, archived: { checked: true }, blank: { product_name: ' ' }, other: { material_list_id: 'other' } })) {
      await database.collection(`${prefix}_list_items`).doc(id).set({ material_list_id: listId, product_name: id, checked: false, quantity: 1, ...data });
    }
    const handler = createChecklistReminderHandler(kind);
    assert.equal((await handler(new Request('http://localhost'))).status, 401);
    const response = await handler(new Request('http://localhost', { headers: { 'x-offertehulp-secret': secret, 'x-offertehulp-user-id': 'owner' } }));
    const result = await response.json();
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(result.shouldAlert, true);
    assert.deepEqual(result.items.map(item => item.id), ['first', 'late']);
    assert.equal(result.listUrl, `https://app.calvora.nl/${route}/${listId}`);
  }
});

if (process.env.MATERIAL_WORKFLOW_EXPORT) test('Telegram-kopie behoudt alle 11 nodes, verbindingen en spraakinstellingen', () => {
  const source = JSON.parse(require('node:fs').readFileSync(process.env.MATERIAL_WORKFLOW_EXPORT, 'utf8'));
  const copy = copyGroceryWorkflow(source);
  assert.equal(copy.nodes.length, 11);
  assert.deepEqual(copy.connections, source.connections);
  assert.deepEqual(copy.settings, source.settings);
  assert.equal(copy.active, false);
  assert.deepEqual(copy.pinData, {});
  copy.nodes.forEach((node, index) => {
    const original = source.nodes[index];
    assert.equal(node.type, original.type);
    assert.equal(node.typeVersion, original.typeVersion);
    assert.notEqual(node.id, original.id);
    assert.equal(node.credentials?.telegramApi, undefined);
    const expected = structuredClone(original.parameters);
    if (expected.url) expected.url = expected.url.replace('/material-lists/', '/grocery-lists/');
    if (expected.text) expected.text = expected.text.replaceAll('materiaallijst', 'boodschappenlijst');
    assert.deepEqual(node.parameters, expected);
    if (original.credentials?.openAiApi) assert.deepEqual(node.credentials.openAiApi, original.credentials.openAiApi);
  });
});
