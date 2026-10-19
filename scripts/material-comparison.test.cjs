const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('src/lib/material-comparison.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(mod, mod.exports);
const { buildMaterialComparisonRows: rows } = mod.exports;
const item = (product, aantal, eenheid = 'stuk') => ({ product, aantal, eenheid, prijs_per_stuk: 5 });
test('verschillende productvolgordes blijven op dezelfde vergelijkingsrij', () => {
 const result = rows([[item('Gips', 25), item('Vuren', 24)], [item('Vuren', 26), item('Gips', 25)], [item('Gips', 27)]]);
 assert.deepEqual(result.map(row => row.cells.map(cell => cell?.[0].aantal)), [[25, 25, 27], [24, 26, undefined]]);
});
test('dubbele regels blijven bewaard, verschillende eenheden blijven gescheiden', () => {
 const result = rows([[item('Vuren', 2), item('Vuren', 3), item('Vuren', 6, 'm')]]);
 assert.equal(result.length, 2);
 assert.equal(result[0].cells[0].length, 2);
 assert.equal(result[1].unit, 'm');
});
test('ontbrekende historie en ontbrekend materiaal worden geen nul', () => {
 const result = rows([undefined, [], [item('Gips', 0)]]);
 assert.equal(result[0].cells[0], undefined);
 assert.equal(result[0].cells[1], undefined);
 assert.equal(result[0].cells[2][0].aantal, 0);
});
