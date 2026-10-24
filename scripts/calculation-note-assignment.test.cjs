const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('src/lib/calculation-note-assignment.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(require, mod, mod.exports);
const { buildCalculationMeasurementAssignments: build, assignCalculationMeasurementsToNoteJob: assign } = mod.exports;
const fields = [{ key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm' }, { key: 'hoogte', label: 'Hoogte', type: 'number', suffix: 'mm' }];
test('gelijke maten uit twee klussen blijven apart en opnieuw opslaan dupliceert niet', () => {
  const lines = [1, 2].map(n => build([{ lengte: 6600, hoogte: 800 }], fields, 'Wand', `HSB Tussenwand ${n}`)[0].line);
  let notes = assign('### Wanden', 'Wanden', [lines[0]]);
  notes = assign(notes, 'Wanden', [lines[1]]);
  assert.equal(notes.split('\n').filter(l => l.startsWith('- ')).length, 2);
  assert.match(notes, /HSB Tussenwand 1 — Wand 1/);
  assert.match(notes, /HSB Tussenwand 2 — Wand 1/);
  assert.equal(assign(notes, 'Wanden', lines), notes);
});
