const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function load(file, dependencies = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => dependencies[name] || require(name), mod, mod.exports);
  return mod.exports;
}
const { requestKnab, KnabRequestError } = load('src/lib/knab-refresh-client.ts');
const user = { getIdToken: async () => 'test-token' };
const json = (body, status = 200) => Response.json(body, { status });

test('vernieuwt een verlopen app-token één keer en verstuurt geen gecachte aanvraag', async t => {
  const tokens = [], requests = [];
  t.mock.method(global, 'fetch', async (url, init) => {
    requests.push(init);
    return requests.length === 1 ? json({ ok: false }, 401) : json({ ok: true, status: 'connected' });
  });
  const result = await requestKnab({ getIdToken: async force => { tokens.push(force); return force ? 'fresh' : 'old'; } }, '/sync', { method: 'POST' });
  assert.equal(result.ok, true);
  assert.deepEqual(tokens, [false, true]);
  assert.equal(requests[1].headers.get('Authorization'), 'Bearer fresh');
  assert.equal(requests[1].cache, 'no-store');
});

test('verlopen banktoestemming houdt de echte fout en biedt opnieuw koppelen', async t => {
  t.mock.method(global, 'fetch', async () => json({ ok: false, status: 'EXPIRED', error: 'Enable Banking status: EXPIRED' }, 409));
  await assert.rejects(requestKnab(user, '/sync'), error => error instanceof KnabRequestError && error.reconnectRequired && error.message.includes('EXPIRED'));
});

test('geen bankkoppeling is herstelbaar via dezelfde knop', async t => {
  t.mock.method(global, 'fetch', async () => json({ ok: false, reconnectRequired: true, error: 'Koppel eerst je Knab-rekening.' }, 400));
  await assert.rejects(requestKnab(user, '/sync'), error => error.reconnectRequired);
});

test('serverstoring wordt niet aangezien voor verlopen banktoestemming', async t => {
  t.mock.method(global, 'fetch', async () => json({ ok: false, error: 'Database tijdelijk onbereikbaar' }, 500));
  await assert.rejects(requestKnab(user, '/sync'), error => !error.reconnectRequired && error.message === 'Database tijdelijk onbereikbaar');
});

test('HTML-timeout van hosting levert een bruikbare melding', async t => {
  t.mock.method(global, 'fetch', async () => new Response('<html>Timeout</html>', { status: 504 }));
  await assert.rejects(requestKnab(user, '/sync'), /Knab reageert te langzaam/);
});

test('offline en een hangende mobiele aanvraag blijven opnieuw te proberen', async t => {
  t.mock.method(global, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(requestKnab(user, '/sync'), /Controleer je internet/);
  t.mock.method(global, 'fetch', (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
  await assert.rejects(requestKnab(user, '/sync', {}, 5), /Knab reageert te langzaam/);
});

function callback({ result = 'connected', returnTo = '/kosten?tab=totalen', error = false } = {}) {
  let sessions = 0;
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: 'connection', user_id: 'owner', metadata: { returnTo } } }), update: () => ({ eq: async () => ({}) }) };
  const { GET } = load('src/app/api/bank/enablebanking/callback/route.ts', {
    '@/lib/supabase-admin': { supabaseAdmin: { from: () => query } },
    '@/lib/enable-banking/client': { createSession: async () => { sessions++; return { sessionId: 'session', accounts: ['account'], raw: {} }; } },
    '@/lib/enable-banking/sync': { syncEnableBankingConnection: async () => ({ status: result }) },
  });
  return { run: () => GET(new Request(`https://studio.example/api/bank/enablebanking/callback?state=state&${error ? 'error=access_denied' : 'code=code'}`)), sessions: () => sessions };
}

test('succesvolle koppeling keert direct terug naar Kosten / Totalen', async () => {
  const response = await callback().run();
  const url = new URL(response.headers.get('location'));
  assert.equal(url.pathname, '/kosten');
  assert.equal(url.searchParams.get('tab'), 'totalen');
  assert.equal(url.searchParams.get('bank'), 'connected');
});

test('geannuleerde koppeling keert terug naar Totalen zonder sessie aan te maken', async () => {
  const flow = callback({ error: true });
  const url = new URL((await flow.run()).headers.get('location'));
  assert.equal(flow.sessions(), 0);
  assert.equal(url.searchParams.get('tab'), 'totalen');
  assert.equal(url.searchParams.get('bank'), 'error');
});

test('niet-actieve sessie wordt nooit als geslaagde koppeling gepresenteerd', async () => {
  const url = new URL((await callback({ result: 'EXPIRED' }).run()).headers.get('location'));
  assert.equal(url.searchParams.get('bank'), 'error');
});

test('terugkeer is beperkt tot eigen kostenpagina, geen externe redirect', async () => {
  const url = new URL((await callback({ returnTo: 'https://evil.example' }).run()).headers.get('location'));
  assert.equal(url.origin, 'https://studio.example');
  assert.equal(url.pathname, '/kosten');
  assert.equal(url.searchParams.get('tab'), 'overview');
});
