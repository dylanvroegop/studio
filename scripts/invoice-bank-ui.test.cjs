const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

// Kleine hook-adapter om vertraagde netwerkresponses en navigatie te testen.
// Geen browser, Firebase, Supabase of echte bankrequests worden gebruikt.
function componentFixture(t) {
  const slots = [];
  const effects = [];
  const requests = [];
  let cursor = 0;
  let dirty = true;
  let props = { invoiceId: 'invoice-a', refreshKey: 'initial' };
  let tree;
  const same = (left, right) => left && right && left.length === right.length && left.every((item, index) => Object.is(item, right[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (update) => {
        const value = typeof update === 'function' ? update(slots[index]) : update;
        if (!Object.is(value, slots[index])) { slots[index] = value; dirty = true; }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(callback, dependencies) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].dependencies, dependencies)) slots[index] = { callback, dependencies };
      return slots[index].callback;
    },
    useEffect(callback, dependencies) {
      const index = cursor++;
      const saved = slots[index];
      if (saved && same(saved.dependencies, dependencies)) return;
      slots[index] = { dependencies, cleanup: saved?.cleanup };
      effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = callback(); });
    },
  };
  const user = { uid: 'owner', getIdToken: async () => 'test-token' };
  const dependencies = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' },
    'next/link': { default: 'a' }, 'lucide-react': { Loader2: 'icon', RefreshCw: 'icon' },
    '@/firebase': { useUser: () => ({ user }) }, '@/components/ui/button': { Button: 'button' },
    '@/components/ui/dialog': Object.fromEntries(['Dialog', 'DialogContent', 'DialogFooter', 'DialogHeader', 'DialogTitle'].map((name) => [name, name])),
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', 'src/components/invoice/InvoiceBankPayments.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Onverwachte dependency: ${name}`);
  }, module, module.exports);
  const originalFetch = global.fetch;
  global.fetch = (url, options) => new Promise((resolve) => {
    requests.push({ url, options, respond: (data) => resolve({ ok: true, json: async () => ({ ok: true, ...data }) }) });
  });
  t.after(() => { global.fetch = originalFetch; slots.forEach((slot) => slot?.cleanup?.()); });
  function render(nextProps) {
    if (nextProps) { props = nextProps; dirty = true; }
    for (let count = 0; dirty && count < 25; count += 1) {
      dirty = false; cursor = 0; tree = module.exports.InvoiceBankPayments(props);
      while (effects.length) effects.shift()();
    }
    assert.equal(dirty, false, 'render mag niet blijven herhalen');
    return tree;
  }
  async function tick() { await new Promise(setImmediate); render(); await new Promise(setImmediate); render(); }
  function textOf(node) {
    if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (Array.isArray(node)) return node.map(textOf).join(' ');
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    return textOf(node.props?.children);
  }
  function buttons(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(buttons);
    return [...(node.type === 'button' ? [node] : []), ...buttons(node.props?.children)];
  }
  return { render, tick, requests, text: () => textOf(tree),
    check: () => buttons(tree).find((button) => textOf(button).includes('Controleer betalingen')) };
}
const view = (linkedCents = 0) => ({ connected: true, lastSyncedAt: '2026-10-06T10:00:00Z',
  linkedCents, openCents: 10000 - linkedCents, unlinkedPaidCents: 0, candidates: [] });

test('dubbele tik geeft één sync; navigeren tijdens sync blokkeert oude POST en opnieuw openen blijft werken', async (t) => {
  const ui = componentFixture(t);
  ui.render(); await ui.tick();
  ui.requests[0].respond({ data: view() }); await ui.tick();
  const check = ui.check().props.onClick;
  check(); check(); await ui.tick();
  assert.equal(ui.requests.length, 2);
  assert.equal(ui.requests[1].url, '/api/bank/sync-enablebanking');
  ui.render({ invoiceId: 'invoice-b', refreshKey: 'initial' }); await ui.tick();
  ui.requests[2].respond({ data: view(2000) }); await ui.tick();
  ui.requests[1].respond({ invoiceMatching: { applied: 0, remaining: 0, warnings: [] } }); await ui.tick();
  assert.equal(ui.requests.length, 3, 'oude sync mag geen reconcile POST voor verlaten factuur starten');
  assert.match(ui.text(), /20,00/);
  ui.render({ invoiceId: 'invoice-a', refreshKey: 'initial' }); await ui.tick();
  assert.equal(ui.requests.length, 4, 'oude mutatiereferentie mag terugkeer niet blokkeren');
  ui.requests[3].respond({ data: view() }); await ui.tick();
  assert.equal(ui.check().props.disabled, false);
});

test('late POST van factuur A overschrijft betaalgegevens van factuur B niet', async (t) => {
  const ui = componentFixture(t);
  ui.render(); await ui.tick(); ui.requests[0].respond({ data: view() }); await ui.tick();
  ui.check().props.onClick(); await ui.tick();
  ui.requests[1].respond({ invoiceMatching: { applied: 0, remaining: 0, warnings: [] } }); await ui.tick();
  assert.equal(ui.requests[2].options.method, 'POST');
  ui.render({ invoiceId: 'invoice-b', refreshKey: 'initial' }); await ui.tick();
  ui.requests[3].respond({ data: view(2000) }); await ui.tick();
  ui.requests[2].respond({ data: view(10000), applied: 1 }); await ui.tick();
  assert.match(ui.text(), /20,00/);
  assert.doesNotMatch(ui.text(), /100,00/);
  assert.equal(ui.check().props.disabled, false);
});

test('snapshot-refresh tijdens boeking leest na de POST opnieuw en hergebruikt de oude response niet', async (t) => {
  const ui = componentFixture(t);
  ui.render(); await ui.tick(); ui.requests[0].respond({ data: view() }); await ui.tick();
  ui.check().props.onClick(); await ui.tick();
  ui.render({ invoiceId: 'invoice-a', refreshKey: 'paid' }); await ui.tick();
  assert.equal(ui.requests.length, 2, 'refresh wacht op lopende mutatie');
  ui.requests[1].respond({ invoiceMatching: { applied: 1, remaining: 0, warnings: [] } }); await ui.tick();
  ui.requests[2].respond({ data: view(10000), applied: 0 }); await ui.tick();
  assert.equal(ui.requests[3].options.method, 'GET');
  ui.requests[3].respond({ data: view(10000) }); await ui.tick();
  assert.match(ui.text(), /100,00.*via Knab bevestigd voor deze factuur/);
  assert.equal(ui.check().props.disabled, false);
});
