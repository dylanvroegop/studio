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
  assert.equal(ai.validatedAiCategory({ category: 'brandstof', confidence: 0.95, reason: 'Herkenbaar tankstation' }), 'brandstof');
  for (const decision of [null, { category: 'boetes', confidence: .5, reason: 'Onzeker' }, { category: 'profit', confidence: 1, reason: 'x' }, { category: 'eigen_verbruik', confidence: 1, reason: 'x' }, { category: 'brandstof', confidence: 1 }, { category: 'foo', confidence: 1, reason: 'x' }]) {
    assert.equal(ai.validatedAiCategory(decision), 'overig');
  }
});
test('cache hergebruiken bij nieuwe bank-ID; opnieuw beoordelen bij nieuwe omschrijving', () => {
  assert.equal(ai.categoryAiKey(row), ai.categoryAiKey({ ...row, bank_transaction_id: 'new' }));
  assert.notEqual(ai.categoryAiKey(row), ai.categoryAiKey({ ...row, description: 'Winkelverkoop' }));
});

test('alleen expliciete omschrijving of echt geraadpleegde bron kan een AI-categorie vrijgeven', async (t) => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  t.after(() => {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  });
  const url = 'https://example.test/afval';
  t.mock.method(global, 'fetch', async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.equal(request.tools[0].type, 'web_search');
    const evidence = JSON.parse(request.input);
    assert.deepEqual(evidence[1], { index: 1, supplier: 'Provider', explicit: ['telefoon'] });
    assert.ok(!request.input.includes('Pas:'));
    assert.ok(!request.input.includes('111.61'));
    return Response.json({ status: 'completed', output: [
      { type: 'web_search_call', action: { sources: [{ url }] } },
      { content: [{ type: 'output_text', text: JSON.stringify({ decisions: [
        { index: 0, category: 'afval', confidence: .99, reason: 'Afvaldienst', source_url: url },
        { index: 1, category: 'telefoon', confidence: .99, reason: 'Abonnement', source_url: '' },
        { index: 2, category: 'afval', confidence: .99, reason: 'Afvaldienst', source_url: 'https://example.test/ongebruikt' },
      ] }) }] },
    ] });
  });
  const result = await ai.classifyBankCategories([
    { ...row, supplier_name: 'Afvalbedrijf', description: 'Pas: 1234' },
    { ...row, supplier_name: 'Provider', description: 'Telefoonabonnement Pas: 1234' },
    { ...row, supplier_name: 'Onbekend bedrijf', description: 'Pas: 1234' },
  ]);
  assert.deepEqual(result.map(({ category }) => category), ['afval', 'telefoon', 'overig']);
});

test('dezelfde bankregel op twee rekeningen deelt geen AI-besluit', async () => {
  const paths = [];
  const reference = (path = '') => ({
    collection: (name) => reference(`${path}/${name}`),
    doc: (id) => reference(`${path}/${id}`),
    path,
  });
  const scopedAi = load('src/lib/finance-bank-category-ai.ts', {
    '@/lib/project-costs': load('src/lib/project-costs.ts'),
    '@/firebase/admin': { initFirebaseAdmin: () => ({ firestore: {
      ...reference(),
      getAll: async (...docs) => {
        paths.push(docs[0].path);
        return [];
      },
    } }) },
  });
  await scopedAi.applyBankCategoryAi('owner', 'NL01KNAB0000000001', [{ ...row }], new Map(), false);
  await scopedAi.applyBankCategoryAi('owner', 'NL02KNAB0000000002', [{ ...row }], new Map(), false);
  assert.notEqual(paths[0], paths[1]);
});
