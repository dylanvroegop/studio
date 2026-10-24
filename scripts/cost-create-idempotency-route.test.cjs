const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });

const input = { user_id: 'owner', document_type: 'invoice', supplier_name: 'Derks', supplier_invoice_number: '56264037',
  amount_excl_btw: 1495.07, btw_amount: 313.96, amount_incl_btw: 1809.03,
  extraction_warning: 'Dit mag bij een duplicaat geen tweede controletaak maken', line_items: [{ category: 'gereedschap' }] };
const originalCost = { ...input, id: 'original-cost' };

function setup({ status = 'booked', claimsOwner = 'owner', storedRows = [originalCost] } = {}) {
  const calls = [];
  const deps = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/cost-document-policy': require('../src/lib/cost-document-policy'),
    '@/lib/cost-import-idempotency': require('../src/lib/cost-import-idempotency'),
    '@/lib/cost-vat-validation': {},
    '@/lib/purchase-product-category-server': { classifyPurchaseLines: async () => { calls.push('classify'); throw new Error('Classificatie mag niet starten bij een bestaande claim'); } },
    '@/firebase/admin': { initFirebaseAdmin: () => ({ firestore: {
      collection: name => { assert.equal(name, 'cost_import_claims'); return { doc: id => ({ id }) }; },
      getAll: async (...refs) => refs.map(() => ({ exists: true, data: () => ({ userId: claimsOwner, status, costIds: ['original-cost'] }) })),
      runTransaction: async () => { calls.push('claim-write'); throw new Error('Geen nieuwe claim verwacht'); },
    } }) },
    '@/lib/gps-purchase-link-server': { enrichPurchaseFromGps: async () => { calls.push('gps'); throw new Error('Geen nieuwe routing verwacht'); } },
    '@/lib/cost-import-routing': {},
    '@/lib/pending-cost-imports': { queuePendingCostImport: async () => { calls.push('pending-write'); throw new Error('Geen tweede openstaande import verwacht'); } },
    '@/lib/demo-trial-server': { ensureDemoTrialActiveByUid: async () => null },
    '@/lib/labor-costs': {}, '@/lib/tax-document-archive': {},
    '@/lib/project-costs': { mapProjectCostRow: row => row, normalizeProjectCostLineItems: lines => lines },
    '@/lib/supabase-admin': { supabaseAdmin: { from: table => {
      assert.equal(table, 'project_costs'); calls.push('read-existing-cost');
      const query = { select: () => query, eq: (field, value) => { assert.deepEqual([field, value], ['user_id', 'owner']); return query; },
        in: async (field, ids) => { assert.deepEqual([field, ids], ['id', ['original-cost']]); return { data: storedRows, error: null }; } };
      return query;
    } } },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/api/kosten/create/route.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'process', code)(name => {
    assert.ok(name in deps, `Onverwachte afhankelijkheid: ${name}`); return deps[name];
  }, mod, mod.exports, { env: { N8N_HEADER_SECRET: 'test-secret' } });
  return { calls, post: (payload = input) => mod.exports.POST(new Request('http://local/api/kosten/create', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-offertehulp-secret': 'test-secret' }, body: JSON.stringify(payload),
  })) };
}

test('geboekte automatiseringsimport retourneert bestaande kosten vóór classificatie/pending en zonder writes', async () => {
  const api = setup(); const response = await api.post(); const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true); assert.equal(body.deduplicated, true); assert.equal(body.already_booked, true);
  assert.equal(body.inserted_count, 0); assert.deepEqual(body.cost_ids, ['original-cost']);
  assert.equal(body.rows.length, 1); assert.equal(body.data.id, 'original-cost');
  assert.deepEqual(api.calls, ['read-existing-cost']);
});

test('lopende of gedeeltelijk mislukte import blijft 409 zonder classificatie, pending of retry', async () => {
  for (const status of ['processing', 'failed']) {
    const api = setup({ status }); const response = await api.post();
    assert.equal(response.status, 409); assert.deepEqual(api.calls, []);
  }
});

test('verwijderde bron of afwijkende bedragen geven geen vals duplicaatsucces', async () => {
  for (const storedRows of [[], [{ ...originalCost, amount_incl_btw: 1700 }]]) {
    const api = setup({ storedRows }); const response = await api.post();
    assert.equal(response.status, 409); assert.deepEqual(api.calls, ['read-existing-cost']);
  }
});

test('claim van een andere eigenaar wordt niet als succes geretourneerd', async () => {
  const api = setup({ claimsOwner: 'other' });
  assert.equal((await api.post()).status, 409); assert.deepEqual(api.calls, []);
});

test('order en onbekende btw blijven geweigerd, ook als de opgegeven identiteit een claim raakt', async () => {
  for (const payload of [{ ...input, document_type: 'order_confirmation' }, { ...input, btw_amount: null }]) {
    const api = setup(); assert.equal((await api.post(payload)).status, 422); assert.deepEqual(api.calls, []);
  }
});
