/* eslint-disable @typescript-eslint/no-var-requires */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadTypeScript(file, dependencies, environment) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  new Function('require', 'module', 'exports', 'process', code)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, loadedModule, loadedModule.exports, { env: environment });
  return loadedModule.exports;
}

function loadRoute(rows = {}, environment = { N8N_HEADER_SECRET: 'test-secret', CALVORA_USER_ID: 'owner' }) {
  const calls = [];
  const firestore = { collection: (collection) => ({ where: (field, operator, userId) => ({
    get: async () => {
      calls.push([collection, field, operator, userId]);
      assert.equal(field, 'userId');
      assert.equal(operator, '==');
      return { docs: (rows[collection] || []).filter((row) => row.userId === userId)
        .map((row) => ({ id: row.id, data: () => row })) };
    },
  }) }) };
  const helper = loadTypeScript('src/lib/quote-visit-reminder.ts', {});
  const route = loadTypeScript('src/app/api/offertes/concept-reminder/route.ts', {
    crypto: require('node:crypto'),
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/firebase/admin': { initFirebaseAdmin: () => ({ firestore }) },
    '@/lib/quote-visit-reminder': helper,
  }, environment);
  return { GET: route.GET, calls };
}

function quote(id = 'quote', patch = {}) {
  return { id, userId: 'owner', status: 'concept', clientId: 'client', offerteNummer: 260123,
    createdAt: { seconds: 1577836800 }, klantinformatie: { voornaam: 'Test', achternaam: 'Klant' }, ...patch };
}

function meeting(quoteId = 'quote', patch = {}) {
  return { id: `visit-${quoteId}`, userId: 'owner', quoteId, planningType: 'werkbespreking',
    status: 'scheduled', startDate: { _seconds: 1577959200 }, endDate: { seconds: 1577962800 }, ...patch };
}

function request(headers = { 'x-offertehulp-secret': 'test-secret' }) {
  return new Request('http://localhost/api/offertes/concept-reminder', { headers });
}

test('automation response is visit-only, scoped to the owner and excludes a concept without a visit', async () => {
  const { GET, calls } = loadRoute({
    quotes: [quote('visited', { status: 'werkbespreking' }), quote('unvisited', { clientId: 'another' }),
      quote('other-owner', { userId: 'different' })],
    planning_entries: [meeting('visited'), meeting('other-owner', { userId: 'different' })],
  });
  const response = await GET(request());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(body.visitsOnly, true);
  assert.equal(body.shouldAlert, true);
  assert.equal(body.count, 1);
  assert.equal(body.timezone, 'Europe/Amsterdam');
  assert.deepEqual(body.quotes.map((entry) => entry.id), ['visited']);
  assert.equal(body.quotes[0].planningEntryId, 'visit-visited');
  assert.match(body.quotes[0].visitedAt, /^2020-/);
  assert.deepEqual(calls.map(([collection]) => collection).sort(), ['invoices', 'planning_entries', 'quotes']);
  assert.ok(calls.every((call) => call[3] === 'owner'));
});

test('paid combined invoices sign off every related quote, including stale concepts', async () => {
  const { GET } = loadRoute({
    quotes: ['direct', 'combined', 'context'].map((id) => quote(id)),
    planning_entries: [meeting('direct')],
    invoices: [{ id: 'invoice', userId: 'owner', status: 'gedeeltelijk_betaald',
      quoteId: 'direct', combinedQuoteIds: ['combined'], combinedContext: { quoteIds: ['context'] } }],
  });
  const body = await (await GET(request())).json();
  assert.equal(body.visitsOnly, true);
  assert.equal(body.shouldAlert, false);
  assert.equal(body.count, 0);
  assert.deepEqual(body.quotes, []);
});

test('pending visits and sent quotes do not produce a Telegram reminder', async () => {
  const { GET } = loadRoute({
    quotes: [quote('pending'), quote('sent', { status: 'verzonden', clientId: 'different' })],
    planning_entries: [meeting('pending', { status: 'pending' }), meeting('sent')],
  });
  const body = await (await GET(request())).json();
  assert.equal(body.shouldAlert, false);
});

test('missing or incorrect secret cannot read any quote, invoice or planning data', async () => {
  for (const headers of [{}, { 'x-offertehulp-secret': 'incorrect' }]) {
    const { GET, calls } = loadRoute();
    assert.equal((await GET(request(headers))).status, 401);
    assert.deepEqual(calls, []);
  }
  const { GET, calls } = loadRoute({}, {});
  assert.equal((await GET(request())).status, 401);
  assert.deepEqual(calls, []);
});
