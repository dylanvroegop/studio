const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });

const payload = { document_type: 'invoice', supplier_name: 'Derks', supplier_invoice_number: '56264037',
  amount_excl_btw: 1495.07, btw_amount: 313.96, amount_incl_btw: 1809.03,
  extraction_warning: 'Controleer categorie', category_review_required: true };
const originalCost = { ...payload, user_id: 'owner', id: 'original-cost' };

function setup({ claims = [{ userId: 'owner', status: 'booked', costIds: ['original-cost'] }], storedRows = [originalCost] } = {}) {
  const calls = [];
  const deps = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/cost-document-policy': require('../src/lib/cost-document-policy'),
    '@/lib/cost-import-idempotency': require('../src/lib/cost-import-idempotency'),
    '@/firebase/admin': { initFirebaseAdmin: () => ({ firestore: {
      collection: name => { assert.equal(name, 'cost_import_claims'); return { doc: id => ({ id }) }; },
      getAll: async () => claims.map(claim => ({ exists: true, data: () => claim })),
    } }) },
    '@/lib/pending-cost-imports': { queuePendingCostImport: async (uid, data) => {
      calls.push('queue'); assert.equal(uid, 'owner'); assert.deepEqual(data, payload);
      return { id: 'pending-original', deduplicated: false, data: { ...data, status: 'pending' } };
    } },
    '@/lib/project-costs': { mapProjectCostRow: row => row },
    '@/lib/supabase-admin': { supabaseAdmin: { from: table => {
      assert.equal(table, 'project_costs'); calls.push('read-existing-cost');
      const query = { select: () => query, eq: (field, value) => { assert.deepEqual([field, value], ['user_id', 'owner']); return query; },
        in: async (field, ids) => { assert.deepEqual([field, ids], ['id', ['original-cost']]); return { data: storedRows, error: null }; } };
      return query;
    } } },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/api/kosten/pending/route.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'process', code)(name => {
    assert.ok(name in deps, `Onverwachte afhankelijkheid: ${name}`); return deps[name];
  }, mod, mod.exports, { env: { N8N_HEADER_SECRET: 'test-secret' } });
  return { calls, post: (data = payload) => mod.exports.POST(new Request('http://local/api/kosten/pending', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-offertehulp-secret': 'test-secret' },
    body: JSON.stringify({ user_id: 'owner', payload: data }),
  })) };
}

test('Save For Quote Linking herkent geboekte kosten zonder nieuwe pendingimport', async () => {
  const api = setup(); const response = await api.post(); const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.ok, true);
  assert.equal(body.pending, false); assert.equal(body.already_booked, true); assert.equal(body.deduplicated, true);
  assert.deepEqual(body.cost_ids, ['original-cost']); assert.equal(body.inserted_count, 0);
  assert.deepEqual(api.calls, ['read-existing-cost']);
});

test('onzekere geldige factuur zonder eerdere claim blijft beschikbaar voor controle', async () => {
  const api = setup({ claims: [] }); const response = await api.post(); const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.ok, true);
  assert.equal(body.data.status, 'pending'); assert.equal(body.data.extraction_warning, payload.extraction_warning);
  assert.equal(body.data.category_review_required, true); assert.deepEqual(api.calls, ['queue']);
});

test('processing en vreemde claims maken geen nieuwe pendingimport', async () => {
  for (const claim of [{ userId: 'owner', status: 'processing', costIds: [] },
    { userId: 'someone-else', status: 'booked', costIds: ['original-cost'] }]) {
    const api = setup({ claims: [claim] }); assert.equal((await api.post()).status, 409);
    assert.deepEqual(api.calls, []);
  }
});

test('claim zonder volledige passende bronkosten wordt geen vals succes of nieuwe pendingimport', async () => {
  for (const storedRows of [[], [{ ...originalCost, amount_incl_btw: 1700 }]]) {
    const api = setup({ storedRows }); assert.equal((await api.post()).status, 409);
    assert.deepEqual(api.calls, ['read-existing-cost']);
  }
});

test('orders en onbekende btw blijven buiten de pendingroute', async () => {
  for (const data of [{ ...payload, document_type: 'order_confirmation' }, { ...payload, btw_amount: null }]) {
    const api = setup(); assert.equal((await api.post(data)).status, 422); assert.deepEqual(api.calls, []);
  }
});
