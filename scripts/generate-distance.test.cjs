const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const source = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/app/api/generate-distance/route.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function setup(responses, env = { GOOGLE_GEOCODING_API_KEY: 'test-key' }) {
  const calls = [];
  const exports = {};
  vm.runInNewContext(source, {
    exports, process: { env }, console: { warn() {} }, Response, URLSearchParams,
    AbortSignal, AbortController, setTimeout, clearTimeout,
    require(name) {
      if (name === 'next/server') return { NextResponse: Response };
      if (name === '@/firebase/admin') return { initFirebaseAdmin: () => ({
        auth: { verifyIdToken: async () => ({ uid: 'test-user' }) },
      }) };
      if (name === '@/lib/demo-trial-server') return { ensureDemoTrialActiveByUid: async () => null };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    async fetch(url, options) {
      calls.push({ url, options });
      assert.ok(responses.length, 'Unexpected provider request');
      const next = responses.shift();
      return Response.json(next.body, { status: next.status || 200 });
    },
  });
  return { calls, post: () => exports.POST(new Request('http://localhost/api/generate-distance', {
    method: 'POST', headers: { authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ originAddress: 'Amsterdam', destinationAddress: 'Heerhugowaard' }),
  })) };
}

const googleDenied = { body: { status: 'REQUEST_DENIED', error_message: 'API not authorized' } };

test('Google denial falls back to production n8n and returns its distance', async () => {
  const api = setup([googleDenied, { body: { distanceKmOneWay: 49, distanceKmRoundTrip: 98, durationMinOneWay: 57 } }]);
  const response = await api.post();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).distanceKmOneWay, 49);
  assert.equal(api.calls.length, 2);
  assert.match(api.calls[1].url, /\/webhook\//);
  assert.doesNotMatch(api.calls[1].url, /webhook-test/);
});

test('successful Google route does not call n8n', async () => {
  const api = setup([{ body: { status: 'OK', rows: [{ elements: [{ status: 'OK', distance: { value: 49000 }, duration: { value: 3420 } }] }] } }]);
  const result = await (await api.post()).json();
  assert.equal(result.distanceKmRoundTrip, 98);
  assert.equal(result.durationMinOneWay, 57);
  assert.equal(api.calls.length, 1);
});

test('n8n works without a Google key and derives one-way distance from return trip', async () => {
  const api = setup([{ body: { roundTripDistanceKm: 98 } }], {});
  const result = await (await api.post()).json();
  assert.equal(result.distanceKmOneWay, 49);
  assert.equal(result.distanceKmRoundTrip, 98);
});

test('a failed fallback is surfaced as an error', async () => {
  const api = setup([googleDenied, { status: 503, body: { error: 'Route unavailable' } }]);
  const response = await api.post();
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /Route unavailable/);
});

test('an empty distance is not saved as a successful zero-kilometre route', async () => {
  const api = setup([googleDenied, { body: { distanceKmOneWay: 0, distanceKmRoundTrip: 0 } }]);
  const response = await api.post();
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /geen geldige afstand/);
});
