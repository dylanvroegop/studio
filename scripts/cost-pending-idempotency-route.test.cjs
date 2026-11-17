const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const payload = { document_type: 'invoice', supplier_name: 'Test leverancier', supplier_invoice_number: 'TEST-001',
  amount_excl_btw: 100, btw_amount: 21, amount_incl_btw: 121,
  extraction_warning: 'Controleer categorie', category_review_required: true };

// De oude pending-ingang gebruikt nu de create-route. De claim- en opslagregels
// worden met de echte create-route getest in cost-create-idempotency-route.test.cjs.
function setup({ status = 200, result = { ok: true, cost_ids: ['cost-1'] } } = {}) {
  const calls = [];
  const response = Response.json(result, { status, headers: { 'Cache-Control': 'no-store' } });
  const deps = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/firebase/admin': { initFirebaseAdmin: () => { throw new Error('Pending mag niet zelf opslaan'); } },
    '@/lib/pending-cost-imports': {},
    '@/app/api/kosten/create/route': { POST: async request => {
      calls.push({ url: request.url, method: request.method, headers: request.headers, body: await request.json() });
      return response;
    } },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/api/kosten/pending/route.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'process', code)(name => {
    assert.ok(name in deps, `Onverwachte afhankelijkheid: ${name}`); return deps[name];
  }, mod, mod.exports, { env: { N8N_HEADER_SECRET: 'test-secret' } });
  return { calls, response, post: (body = { user_id: 'owner', payload }, headers = {}) => mod.exports.POST(new Request('http://local/api/kosten/pending', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-offertehulp-secret': 'test-secret', ...headers },
    body: JSON.stringify(body),
  })) };
}

test('geldige factuur gaat inclusief controlepunten naar dezelfde create-route', async () => {
  const api = setup();
  assert.equal(await api.post(), api.response);
  assert.equal(api.calls.length, 1);
  const request = api.calls[0];
  assert.equal(request.url, 'http://local/api/kosten/create');
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.get('x-offertehulp-secret'), 'test-secret');
  assert.deepEqual(request.body, { ...payload, user_id: 'owner' });
});

test('bestaande kosten, conflicten en validatiefouten worden ongewijzigd teruggegeven', async () => {
  for (const [status, result] of [
    [200, { ok: true, already_booked: true, deduplicated: true, cost_ids: ['original-cost'], inserted_count: 0 }],
    [409, { ok: false, message: 'Import wordt al verwerkt.' }],
    [422, { ok: false, message: 'Onbekende btw.' }],
  ]) {
    const api = setup({ status, result });
    const response = await api.post();
    assert.equal(response, api.response);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), result);
    assert.equal(api.calls.length, 1);
  }
});

test('ongeldig geheim of ontbrekende eigenaar bereikt create niet', async () => {
  for (const [body, headers] of [
    [{ user_id: 'owner', payload }, { 'x-offertehulp-secret': '' }],
    [{ user_id: 'owner', payload }, { 'x-offertehulp-secret': 'wrong' }],
    [{ payload }, {}],
  ]) {
    const api = setup();
    assert.equal((await api.post(body, headers)).status, 401);
    assert.deepEqual(api.calls, []);
  }
});

test('geneste payload kan de geverifieerde eigenaar niet overschrijven', async () => {
  const api = setup();
  await api.post({ user_id: 'owner', payload: { ...payload, user_id: 'other' } });
  assert.deepEqual(api.calls[0].body, { ...payload, user_id: 'owner' });
});

test('platte invoer en eigenaar uit automation-header blijven ondersteund', async () => {
  for (const [body, headers] of [
    [{ ...payload, user_id: 'owner' }, {}],
    [{ payload }, { 'x-offertehulp-user-id': 'owner' }],
  ]) {
    const api = setup();
    await api.post(body, headers);
    assert.deepEqual(api.calls[0].body, { ...payload, user_id: 'owner' });
  }
});

test('ongeldige payload bereikt create niet', async () => {
  for (const body of [null, [], 'invalid']) {
    const api = setup();
    assert.equal((await api.post(body)).status, 400);
    assert.deepEqual(api.calls, []);
  }
});
