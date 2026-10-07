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
  { '@/lib/project-costs': costsModule, '@/lib/supabase-admin': {} },
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
