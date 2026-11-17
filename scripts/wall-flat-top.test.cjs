const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
function load(file) {
  const mod = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(mod, mod.exports);
  return mod.exports;
}
const { wallSurface } = load('src/lib/simple-material-calculation.ts');
const { grossSurface } = load('src/lib/joint-finishing-cost.ts');
const wall = { shape: 'gable', lengte: 6600, hoogte: 800, hoogteNok: 2800 };
test('bestaande puntwand blijft gelijk zonder vlak bovendeel', () => {
  assert.equal(wallSurface(wall).grossM2, 11.88);
  assert.equal(grossSurface(wall, false), 11.88);
});
test('vlak plafond telt rechthoek en beide schuine wanddelen mee', () => {
  const row = { ...wall, vlakkeBovenzijdeBreedte: 1370, openings: [{ fromLeft: 2550, fromBottom: 0, width: 1500, height: 1985 }] };
  const result = wallSurface(row);
  assert.equal(result.grossM2, 13.25);
  assert.equal(result.netM2, 10.2725);
  assert.equal(grossSurface(row, false), result.grossM2);
});
test('ongelijke zijhoogten en geheel vlak plafond hebben consistente oppervlakken', () => {
  for (const flat of [0, 1000, 6600]) {
    const row = { ...wall, hoogteLinks: 600, hoogteRechts: 1000, vlakkeBovenzijdeBreedte: flat };
    assert.equal(wallSurface(row).grossM2, grossSurface(row, false));
  }
});
test('ongeldige plafondbreedte wordt afgewezen', () => {
  assert.throws(() => wallSurface({ ...wall, vlakkeBovenzijdeBreedte: 7000 }), /breder/);
  assert.equal(grossSurface({ ...wall, vlakkeBovenzijdeBreedte: 7000 }, false), 0);
});
