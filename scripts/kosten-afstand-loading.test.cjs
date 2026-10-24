const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function mount(getIdToken, fetch, storage = new Map(), dates = ['2026-10-01', '2026-10-02']) {
  let effect;
  let latest;
  let slot = 0;
  const timers = new Map();
  let next = 0;
  const react = { createElement: () => null, useEffect: (fn) => { effect = fn; }, useState: (value) => {
    const id = slot++;
    return [value, (nextValue) => { if (id === 0) latest = nextValue; }];
  } };
  const code = ts.transpileModule(fs.readFileSync('src/components/kosten/KostenAfstandRow.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const context = { exports: {}, AbortController, URLSearchParams, Intl, Date, JSON, Number, Promise, React: react, fetch,
    window: { setTimeout: (fn, delay) => { timers.set(++next, { fn, delay }); return next; }, clearTimeout: (id) => timers.delete(id) },
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    require: (name) => name === 'react' ? react : name === '@/firebase' ? { useUser: () => ({ user: { uid: 'test', getIdToken } }) } : { gpsDistanceKm: () => 12, amsterdamMidnight: (date) => `${date}T00:00:00Z` },
  };
  vm.runInNewContext(code, context);
  context.exports.KostenAfstandRow({ dates, cell: '', fuelCost: 100 });
  const cleanup = effect();
  return { latest: () => latest, deadline: () => [...timers.values()].find((timer) => timer.delay === 600000).fn(), cleanup };
}

test('vastgelopen token eindigt in onbekend met retry in plaats van eindeloos laden', () => {
  const view = mount(() => new Promise(() => {}), () => { throw new Error('niet verwacht'); });
  view.deadline();
  assert.equal(view.latest().done, true);
  assert.equal(view.latest().missing, 2);
  assert.equal(view.latest().measured, 0);
  view.cleanup();
});

test('eerste kilometers worden getoond terwijl andere dag nog laadt; deadline bewaart deeltotaal', async () => {
  let calls = 0;
  const view = mount(async () => 'token', async () => ++calls === 1 ? { ok: true, json: async () => ({ ok: true, data: [] }) } : new Promise(() => {}));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(view.latest().km, 12);
  assert.equal(view.latest().completed, 1);
  assert.equal(view.latest().done, false);
  view.deadline();
  assert.equal(view.latest().km, 12);
  assert.equal(view.latest().missing, 1);
  assert.equal(view.latest().done, true);
  view.cleanup();
});


test('opgeslagen historische dagen verschijnen direct zonder token of GPS-verzoek', async () => {
  const storage = new Map(['2026-10-01', '2026-10-02'].map((date) => [`kosten-gps-afstand-v1:test:${date}`, JSON.stringify({ km: 25, at: Date.parse('2026-10-05T12:00:00Z') })]));
  let requests = 0;
  const view = mount(async () => { requests++; return 'token'; }, async () => { requests++; }, storage);
  assert.equal(view.latest().km, 50);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests, 0);
  assert.equal(view.latest().done, true);
  view.cleanup();
});

test('nieuwe dag wordt toegevoegd zonder oude dagen opnieuw op te halen', async () => {
  const storage = new Map([['kosten-gps-afstand-v1:test:2026-10-01', JSON.stringify({ km: 25, at: Date.parse('2026-10-05T12:00:00Z') })]]);
  let requests = 0;
  const view = mount(async () => 'token', async () => { requests++; return { ok: true, json: async () => ({ ok: true, data: [] }) }; }, storage);
  assert.equal(view.latest().km, 25);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests, 1);
  assert.equal(view.latest().km, 37);
  assert.ok(storage.has('kosten-gps-afstand-v1:test:2026-10-02'));
  view.cleanup();
});
