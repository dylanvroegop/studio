const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { summarizeBankCostRows } = require('../src/lib/bank-cost-summary');

test('iedere afschrijving telt eenmaal, inclusief prive en eigen overboekingen', () => {
  const result = summarizeBankCostRows([
    { category: 'materiaal', amount_incl_btw: 121, line_items: [{}, {}, {}] },
    { category: 'eigen_verbruik', amount_incl_btw: 200, line_items: [] },
    { category: 'profit', amount_incl_btw: 500 },
    { category: 'overig', amount_incl_btw: 12.34 },
  ]);
  assert.equal(result.totals.alle, 833.34);
  assert.equal(result.counts.alle, 4);
  assert.equal(result.counts.materiaal, 1);
  assert.equal(Object.entries(result.counts).filter(([key]) => key !== 'alle').reduce((sum, [, value]) => sum + value, 0), 4);
  assert.equal(Object.entries(result.totals).filter(([key]) => key !== 'alle').reduce((sum, [, value]) => sum + Math.round(value * 100), 0), 83334);
});

test('totalen gebruiken hele centen en een lege selectie geeft nul', () => {
  const result = summarizeBankCostRows([
    { category: 'overig', amount_incl_btw: 0.1 },
    { category: 'overig', amount_incl_btw: 0.2 },
  ]);
  assert.equal(result.totals.alle, 0.3);
  assert.equal(result.totals.overig, 0.3);
  assert.equal(summarizeBankCostRows([]).totals.alle, 0);
  assert.equal(summarizeBankCostRows([]).counts.alle, 0);
});

test('Privé saldeert 11420 minus 7166 over 44 regels terwijl Alle de 334 afschrijvingen behoudt', () => {
  // Synthetische verdeling: de aantallen en totalen toetsen het tabcontract.
  const withdrawals = Array.from({ length: 33 }, (_, index) => ({
    category: 'eigen_verbruik', amount_incl_btw: index === 32 ? 1820 : 300,
  }));
  const otherDebits = Array.from({ length: 301 }, (_, index) => ({
    category: 'materiaal', amount_incl_btw: index === 300 ? 7222.9 : 200,
  }));
  const credits = Array.from({ length: 11 }, (_, index) => ({
    category: 'eigen_verbruik', amount_incl_btw: index === 10 ? 666 : 650,
  }));
  const debits = [...withdrawals, ...otherDebits];
  const before = summarizeBankCostRows(debits);
  const result = summarizeBankCostRows(debits, credits);
  assert.equal(result.totals.alle, 78642.9);
  assert.equal(result.counts.alle, 334);
  assert.equal(result.totals.alle, before.totals.alle);
  assert.equal(result.counts.alle, before.counts.alle);
  assert.equal(result.totals.materiaal, before.totals.materiaal);
  assert.equal(result.counts.materiaal, 301);
  assert.equal(result.totals.eigen_verbruik, 4254);
  assert.equal(result.counts.eigen_verbruik, 44);
  assert.deepEqual(result.privateSummary, {
    withdrawalTotal: 11420, depositTotal: 7166, netTotal: 4254,
    withdrawalCount: 33, depositCount: 11,
  });
});

test('maand- en zoekselecties salderen uitsluitend de geselecteerde afschrijvingen en stortingen', () => {
  const debits = [
    { category: 'eigen_verbruik', amount_incl_btw: 250, date: '2026-06-05', description: 'project amber' },
    { category: 'eigen_verbruik', amount_incl_btw: 150, date: '2026-06-15', description: 'project blauw' },
    { category: 'materiaal', amount_incl_btw: 121, date: '2026-06-16', description: 'project amber' },
    { category: 'eigen_verbruik', amount_incl_btw: 400, date: '2026-07-05', description: 'project amber' },
  ];
  const credits = [
    { category: 'eigen_verbruik', amount_incl_btw: 100, date: '2026-06-06', description: 'project amber' },
    { category: 'eigen_verbruik', amount_incl_btw: 50, date: '2026-06-20', description: 'project blauw' },
    { category: 'eigen_verbruik', amount_incl_btw: 600, date: '2026-07-06', description: 'project amber' },
  ];
  const select = (month, search = '') => {
    const matches = (row) => row.date.startsWith(month) && row.description.includes(search);
    return summarizeBankCostRows(debits.filter(matches), credits.filter(matches));
  };
  const june = select('2026-06');
  assert.equal(june.totals.alle, 521);
  assert.equal(june.counts.alle, 3);
  assert.equal(june.totals.eigen_verbruik, 250);
  assert.equal(june.counts.eigen_verbruik, 4);
  const amber = select('2026-06', 'amber');
  assert.equal(amber.totals.alle, 371);
  assert.equal(amber.counts.alle, 2);
  assert.deepEqual(amber.privateSummary, {
    withdrawalTotal: 250, depositTotal: 100, netTotal: 150,
    withdrawalCount: 1, depositCount: 1,
  });
  const july = select('2026-07');
  assert.equal(july.totals.alle, 400);
  assert.equal(july.totals.eigen_verbruik, -200);
  assert.equal(select('2026-08').totals.alle, 0);
  assert.equal(select('2026-06', 'geen-resultaat').counts.eigen_verbruik, 0);
});

test('alleen privestortingen geven een negatief prive-netto en nul afschrijvingen in Alle', () => {
  const result = summarizeBankCostRows([], [
    { category: 'eigen_verbruik', amount_incl_btw: 0.1 },
    { category: 'eigen_verbruik', amount_incl_btw: 0.2 },
  ]);
  assert.equal(result.totals.alle, 0);
  assert.equal(result.counts.alle, 0);
  assert.equal(result.totals.eigen_verbruik, -0.3);
  assert.equal(result.counts.eigen_verbruik, 2);
  assert.deepEqual(result.privateSummary, {
    withdrawalTotal: 0, depositTotal: 0.3, netTotal: -0.3,
    withdrawalCount: 0, depositCount: 2,
  });
});

test('andere ontvangstcategorieën en nul of negatieve credits verlagen prive niet', () => {
  const result = summarizeBankCostRows([{ category: 'eigen_verbruik', amount_incl_btw: 100 }], [
    { category: 'eigen_verbruik', amount_incl_btw: 25 },
    { category: 'overig', amount_incl_btw: 500 },
    { category: 'profit', amount_incl_btw: 5000 },
    { category: 'eigen_verbruik', amount_incl_btw: 0 },
    { category: 'eigen_verbruik', amount_incl_btw: -25 },
  ]);
  assert.equal(result.totals.alle, 100);
  assert.equal(result.counts.alle, 1);
  assert.equal(result.totals.eigen_verbruik, 75);
  assert.equal(result.counts.eigen_verbruik, 2);
  assert.equal(result.privateSummary.depositCount, 1);
  assert.equal(result.privateSummary.depositTotal, 25);
});
