const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { calculateBankCostScenario, parseScenarioAmount } = require('../src/lib/bank-cost-scenario');

test('2000 minder brandstof telt op bij het zelf ingevulde saldo', () => {
  assert.deepEqual(calculateBankCostScenario({ brandstof: 4625.62, boetes: 1940.14 }, { brandstof: 2000, boetes: 1940.14 }, 1938.54), { saved: 3940.14, balanceWithoutCosts: 5878.68 });
});
test('geen saldo is onbekend; nul en negatief saldo zijn geldig', () => {
  assert.equal(calculateBankCostScenario({ brandstof: 10 }, { brandstof: 5 }, null).balanceWithoutCosts, null);
  assert.equal(calculateBankCostScenario({ brandstof: 10 }, { brandstof: 5 }, 0).balanceWithoutCosts, 5);
  assert.equal(calculateBankCostScenario({ brandstof: 10 }, { brandstof: 5 }, -10).balanceWithoutCosts, -5);
});
test('besparing blijft tussen nul en categorietotaal zonder dubbeltelling', () => {
  assert.equal(calculateBankCostScenario({ brandstof: 12.34, eigen_verbruik: -100, boetes: 50 }, { brandstof: 2000, eigen_verbruik: 50, boetes: -5 }, 0).saved, 12.34);
});
test('Nederlandse bedragen en ongeldige invoer', () => {
  for (const [raw, expected] of [['€ 2.000,50', 2000.5], ['2.000', 2000], ['2000', 2000], ['2000.50', 2000.5], ['-12,50', -12.5], ['', null], ['abc', null], ['12,34,56', null]]) assert.equal(parseScenarioAmount(raw), expected);
});


test('extra vaste lasten verlagen besparing en saldo over de hele periode', () => {
  assert.deepEqual(calculateBankCostScenario({ autokosten: 7240.49 }, { autokosten: 7240.49 }, 1938.54, 250 * 5), { saved: 5990.49, balanceWithoutCosts: 7929.03 });
  assert.equal(calculateBankCostScenario({}, {}, 100, 250).balanceWithoutCosts, -150);
  assert.equal(calculateBankCostScenario({}, {}, null, 250).balanceWithoutCosts, null);
});

test('extra vaste maandlasten worden bij potentieel niet met de uren vermenigvuldigd', () => {
  const { reportEarnings } = require('../src/lib/kosten-report-period');
  const before = reportEarnings(30000, 600 * 60, 5, 5000);
  const after = reportEarnings(30000 - 1250, 600 * 60, 5, 5000 + 1250);
  assert.equal(before.potentialMonthly - after.potentialMonthly, 250);
  assert.equal(before.potentialTotal - after.potentialTotal, 1250);
});
