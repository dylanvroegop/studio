const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { mapProjectCostRow } = require('../src/lib/project-costs');
const { buildKnabCostList } = require('../src/lib/knab-cost-list');
const { summarizeBankCostRows } = require('../src/lib/bank-cost-summary');
const { costForCategory, originalBankCost } = require('../src/lib/bank-cost-allocation');
const { normalizeProjectCostCategory } = require('../src/lib/project-costs');
const round = (amount) => Math.round(amount * 100) / 100;
function source(id, category, amount, extra = {}) {
  const net = round(amount / 1.21);
  return mapProjectCostRow({ id, category, amount_incl_btw: amount, amount_excl_btw: net,
    btw_amount: round(amount - net), line_items: [{ description: id, quantity: 1, total_price: net, category }],
    receipt_url: `https://example.invalid/${id}.pdf`, ...extra });
}
function payment(sources, extra = {}) {
  const amount = round(sources.reduce((sum, cost) => sum + cost.amount_incl_btw, 0));
  return buildKnabCostList({ userId: 'owner', costs: sources,
    transactions: [{ id: 'payment', amount: -amount, booking_date: '2026-07-09', counterparty_name: 'Bouwmaat', ...extra.transaction }],
    ledgerRows: [{ bank_transaction_id: 'payment', category: 'materiaal', is_private: false,
      source_cost_ids: sources.map(cost => cost.id), ...extra.ledger }],
    internalTransferIds: extra.internalTransferIds || new Set(), categoryOverrides: extra.categoryOverrides,
  });
}

test('alle 13 gemengde julibetalingen tonen de opgeslagen categoriebedragen zonder extra afschrijving', () => {
  // Materiaal en investering per gecontroleerde betaling; geen mailbox- of klantgegevens.
  const examples = [[19.03,118.81], [185.37,9.21], [20.59,221.07], [114.38,11.01],
    [307.49,710.27], [452.54,6.87], [349.25,10.77], [0.22,513.49], [86.43,22.76],
    [64.60,151.13], [25.18,50.47], [0.22,314.21], [295.50,32.19]];
  for (const [materials, tools] of examples) {
    const costs = [source('material', 'materiaal', materials, { offerte_id: 'work' }), source('tool', 'gereedschap', tools)];
    const before = structuredClone(costs);
    const { data, bankReconciliation } = payment(costs);
    assert.equal(data.length, 1);
    assert.equal(bankReconciliation.transactionCount, 1);
    assert.equal(bankReconciliation.debitTotal, round(materials + tools));
    const totals = summarizeBankCostRows(data);
    assert.equal(totals.totals.alle, round(materials + tools));
    assert.equal(totals.totals.materiaal, materials);
    assert.equal(totals.totals.gereedschap, tools);
    assert.equal(totals.counts.alle, 1);
    assert.equal(totals.counts.materiaal, 1);
    assert.equal(totals.counts.gereedschap, 1);
    const portion = costForCategory(data[0], 'gereedschap');
    assert.equal(portion.amount_incl_btw, tools);
    assert.equal(portion.id, data[0].id);
    assert.equal(portion.paid_bank_transaction_id, 'payment');
    assert.equal(portion.offerte_id, null);
    assert.equal(costForCategory(data[0], 'materiaal').offerte_id, 'work');
    assert.equal(costForCategory(data[0], 'hotel'), null);
    assert.equal(originalBankCost(portion, data), data[0]);
    assert.equal(originalBankCost(portion, []), null, 'verouderde deelweergave mag geen actie starten');
    assert.equal(data[0].line_items.length, 2);
    assert.deepEqual(costs, before);
  }
});

test('meerdere offertebronnen en negatieve creditregels behouden exacte centen per categorie', () => {
  const costs = [source('wood', 'materiaal', 200, { offerte_id: 'a' }),
    source('wood-credit', 'materiaal', -50, { offerte_id: 'a' }),
    source('more-wood', 'materiaal', 20, { offerte_id: 'b' }), source('saw', 'gereedschap', 60.5)];
  const { data } = payment(costs);
  const material = costForCategory(data[0], 'materiaal');
  assert.equal(material.amount_incl_btw, 170);
  assert.equal(material.offerte_id, null);
  assert.equal(data[0].category_allocations[0].source_cost_ids.length, 3);
  assert.equal(summarizeBankCostRows(data).totals.alle, 230.5);
});

