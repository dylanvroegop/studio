const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
function load(file, deps = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)((name) => deps[name] || require(name), module, module.exports);
  return module.exports;
}
const ai = load('src/lib/finance-bank-category-ai.ts', {
  '@/firebase/admin': {}, '@/lib/project-costs': load('src/lib/project-costs.ts'),
});
const row = { category: 'overig', bank_transaction_id: 'bank', is_private: false, source_cost_ids: [], supplier_name: 'Tamoil', description: 'Tankbeurt', amount: 111.61, booking_date: '2026-08-31' };
test('alleen oningedeelde bankbetalingen zonder handmatige keuze of bron', () => {
  assert(ai.eligibleForCategoryAi(row, new Map()));
  for (const change of [{ category: 'materiaal' }, { is_private: true }, { source_cost_ids: ['bon'] }]) {
    assert(!ai.eligibleForCategoryAi({ ...row, ...change }, new Map()));
  }
  assert(!ai.eligibleForCategoryAi(row, new Map([['bank', 'overig']])));
});
test('onzekerheid en ongeldige categorieën blijven overig', () => {
  assert.equal(ai.validatedAiCategory({ category: 'brandstof', confidence: 0.85, reason: 'Herkenbaar tankstation' }), 'brandstof');
  for (const decision of [null, { category: 'boetes', confidence: .5, reason: 'Onzeker' }, { category: 'profit', confidence: 1, reason: 'x' }, { category: 'eigen_verbruik', confidence: 1, reason: 'x' }, { category: 'brandstof', confidence: 1 }, { category: 'foo', confidence: 1, reason: 'x' }]) {
    assert.equal(ai.validatedAiCategory(decision), 'overig');
  }
});
test('cache hergebruiken bij nieuwe bank-ID; opnieuw beoordelen bij nieuwe omschrijving', () => {
  assert.equal(ai.categoryAiKey(row), ai.categoryAiKey({ ...row, bank_transaction_id: 'new' }));
  assert.notEqual(ai.categoryAiKey(row), ai.categoryAiKey({ ...row, description: 'Winkelverkoop' }));
});
