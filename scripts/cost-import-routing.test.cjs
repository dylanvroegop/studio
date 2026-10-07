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
    collection(name) {
      return {
        where: () => ({ get: async () => ({ docs: name === 'quotes' ? [{ id: 'casper', data: () => ({ offerteNummer: 260420 }) }] : [] }) }),
        doc: () => ({ id: 'pending-id', set: async (value) => { stored = value; } }),
      };
    },
  };
  const { queuePendingCostImport } = loadSource('src/lib/pending-cost-imports.ts', {
    '@/firebase/admin': { initFirebaseAdmin: () => ({ firestore }) },
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
