const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { calculateTravelBudget } = require('../src/lib/travel-budget');
const input = { startingBalance: 30000, monthlyTravel: 1500, monthlyFixed: 500, upfront: 1000, reserve: 5000, plannedMonths: 6 };
test('reserve en eenmalige kosten worden eenmalig afgetrokken', () => {
  assert.deepEqual(calculateTravelBudget(input), { monthlyTotal: 2000, available: 24000, affordableMonths: 12, plannedCost: 13000, remaining: 17000, shortage: 0 });
});
test('langere reis toont tekort ten opzichte van reserve', () => {
  const result = calculateTravelBudget({ ...input, plannedMonths: 13 });
  assert.equal(result.remaining, 3000);
  assert.equal(result.shortage, 2000);
});
test('onvoldoende budget, nul kosten en ongeldige waarden', () => {
  assert.equal(calculateTravelBudget({ ...input, startingBalance: 100 }).affordableMonths, 0);
  assert.equal(calculateTravelBudget({ ...input, monthlyTravel: 0, monthlyFixed: 0 }).affordableMonths, null);
  assert.equal(calculateTravelBudget({ ...input, reserve: -1 }), null);
  assert.equal(calculateTravelBudget({ ...input, monthlyTravel: NaN }), null);
});
test('bedragen en gebroken maanden worden op centen berekend', () => {
  const result = calculateTravelBudget({ ...input, monthlyTravel: 0.1, monthlyFixed: 0.2, plannedMonths: 1.5 });
  assert.equal(result.monthlyTotal, 0.3);
  assert.equal(result.plannedCost, 1000.45);
});
