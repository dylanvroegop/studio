const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const { restoreCalculationNoteShapes } = require('../src/lib/calculation-note-assignment');

// Voer de echte synchronisatie-effectcode uit met gecontroleerde snapshots.
const source = fs.readFileSync('src/components/quote/QuoteWorkspace.tsx', 'utf8');
const ast = ts.createSourceFile('QuoteWorkspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const helper = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'restoreQuoteNoteSectionShapes');
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
    && node.arguments[0]?.getText(ast).includes('lastNoteShapeJobsRef.current =')) {
    effect = node.arguments[0];
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(helper && effect, 'Notes synchronisatie gevonden');
const compile = code => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const restore = new Function('restoreCalculationNoteShapes', `${compile(helper.getText(ast))}\nreturn restoreQuoteNoteSectionShapes;`)(restoreCalculationNoteShapes);
const run = new Function('state', `const { quoteNotes, lastSerializedQuoteNoteSectionsRef, noteShapeSourceKey,
  lastNoteShapeJobsRef, noteShapeCalculationJobs, setQuoteNoteSections, parseQuoteNotesToSections } = state;
  const restoreQuoteNoteSectionShapes = state.restore;
  ${compile(`const effect = ${effect.getText(ast)};`)}
  effect();`);

const jobs = { job: { maatwerk: { meta: { title: 'Plafond' }, basis: [
  { shape: 'slope', lengte: 3800, hoogteLinks: 0, hoogteRechts: 1750 },
] } } };
const section = () => ({
  id: 'stable-section', title: 'Plafond ', notes: 'Tekst met spaties  \n', linksTitle: '',
  links: [{ id: 'stable-link', title: 'Nog aan het typen ', url: '' }],
  maatwerkLines: [
    { id: 'stable-row', title: 'Plafond 1 — Vlak 1', length: '3800', width: '', height: '', thickness: '' },
    { id: 'empty-row', title: '', length: '', width: '', height: '', thickness: '' },
  ],
});
function scenario({ current = [section()], text = 'opgeslagen tekst', serialized = text, sourceJobs = jobs, previousSource = 'oud' } = {}) {
  let sections = current;
  let parses = 0;
  let updates = 0;
  const parsed = [{ ...section(), id: 'remote-section', notes: text }];
  const state = {
    quoteNotes: text,
    lastSerializedQuoteNoteSectionsRef: { current: serialized },
    noteShapeSourceKey: JSON.stringify(sourceJobs),
    lastNoteShapeJobsRef: { current: previousSource },
    noteShapeCalculationJobs: sourceJobs,
    restore,
    setQuoteNoteSections: next => { updates++; sections = typeof next === 'function' ? next(sections) : next; },
    parseQuoteNotesToSections: () => { parses++; return parsed; },
  };
  run(state);
  return { sections, parses, updates, state };
}

test('calculatie-update tijdens typen behoudt veld-IDs, spaties, links en lege invoerrijen', () => {
  const current = [section()];
  const result = scenario({ current });
  assert.equal(result.parses, 0, 'De opgeslagen tekst mag de actieve invoer niet opnieuw opbouwen');
  assert.equal(result.sections[0].id, current[0].id);
  assert.equal(result.sections[0].notes, current[0].notes);
  assert.equal(result.sections[0].title, current[0].title);
  assert.equal(result.sections[0].links, current[0].links);
  assert.deepEqual(result.sections[0].maatwerkLines.map(row => row.id), ['stable-row', 'empty-row']);
  assert.equal(result.sections[0].maatwerkLines[0].shape, 'slope');
  assert.equal(result.sections[0].maatwerkLines[0].hoogteLinks, '0');
  assert.equal(result.sections[0].maatwerkLines[1], current[0].maatwerkLines[1]);
});

test('nieuwe snapshot zonder vormwijziging behoudt de bestaande editor-objecten', () => {
  const current = restore([section()], jobs);
  const result = scenario({ current, sourceJobs: { ...jobs, metadata: { updatedAt: 'nieuw' } } });
  assert.equal(result.parses, 0);
  assert.equal(result.sections, current);
});

test('bevestiging van dezelfde opslag bouwt geen velden opnieuw op', () => {
  const result = scenario({ previousSource: JSON.stringify(jobs) });
  assert.equal(result.parses, 0);
  assert.equal(result.updates, 0);
});

test('werkelijk gewijzigde externe notities worden nog steeds ingelezen', () => {
  const result = scenario({ text: 'Nieuwe externe tekst', serialized: 'Oude tekst' });
  assert.equal(result.parses, 1);
  assert.equal(result.sections[0].notes, 'Nieuwe externe tekst');
  assert.equal(result.sections[0].maatwerkLines[0].shape, 'slope');
  assert.equal(result.state.lastSerializedQuoteNoteSectionsRef.current, 'Nieuwe externe tekst');
});
