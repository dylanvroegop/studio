const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs', moduleResolution: 'node' });
require('ts-node/register/transpile-only');
const model = require('../src/lib/vision/model');
const evidence = require('../src/lib/vision/evidence');
const projection = require('../src/lib/vision/projection');

function moduleWith(file, deps) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (key) => (Object.hasOwn(deps, key) ? deps[key] : require(key)),
    mod,
    mod.exports,
  );
  return mod.exports;
}
function setup() {
  const rows = new Map(),
    calls = [];
  const http = moduleWith('src/lib/vision/http.ts', {
    '@/lib/bank-api-auth': {
      resolveUid: async (req) => {
        const uid = req.headers.get('Authorization');
        if (!uid) throw Error();
        return uid;
      },
    },
    '@/lib/demo-trial-server': { ensureDemoTrialActiveByUid: async () => null },
  });
  const deps = {
    '@/lib/vision/http': http,
    '@/lib/vision/model': model,
    '@/lib/vision/projection': projection,
    '@/lib/vision/evidence': evidence,
    '@/lib/vision/storage': {
      loadWorkspace: async (uid) => rows.get(uid) ?? { revision: 0, document: model.emptyWorkspace() },
      saveWorkspace: async (uid, revision, document) => {
        if ((rows.get(uid)?.revision ?? 0) !== revision) return false;
        rows.set(uid, { revision: revision + 1, document });
        return true;
      },
    },
    '@/lib/vision/finance-server': {
      readFinances: async () => {
        calls.push('finance');
        return projection.noFinance();
      },
    },
  };
  return {
    rows,
    calls,
    api: moduleWith('src/app/api/vision/route.ts', deps),
    ai: moduleWith('src/app/api/vision/ai/route.ts', deps),
  };
}
function request(uid, body) {
  return new Request('https://example.invalid/api/vision', {
    method: body ? 'POST' : 'GET',
    headers: uid ? { Authorization: uid } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}
test('API beperkt lezen en schrijven tot de aangemelde eigenaar en bewaakt revisies', async () => {
  const { api } = setup(),
    w = model.emptyWorkspace();
  w.relationships.vision = 'Persoonlijke tekst';
  assert.equal((await api.GET(request(null))).status, 401);
  assert.equal((await api.PUT(request(null, { document: w, revision: 0 }))).status, 401);
  assert.equal(
    (await api.PUT(request('eigenaar', { user_id: 'ander', document: w, revision: 0 }))).status,
    200,
  );
  assert.equal((await (await api.GET(request('ander'))).json()).document.relationships.vision, '');
  assert.equal(
    (await (await api.GET(request('eigenaar'))).json()).document.relationships.vision,
    w.relationships.vision,
  );
  assert.equal((await api.PUT(request('eigenaar', { document: w, revision: 0 }))).status, 409);
});
test('AI stuurt alleen toegestane bronnen en weigert verzonnen bronverwijzingen', async (t) => {
  const old = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test';
  t.after(() => {
    if (old === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = old;
  });
  const { rows, calls, ai } = setup(),
    w = model.emptyWorkspace(),
    at = new Date().toISOString();
  w.notes = ['vrijgegeven', 'geheim'].map((body, i) => ({
    id: 'n' + i,
    ai: i === 0,
    created: at,
    versions: [{ ...model.blankEntry(), id: 'v' + i, at, body }],
  }));
  w.relationships.vision = 'verborgen profiel';
  rows.set('ik', { revision: 1, document: w });
  let source = 'N1';
  let requests = 0;
  t.mock.method(global, 'fetch', async (url, init) => {
    requests++;
    const body = JSON.parse(init.body);
    assert.equal(body.store, false);
    assert(body.input.includes('vrijgegeven'));
    assert(!body.input.includes('geheim'));
    assert(!body.input.includes('verborgen profiel'));
    return Response.json({
      status: 'completed',
      output: [
        {
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                findings: [
                  { kind: 'Interpretatie', theme: 'Hypothese', text: 'Een patroon', refs: [source] },
                ],
              }),
            },
          ],
        },
      ],
    });
  });
  const run = () => ai.POST(request('ik', { mode: 'themes', question: 'Thema’s', thread: '' }));
  assert.equal((await run()).status, 403);
  assert.equal(requests, 0);
  w.consent.enabled = true;
  assert.equal((await run()).status, 422);
  assert.equal(requests, 0);
  w.consent.notes = true;
  const r = await run();
  assert.equal(r.status, 200);
  const { report } = await r.json();
  assert.deepEqual(
    report.sources.map((s) => [s.note, s.version, s.date]),
    [['n0', 'v0', at]],
  );
  assert.equal(calls.length, 0);
  source = 'N9';
  assert.equal((await run()).status, 422);
  w.notes[0].ai = false;
  assert.equal((await run()).status, 422);
  assert.equal(requests, 2);
});
