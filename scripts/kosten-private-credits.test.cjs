const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { summarizeBankCostRows } = require('../src/lib/bank-cost-summary');

// Test de echte selectiefuncties uit de pagina, zonder nieuwe productie-exports
// of Firebase/browserinitialisatie voor deze zuivere weergaveregels.
const pageText = fs.readFileSync(path.join(__dirname, '../src/app/kosten/page.tsx'), 'utf8');
const parsedPage = ts.createSourceFile('page.tsx', pageText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['safeNumber', 'safeString', 'formatCurrency', 'getCostAmountSearchText', 'isPrivateDeposit',
  'formatBankRowAmount', 'matchingCostRows', 'costRowsForFilter', 'availableCostMonths', 'isBankTransactionCost'];
const functions = parsedPage.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
assert.equal(functions.length, names.length);
const code = ts.transpileModule(functions.map(node => node.getText(parsedPage)).join('\n'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const ui = new Function(`${code}\nreturn { ${names.join(', ')} };`)();

function row(id, amount, category = 'eigen_verbruik', extra = {}) {
  return { id, category, amount_incl_btw: amount, amount_excl_btw: amount, btw_amount: 0,
    supplier_name: 'top-up via bunq', description: 'Privé-opname', date: '2026-09-15', created_at: '2026-09-15',
    receipt_files: [], offerte_id: null, status: 'bank_transaction', vat_known: false, ...extra };
}

function deposit(id, amount, extra = {}) {
  return row(id, amount, 'eigen_verbruik', { supplier_name: 'D VROEGOP', description: 'Eigen storting',
    is_private_deposit: true, payment_type: 'private', ...extra });
}

test('alleen de privétab combineert 33 opnames met 11 bevestigde stortingen', () => {
  const withdrawals = Array.from({ length: 33 }, (_, index) => row(`withdrawal-${index}`, index < 32 ? 300 : 1820));
  const other = Array.from({ length: 301 }, (_, index) => row(`business-${index}`, index < 300 ? 100 : 37222.9, 'materiaal'));
  const costs = [...withdrawals, ...other];
  const credits = Array.from({ length: 11 }, (_, index) => deposit(`deposit-${index}`, index < 10 ? 600 : 1166));
  const before = structuredClone({ costs, credits });
  const all = ui.costRowsForFilter(costs, credits, 'alle');
  const privateRows = ui.costRowsForFilter(costs, credits, 'eigen_verbruik');
  const materialRows = ui.costRowsForFilter(costs, credits, 'materiaal');
  const summary = summarizeBankCostRows(costs, credits);
  assert.equal(all.length, 334); assert.equal(all.some(ui.isPrivateDeposit), false);
  assert.equal(summary.totals.alle, 78642.9); assert.equal(summary.counts.alle, 334);
  assert.equal(privateRows.length, 44); assert.equal(privateRows.filter(ui.isPrivateDeposit).length, 11);
  assert.equal(summary.totals.eigen_verbruik, 4254); assert.equal(summary.counts.eigen_verbruik, 44);
  assert.deepEqual(summary.privateSummary, { withdrawalTotal: 11420, depositTotal: 7166, netTotal: 4254, withdrawalCount: 33, depositCount: 11 });
  assert.equal(materialRows.length, 301); assert.equal(materialRows.some(ui.isPrivateDeposit), false);
  assert.deepEqual({ costs, credits }, before);
});

test('maand met alleen een storting blijft selecteerbaar en zichtbaar in de privétab', () => {
  const costs = [row('withdrawal', 300)];
  const credits = [deposit('deposit', 100, { date: '2026-10-03' })];
  assert.deepEqual(ui.availableCostMonths(costs, credits), ['2026-10', '2026-09']);
  const matchingCosts = ui.matchingCostRows(costs, '2026-10', '', new Map());
  const matchingCredits = ui.matchingCostRows(credits, '2026-10', '', new Map());
  assert.equal(ui.costRowsForFilter(matchingCosts, matchingCredits, 'alle').length, 0);
  assert.deepEqual(ui.costRowsForFilter(matchingCosts, matchingCredits, 'eigen_verbruik').map(item => item.id), ['deposit']);
  const summary = summarizeBankCostRows(matchingCosts, matchingCredits);
  assert.equal(summary.totals.eigen_verbruik, -100); assert.equal(summary.counts.eigen_verbruik, 1);
  assert.equal(summary.totals.alle, 0); assert.equal(summary.counts.alle, 0);
});

test('maand en zoekopdracht worden gelijk op opnames en stortingen toegepast', () => {
  const costs = [row('found-debit', 125.25, 'eigen_verbruik', { description: 'Bankreferentie ABC' }), row('other-debit', 100)];
  const credits = [deposit('found-credit', 125.25, { description: 'Bankreferentie ABC' }),
    deposit('other-credit', 20), deposit('wrong-month', 125.25, { description: 'Bankreferentie ABC', date: '2026-08-01' })];
  for (const search of ['ABC', '125,25']) {
    const debitMatches = ui.matchingCostRows(costs, '2026-09', search, new Map());
    const creditMatches = ui.matchingCostRows(credits, '2026-09', search, new Map());
    assert.deepEqual(debitMatches.map(item => item.id), ['found-debit']);
    assert.deepEqual(creditMatches.map(item => item.id), ['found-credit']);
    const summary = summarizeBankCostRows(debitMatches, creditMatches);
    assert.equal(summary.totals.eigen_verbruik, 0); assert.equal(summary.counts.eigen_verbruik, 2);
    assert.equal(summary.totals.alle, 125.25); assert.equal(summary.counts.alle, 1);
  }
});

test('privéboekingen worden gezamenlijk op datum gesorteerd en de plusflag blijft behouden', () => {
  const costs = [row('old-debit', 100, 'eigen_verbruik', { date: '2026-07-01' }),
    row('new-debit', 100, 'eigen_verbruik', { date: '2026-09-03' })];
  const credits = [deposit('middle-credit', 50, { date: '2026-08-02' })];
  const selected = ui.costRowsForFilter(costs, credits, 'eigen_verbruik');
  assert.deepEqual(selected.map(item => item.id), ['new-debit', 'middle-credit', 'old-debit']);
  assert.equal(ui.isPrivateDeposit(selected[1]), true);
  assert.equal(ui.isBankTransactionCost(selected[1]), true);
});

test('privéstortingen krijgen een plus en opnames een min, andere tabs behouden hun bedragweergave', () => {
  const withdrawal = row('debit', 300);
  const credit = deposit('credit', 200);
  assert.match(ui.formatBankRowAmount(withdrawal, true), /^− .*300,00$/);
  assert.match(ui.formatBankRowAmount(credit, true), /^\+ .*200,00$/);
  assert.equal(ui.formatBankRowAmount(withdrawal, false), ui.formatCurrency(300));
  assert.equal(credit.amount_incl_btw, 200); assert.equal(withdrawal.amount_incl_btw, 300);
  assert.equal(credit.vat_known, false); assert.equal(credit.btw_amount, 0);
});
