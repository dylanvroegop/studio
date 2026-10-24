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
