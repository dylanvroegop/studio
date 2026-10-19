const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { validateCostVat } = require('../src/lib/cost-vat-validation');
const line = (net, gross, rate = 21) => ({ description: 'Test', total_price: net, total_incl_btw: gross, btw_percentage: rate });
test('inclusieve prijzen mogen niet tegelijk exclusief worden opgeslagen', () => {
  assert.match(validateCostVat({ lines: [line(166, 166)], rate: 21, amountIncl: 202.96, manualOverride: false }), /BTW-bedragen/);
});
test('gecorrigeerde Heimwerkertools-factuur sluit aan op het brontotaal', () => {
  assert.equal(validateCostVat({ lines: [line(137.19, 166), line(8.26, 9.99)], rate: 21, amountIncl: 175.99, manualOverride: false }), null);
});
test('groot totaalverschil mag niet naar de grootste categorie worden geschoven', () => {
  assert.match(validateCostVat({ lines: [line(100, 121)], rate: 21, amountIncl: 145, manualOverride: false }), /som van de regels/);
});
test('expliciet nulprocent en gemengde tarieven blijven geldig', () => {
  assert.equal(validateCostVat({ lines: [line(100, 121), line(10, 10, 0)], rate: 21, amountIncl: 131, manualOverride: false }), null);
});
