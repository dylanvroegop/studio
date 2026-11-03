const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const { buildCalculationMeasurementAssignments: build, assignCalculationMeasurementsToNoteJob: assign, restoreCalculationNoteShapes: restore } = require('../src/lib/calculation-note-assignment');
const { parseNoteShape, formatNoteShape, noteSurfaceArea } = require('../src/lib/note-surfaces');
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

test('driehoek bewaart vorm en nulhoogte bij calculatie naar Notes en opslaan/herladen', () => {
  const source = { shape: 'slope', lengte: 3800, hoogteLinks: 0, hoogteRechts: 1750 };
  const line = build([source], fields, 'Plafond', 'Plafond – Houten Framewerk 1')[0].line;
  const shape = parseNoteShape(line.slice(line.indexOf('=') + 1));
  assert.deepEqual(shape, { shape: 'slope', hoogteLinks: '0', hoogteRechts: '1750' });
  assert.deepEqual(parseNoteShape(formatNoteShape(shape)), shape);
  assert.equal(noteSurfaceArea({ title: 'Plafond', length: '3800', width: '', height: '', thickness: '', ...shape }, 'plafond'), 3.325);
  const oldLine = '- Plafond – Houten Framewerk 1 — Plafond 1 = Lengte: 3800 mm';
  const notes = assign(`### Plafond\n\n#### Maatwerk\n${oldLine}`, 'Plafond', [line]);
  assert.equal(notes.split('\n').filter(value => value.startsWith('- ')).length, 1, 'Vorm bij bestaande regel aanvullen zonder dubbel oppervlak');
  assert.match(notes, /Hoogte rechts: 1750 mm/);
});

test('bestaande gekoppelde Notes krijgen ontbrekende vormmaten; handmatige maten blijven behouden', () => {
  const row = { title: 'Plafond – Houten Framewerk 1 — Plafond 2 (Latafstand (h.o.h.) 300 mm)', length: '3800', width: '', height: '', thickness: '' };
  const jobs = { a: { maatwerk: { meta: { title: 'Plafond – Houten Framewerk' }, basis: [{ lengte: 7250, breedte: 3200 }, { shape: 'slope', lengte: 3800, hoogteLinks: 0, hoogteRechts: 1750 }] } } };
  const [restored] = restore([row], jobs);
  assert.equal(noteSurfaceArea(restored, 'plafond'), 3.325);
  assert.equal(restored.hoogteLinks, '0');
  assert.deepEqual(restore([{ ...row, length: '4000' }], jobs), [{ ...row, length: '4000' }]);
  assert.deepEqual(restore([{ ...row, shape: 'rectangle' }], jobs), [{ ...row, shape: 'rectangle' }]);
  assert.deepEqual(restore([{ ...row, title: 'Eigen maat' }], jobs), [{ ...row, title: 'Eigen maat' }]);
});
