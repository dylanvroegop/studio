const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { isCostWithoutDocument } = require('../src/lib/cost-document-filter');
const { buildKnabCostList } = require('../src/lib/knab-cost-list');
const { summarizeBankCostRows } = require('../src/lib/bank-cost-summary');

test('categorie zonder factuur blijft opgeslagen, btw onbekend, afschrijving telt een keer', () => {
  const { data } = buildKnabCostList({ userId: 'user', transactions: [{ id: 'allsafe', amount: -437.96, booking_date: '2026-10-21', counterparty_name: 'ALLSAFE Group B.V.', description: 'Opslag' }], costs: [], ledgerRows: [], internalTransferIds: new Set(), categoryOverrides: new Map([['allsafe', 'storage']]) });
  assert.equal(data.length, 1);
  assert.equal(data[0].category, 'storage');
  assert.equal(data[0].vat_known, false);
  assert.equal(isCostWithoutDocument(data[0]), true);
  const before = summarizeBankCostRows(data);
  const filtered = data.filter(isCostWithoutDocument);
  assert.equal(filtered.length, 1);
  assert.deepEqual(summarizeBankCostRows(data), before);
  assert.equal(before.totals.alle, 437.96);
  assert.equal(before.counts.alle, 1);
  assert.equal(before.totals.storage, 437.96);
});
test('documentstatus bepaalt filter onafhankelijk van categorie en losse link', () => {
  assert.equal(isCostWithoutDocument({ category: 'overig', has_supporting_document: true }), false);
  assert.equal(isCostWithoutDocument({ category: 'storage', has_supporting_document: false, receipt_url: 'https://example.test/rejected.pdf' }), true);
  assert.equal(isCostWithoutDocument({ receipt_files: [], receipt_url: 'https://example.test/bon.pdf' }), false);
  assert.equal(isCostWithoutDocument({ receipt_files: [], receipt_url: null }), true);
});