test('onvolledige of afwijkende brondocumenten worden niet naar verhouding verdeeld', () => {
  for (const scenario of ['missing', 'nonfinal', 'mismatch']) {
    const tool = scenario === 'missing' ? { receipt_url: null }
      : scenario === 'nonfinal' ? { receipt_files: [{ url: 'https://example.invalid/order.pdf', document_type: 'order_confirmation' }] } : {};
    const costs = [source('wood', 'materiaal', 121), source('tool', 'gereedschap', 60.5, tool)];
    const { data } = payment(costs, scenario === 'mismatch' ? { transaction: { amount: -150 } } : {});
    assert.equal(data[0].category_allocations, undefined);
    assert.equal(data[0].vat_known, false);
    assert.equal(data[0].btw_amount, 0);
    assert.equal(summarizeBankCostRows(data).totals.alle, scenario === 'mismatch' ? 150 : 181.5);
  }
});

test('exacte categoriebedragen kunnen bekend zijn terwijl de btw onbekend blijft', () => {
  const { data } = payment([source('wood', 'materiaal', 121, { vat_known: false }), source('tool', 'gereedschap', 60.5)]);
  assert.equal(data[0].category_allocations.length, 2);
  assert.equal(data[0].vat_known, false);
  for (const category of ['materiaal','gereedschap']) {
    assert.equal(costForCategory(data[0], category).vat_known, false);
    assert.equal(costForCategory(data[0], category).btw_amount, 0);
  }
});

test('privé, interne betalingen en bevestigde overrides krijgen geen automatische verdeling', () => {
  const costs = [source('wood', 'materiaal', 121), source('tool', 'gereedschap', 60.5)];
  for (const extra of [{ ledger: { is_private: true } }, { internalTransferIds: new Set(['payment']) },
    { ledger: { category_override: 'autokosten' } }, { categoryOverrides: new Map([['payment','autokosten']]) }]) {
    const { data } = payment(costs, extra);
    assert.equal(data[0].category_allocations, undefined);
    assert.equal(data[0].amount_incl_btw, 181.5);
    if (extra.categoryOverrides || extra.ledger?.category_override) assert.equal(data[0].category, 'autokosten');
  }
  const privateSource = source('tool', 'gereedschap', 60.5, { line_items: [{ description: 'privé', category: 'eigen_verbruik', total_price: 50 }] });
  assert.equal(payment([costs[0],privateSource]).data[0].category_allocations, undefined);
});

test('kenteken met orderbevestiging volgt expliciet Autokosten zonder factuur of verzonnen btw', () => {
  const cost = source('plate', 'autokosten', 16.94, { receipt_files: [{ url: 'https://example.invalid/order.png', document_type: 'order_confirmation' }] });
  for (const extra of [{ categoryOverrides: new Map([['payment','autokosten']]) },
    { transaction: { source_transaction_ids: ['old-payment'] }, categoryOverrides: new Map([['old-payment','autokosten']]) }]) {
    const { data } = payment([cost], extra);
    assert.equal(data[0].category, 'autokosten');
    assert.equal(data[0].category_override, 'autokosten');
    assert.equal(data[0].has_supporting_document, false);
    assert.equal(data[0].vat_known, false);
    assert.equal(data[0].btw_amount, 0);
    assert.equal(data[0].amount_incl_btw, 16.94);
    assert.equal(data[0].receipt_files.length, 1);
  }
});

test('tracking telt alleen het brandstofdeel van een gemengde tankstationbon', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ts = require('typescript');
  const text = fs.readFileSync(path.join(__dirname, '../src/components/tracking/TrackingFuelOverview.tsx'), 'utf8');
  const parsed = ts.createSourceFile('TrackingFuelOverview.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = ['validDate', 'financeFuelAmount', 'financeFuelRows'];
  const declarations = parsed.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  assert.equal(declarations.length, names.length);
  const code = ts.transpileModule(declarations.map(node => node.getText(parsed)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const tracking = new Function('parseISO', 'normalizeProjectCostCategory', `${code}; return { financeFuelAmount, financeFuelRows };`)(require('date-fns').parseISO, normalizeProjectCostCategory);
  const mixed = { date: '2026-07-09', amount_incl_btw: 125, bank_category: 'brandstof', category_allocations: [
    { category: 'brandstof', amount_incl_btw: 121 }, { category: 'overig', amount_incl_btw: 4 },
  ] };
  const shop = { ...mixed, category_allocations: [{ category: 'overig', amount_incl_btw: 125 }] };
  assert.deepEqual(tracking.financeFuelRows([mixed, shop]), [mixed]);
  assert.equal(tracking.financeFuelAmount(mixed), 121);
  assert.equal(tracking.financeFuelAmount(shop), 0);
  assert.equal(tracking.financeFuelAmount({ date: mixed.date, amount_incl_btw: 75, bank_category: 'brandstof' }), 75);
});
