const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadSource(filename, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', filename), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)((name) => {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Onverwachte dependency: ${name}`);
  }, module, module.exports);
  return module.exports;
}

const costs = loadSource('src/lib/project-costs.ts');
const routing = loadSource('src/lib/cost-import-routing.ts', { './project-costs': costs });

test('btw blijft bij de juiste categorie als het regeltarief ontbreekt', () => {
  assert.equal(routing.costLineInclusive({ total_price: 44.03 }, 21), 53.28);
  assert.equal(routing.costLineInclusive({ total_price: 43, btw_percentage: 0 }, 21), 43);
  assert.equal(routing.costLineInclusive({ total_price: -26.07 }, 21), -31.54);
  assert.equal(routing.costLineInclusive({ total_price: 10, total_incl_btw: 0 }, 21), 0);
});

test('gemengde factuur met offertenummer moet langs gereedschapcontrole', () => {
  assert.equal(routing.costImportHasTools({
    suggested_category: 'materiaal', offerte_reference: '260420',
    line_items: [{ category: 'materiaal' }, { category: 'gereedschap' }],
  }), true);
  assert.equal(routing.costImportHasTools({ category: 'gereedschap' }), true);
  assert.equal(routing.costImportHasTools({ suggested_category: 'materiaal', line_items: [{ category: 'materiaal' }] }), false);
});

test('gereedschap blijft algemene kosten; materiaal behoudt zijn offerte', () => {
  assert.equal(routing.costQuoteId('gereedschap', 'casper'), null);
  assert.equal(routing.costQuoteId('materiaal', 'casper'), 'casper');
  assert.equal(routing.costQuoteId('materiaal', null), null);
});

test('wachtrij bewaart factuurbedragen en vindt offerte, zonder gereedschap eraan te koppelen', async () => {
  let stored;
  const firestore = {
    runTransaction: async fn => fn({ get: async () => ({ exists: false }), create: (_ref, value) => { stored = value; } }),
    collection(name) {
      return {
        where: () => ({ get: async () => ({ docs: name === 'quotes' ? [{ id: 'casper', data: () => ({ offerteNummer: 260420 }) }] : [] }) }),
        doc: () => ({ id: 'pending-id', set: async (value) => { stored = value; } }),
      };
    },
  };
  const { queuePendingCostImport } = loadSource('src/lib/pending-cost-imports.ts', {
    'node:crypto': require('node:crypto'),
    '@/lib/cost-document-policy': loadSource('src/lib/cost-document-policy.ts', { 'node:crypto': require('node:crypto') }),
    '@/firebase/admin': { initFirebaseAdmin: () => ({ firestore }) },
    '@/lib/purchase-product-category-server': { classifyPurchaseLines: async (_uid, lines) => ({ lines, uncertain: [] }) },
    '@/lib/gps-purchase-link-server': { enrichPurchaseFromGps: async (_uid, payload) => payload },
    '@/lib/cost-import-routing': routing,
    '@/lib/project-costs': costs,
  });
  const result = await queuePendingCostImport('owner', {
    offerte_reference: 'Offerte 260420', amount_excl_btw: 854.42, amount_incl_btw: 1033.84,
    payment_status: 'openstaand', suggested_category: 'materiaal',
    line_items: [{ category: 'materiaal', total_price: 710.38 }, { category: 'gereedschap', total_price: 144.04, offerte_id: 'casper' }],
  });
  assert.equal(result.id, 'pending-id');
  assert.equal(stored.payload.offerte_id, 'casper');
  assert.equal(stored.payload.line_items[1].offerte_id, null);
  assert.equal(stored.payload.amount_excl_btw, 854.42);
  assert.equal(stored.payload.amount_incl_btw, 1033.84);
  assert.equal(stored.payload.payment_status, 'openstaand');
  assert.equal(stored.payload.review_reason, 'gereedschap');
});

test('automatische boeking behoudt bedragen, boekt onbekend als Overig en houdt gereedschap los van de offerte', () => {
  const lines = [
    { description: 'Onbekend product', category: 'materiaal', total_price: 100, total_incl_btw: 121, offerte_id: 'quote' },
    { description: 'Boormachine', category: 'gereedschap', total_price: 50, offerte_id: 'quote' },
    { description: 'Gipsplaat', category: 'materiaal', total_price: 25, offerte_id: 'quote' },
  ];
  const actual = routing.automaticCostLines(lines, ['Onbekend product']);
  assert.deepEqual(actual.map(x => x.category), ['overig', 'gereedschap', 'materiaal']);
  assert.deepEqual(actual.map(x => x.offerte_id), [null, null, 'quote']);
  assert.equal(actual[0].total_price, 100);
  assert.equal(actual[0].total_incl_btw, 121);
  assert.equal(lines[0].category, 'materiaal');
});
