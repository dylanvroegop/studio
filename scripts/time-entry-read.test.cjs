const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadRoute() {
  const calls = [];
  const query = {};
  for (const method of ['select', 'eq', 'order']) {
    query[method] = (...args) => { calls.push([method, ...args]); return query; };
  }
  query.limit = async (limit) => {
    calls.push(['limit', limit]);
    return { data: [{ id: 'today-entry' }], error: null };
  };
  const dependencies = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/firebase/admin': { initFirebaseAdmin: () => ({ auth: {
      verifyIdToken: async () => ({ uid: 'signed-in-user' }),
    } }) },
    '@/lib/demo-trial-server': { ensureDemoTrialActiveByUid: async () => null },
    '@/lib/supabase-admin': { supabaseAdmin: {
      from: (table) => { calls.push(['from', table]); return query; },
    } },
  };
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/app/api/uren/entries/route.ts'), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return { GET: module.exports.GET, calls };
}

function request(query = '') {
  return new Request(`http://localhost/api/uren/entries${query}`, {
    headers: { Authorization: 'Bearer test-token' },
  });
}

test('today reads filter by owner, date and selected quote before limiting', async () => {
  const { GET, calls } = loadRoute();
  const response = await GET(request('?workDate=2026-09-25&quoteId=quote-a&limit=1000'));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    ['from', 'time_entries'], ['select', '*'], ['eq', 'user_id', 'signed-in-user'],
    ['eq', 'work_date', '2026-09-25'], ['eq', 'quote_id', 'quote-a'],
    ['order', 'created_at', { ascending: false }], ['limit', 1000],
  ]);
});

test('existing history callers retain their unfiltered date range and result format', async () => {
  const { GET, calls } = loadRoute();
  const response = await GET(request());
  assert.deepEqual(await response.json(), { ok: true, data: [{ id: 'today-entry' }] });
  assert.deepEqual(calls.filter(([method]) => method === 'eq'), [['eq', 'user_id', 'signed-in-user']]);
  assert.deepEqual(calls.at(-1), ['limit', 200]);
});

test('invalid date is rejected without querying data', async () => {
  const { GET, calls } = loadRoute();
  const response = await GET(request('?workDate=yesterday'));
  assert.equal(response.status, 400);
  assert.deepEqual(calls, []);
});

test('missing authentication cannot query hours', async () => {
  const { GET, calls } = loadRoute();
  const response = await GET(new Request('http://localhost/api/uren/entries?workDate=2026-09-25'));
  assert.equal(response.status, 401);
  assert.deepEqual(calls, []);
});
