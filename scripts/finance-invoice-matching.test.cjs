const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

// Alleen de pure matching laden; deze tests mogen geen database benaderen.
function loadSource(filename, dependencies = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)((name) => {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Onverwachte dependency: ${name}`);
  }, module, module.exports);
  return module.exports;
}

const costsModule = loadSource('src/lib/project-costs.ts');
const { buildFinanceBankLedger, splitFinanceBankLedgerRowsByCategory } = loadSource(
  'src/lib/finance-bank-ledger.ts',
  { '@/lib/project-costs': costsModule, '@/lib/supabase-admin': {}, '@/lib/finance-cost-visibility': loadSource('src/lib/finance-cost-visibility.ts'),
    '@/lib/confirmed-bank-categories': loadSource('src/lib/confirmed-bank-categories.ts') },
);

const costs = [
  ['materiaal', 710.38, 859.55],
  ['gereedschap', 144.04, 174.29],
].map(([category, excl, incl]) => costsModule.mapProjectCostRow({
  id: category,
  user_id: 'test-user',
  supplier_name: 'DSG Bouwmaten B.V.',
  supplier_invoice_number: '1000VF003543018',
  category,
  date: '2026-09-09',
  amount_excl_btw: excl,
  amount_incl_btw: incl,
  payment_type: 'factuur',
  payment_status: 'openstaand',
}));
const transaction = {
  id: 'betaling-na-twee-weken',
  amount: -1033.84,
  booking_date: '2026-09-23',
  counterparty_name: 'Stichting Derdengelden Bouwmaat Nederland',
  description: 'Incasso factuur 1000VF003543018',
};

test('DSG Bouwmaten-factuur wordt volledig aan latere Bouwmaat-incasso gekoppeld', () => {
  const rows = buildFinanceBankLedger({ userId: 'test-user', costs, transactions: [transaction] });
  assert.equal(rows[0].match_status, 'matched');
  assert.deepEqual(new Set(rows[0].source_cost_ids), new Set(['materiaal', 'gereedschap']));
  const split = splitFinanceBankLedgerRowsByCategory({ rows, costs });
  assert.equal(Math.round(split.reduce((sum, row) => sum + row.amount, 0) * 100), 103384);
  assert.equal(split.length, 2);
  assert.ok(costs.every((cost) => cost.payment_status === 'openstaand'));
});

test('zelfde bedrag met ander factuurnummer wordt niet gekoppeld', () => {
  const rows = buildFinanceBankLedger({ userId: 'test-user', costs, transactions: [
    { ...transaction, description: 'Incasso factuur 1000VF009999999' },
  ] });
  assert.equal(rows[0].match_status, 'unmatched');
});

test('dezelfde bronkosten tellen bij twee betalingen niet twee keer mee', () => {
  const rows = buildFinanceBankLedger({ userId: 'test-user', costs, transactions: [
    transaction, { ...transaction, id: 'tweede-betaling' },
  ] });
  assert.equal(rows.flatMap((row) => row.source_cost_ids).length, 2);
  assert.equal(rows.filter((row) => row.match_status === 'matched').length, 1);
});

const { visibleUnmatchedSources } = loadSource('src/lib/finance-cost-visibility.ts');
test('contante bon blijft zichtbaar en koppelt niet aan gelijk bankbedrag', () => {
  const cash = { ...costs[0], status: 'paid_cash' };
  const rows = buildFinanceBankLedger({ userId: 'test-user', costs: [cash], transactions: [{ ...transaction, amount: -cash.amount_incl_btw }] });
  assert.equal(rows[0].source_cost_ids.length, 0);
  assert.equal(visibleUnmatchedSources([cash], new Set())[0].status, 'paid_cash');
});
test('alle ongekoppelde bronnen blijven ter controle zichtbaar, ook zonder bankhistorie', () => {
  const rows = visibleUnmatchedSources(costs, new Set());
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.status === 'unmatched_source_cost'));
  assert.equal(visibleUnmatchedSources(costs, new Set(['materiaal'])).length, 1);
  assert.equal(costs[0].status, 'confirmed');
});

test('bankhistorie wordt volledig geladen voorbij de database paginalimiet', async () => {
  const transactions = Array.from({ length: 1201 }, (_, index) => ({ id: String(index), amount: -1 }));
  const ranges = [];
  const db = { from(table) {
    const query = {
      select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; }, limit() { return this; },
      maybeSingle: async () => ({ data: { id: 'connection', linked_account_ids: ['account'] } }),
      then(resolve) { return Promise.resolve({ data: [{ id: 'account' }] }).then(resolve); },
      range(start, end) { ranges.push([start, end]); return Promise.resolve({ data: transactions.slice(start, end + 1) }); },
    };
    return query;
  } };
  const { loadConnectedKnabTransactions } = loadSource('src/lib/finance-bank-ledger.ts', {
    '@/lib/confirmed-bank-categories': loadSource('src/lib/confirmed-bank-categories.ts'),
    '@/lib/project-costs': costsModule,
    '@/lib/supabase-admin': { supabaseAdmin: db },
    '@/lib/finance-cost-visibility': loadSource('src/lib/finance-cost-visibility.ts'),
  });
  const result = await loadConnectedKnabTransactions('user');
  assert.equal(result.length, 1201);
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]]);
});
