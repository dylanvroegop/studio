const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('src/lib/simple-material-calculation.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(mod, mod.exports);
const { prepareSimpleCalculation, finalizeSimpleCalculation } = mod.exports;
function payload(wastePercentage) {
  return { quote: { klussen: [{ materialen: { materialen_lijst: {
    deurblad: { wastePercentage, material: { materiaalnaam: 'Deurblad', eenheid: 'stuk', prijs: 35.67 } },
  } } }] } };
}
function entry(body) { return body.quote.klussen[0].materialen.materialen_lijst.deurblad; }

test('n8n payload behoudt app-percentages inclusief expliciete nul, zonder bronmutatie', () => {
  for (const percentage of [0, 5, 10, 12.5, 20]) {
    const body = payload(percentage);
    const before = structuredClone(body);
    const prepared = prepareSimpleCalculation(body);
    assert.equal(entry(prepared).wastePercentage, percentage);
    assert.equal(entry(prepared).rule.wastePercentage, percentage);
    assert.deepEqual(body, before);
  }
});
test('ontbrekend percentage introduceert geen verborgen afvalopslag', () => {
  assert.equal(entry(prepareSimpleCalculation(payload(undefined))).wastePercentage, 0);
  assert.equal(entry(prepareSimpleCalculation(payload('2,5'))).wastePercentage, 2.5);
  assert.throws(() => prepareSimpleCalculation(payload(-1)), /Ongeldig afvalpercentage/);
});
test('twee deurbladen met 0% blijven twee; ingestelde opslag wordt eenmaal toegepast', () => {
  const output = { materialen: [{ materiaal: 'Deurblad', basis_aantal: 2 }] };
  for (const [percentage, expected] of [[0, 2], [10, 3]]) {
    const result = finalizeSimpleCalculation(prepareSimpleCalculation(payload(percentage)), output);
    assert.equal(result.materialen[0].aantal, expected);
    assert.equal(result.materialen[0].wastePercentage, percentage);
    assert.match(result.materialen[0].hoe_berekend, new RegExp(`${percentage}% afval uit de app`));
  }
});
test('gelijke materialen met afwijkende percentages worden niet stilzwijgend met eerste percentage berekend', () => {
  const body = payload(0);
  body.quote.klussen.push(payload(10).quote.klussen[0]);
  const result = finalizeSimpleCalculation(body, { materialen: [{ materiaal: 'Deurblad', basis_aantal: 2 }] });
  assert.equal(result.materialen[0].aantal, null);
  assert.equal(result.materialen[0].berekening_status, 'requires_manual_input');
});
