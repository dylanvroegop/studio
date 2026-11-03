const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const { parseNoteImportRows: parse, initialNoteImportChoices: initial, buildNoteImportPatches: patches, applyNoteImportPatches: apply } = require('../src/lib/note-measurement-import');
const { buildCalculationMeasurementAssignments: build, syncImportedCalculationMeasurements: sync, assignCalculationMeasurementsToNoteJob: assign } = require('../src/lib/calculation-note-assignment');
const { parseNoteShape, noteSurfaceArea } = require('../src/lib/note-surfaces');
const { importedQuoteNotesUpdate } = require('../src/lib/calculation-note-assignment');
const fs = require('node:fs');
const ts = require('typescript');
const personalNotesSource = fs.readFileSync('src/components/PersonalNotes.tsx', 'utf8');
const personalNotesAst = ts.createSourceFile('PersonalNotes.tsx', personalNotesSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const parserNames = new Set(['createLocalNoteId', 'parseQuoteNotitiesToNotes', 'serializeNotesToQuoteNotities']);
const parserCode = personalNotesAst.statements.filter(node => ts.isFunctionDeclaration(node) && parserNames.has(node.name?.text)).map(node => node.getText(personalNotesAst)).join('\n');
const personalNotes = new Function(`${ts.transpileModule(parserCode, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText}\nreturn { parse: parseQuoteNotitiesToNotes, serialize: serializeNotesToQuoteNotities };`)();
const fields = [
  { key: 'lengte', label: 'Lengte Voorzijde', type: 'number', suffix: 'mm' },
  { key: 'hoogte', label: 'Hoogte Voorzijde', type: 'number', suffix: 'mm' },
  { key: 'lengte_onderzijde', label: 'Lengte Onderzijde', type: 'number', suffix: 'mm' },
  { key: 'breedte', label: 'Breedte Onderzijde', type: 'number', suffix: 'mm' },
  { key: 'latafstand', label: 'Latafstand', type: 'number', suffix: 'mm' },
];
const original = '- Achterkant = Lengte: 5000 mm | Breedte: 520 mm | Hoogte: mm | Dikte: mm';
const untouched = '- Handmatig = Lengte: 5000 mm | Breedte: 520 mm';
const notes = `### Boeidelen\nMijn omschrijving\n#### Maatwerk\n${original}\n${untouched}\n#### Links\nhttps://voorbeeld.nl\n\n### Andere klus\n${original}`;
function imported() {
  const rows = parse(original, 'Boeidelen');
  const choices = initial(rows, fields);
  choices['row-0'] = { target: 'existing:0', fields: { lengte: 'lengte_onderzijde', breedte: 'breedte' } };
  const result = patches(rows, choices, fields, 1);
  assert.equal(result.error, '');
  return apply([{ lengte: '4000', hoogte: '100', latafstand: 300 }], result.patches, () => ({}));
}
function area(line) {
  const row = parse(line)[0];
  const dimensions = Object.fromEntries(row.dimensions.map(value => [value.key, value.value]));
  return noteSurfaceArea({ title: row.title, length: dimensions.lengte || '', height: dimensions.hoogte || '', width: dimensions.breedte || '', thickness: '', ...parseNoteShape(line.slice(line.indexOf('=') + 1)) });
}

test('privé notities bewaren de volledige originele tekst bij iedere volgende opslag', () => {
  const first = importedQuoteNotesUpdate(notes, 'bijgewerkte notities');
  assert.equal(first.privateNotities, notes);
  const reloaded = JSON.parse(JSON.stringify(first));
  const second = importedQuoteNotesUpdate(reloaded.notities, 'volgende wijziging', reloaded.privateNotities);
  assert.equal(second.privateNotities, notes);
  assert.equal(second.notities, 'volgende wijziging');
  assert.equal(importedQuoteNotesUpdate('nieuw', 'gewijzigd', '').privateNotities, '');
});

test('notitievenster houdt Maatwerk en Links bij hun bronblok tijdens kopiëren', () => {
  const blocks = personalNotes.parse(notes);
  assert.deepEqual(blocks.map(block => block.title), ['Boeidelen', 'Andere klus']);
  assert.match(blocks[0].content, /#### Maatwerk/);
  assert.match(blocks[0].content, /#### Links/);
  assert.equal(personalNotes.serialize(blocks), notes);
  const rows = parse(blocks[0].content, blocks[0].title);
  const choices = {
    'row-0': { target: 'existing:0', fields: { lengte: 'lengte_onderzijde', breedte: 'breedte' } },
    'row-1': { target: '__skip__', fields: {} },
  };
  const items = apply([{ lengte: 5000, hoogte: 100 }], patches(rows, choices, fields, 1).patches, () => ({}), rows);
  const updated = sync(notes, build(items, fields, 'Boeiboord'));
  assert.match(updated.notes, /Achterkant — Onderzijde/);
  assert.match(updated.notes, /Handmatig =/);
});

test('gewijzigde bron kan opnieuw gekoppeld worden zonder een verdwenen bron vast te houden', () => {
  const items = imported();
  const changed = original.replace('520', '600');
  const rows = parse(changed, 'Boeidelen');
  const choices = { 'row-0': { target: 'existing:0', fields: { lengte: 'lengte_onderzijde', breedte: 'breedte' } } };
  const next = apply(items, patches(rows, choices, fields, 1).patches, () => ({}), rows);
  assert.deepEqual(next[0].noteImportSource.lines, [changed]);
  assert.doesNotThrow(() => sync(notes.replace(original, changed), build(next, fields, 'Boeiboord')));
});

test('overgeslagen velden koppelen hun bronregel niet aan een eerder gevuld onderdeel', () => {
  const secondLine = '- Los = Lengte: 2000 mm | Breedte: 100 mm';
  const rows = parse(`${original}\n${secondLine}`, 'Boeidelen');
  const choices = {
    'row-0': { target: 'existing:0', fields: { lengte: 'lengte_onderzijde', breedte: 'breedte' } },
    'row-1': { target: 'existing:0', fields: { lengte: '__skip__', breedte: '__skip__' } },
  };
  assert.deepEqual(patches(rows, choices, fields, 1).patches[0].source.lines, [original]);
});

test('kopieerscherm koppelt de originele regel; opslaan vervangt hem door voorzijde en onderzijde', () => {
  const items = imported();
  const assignments = build(items, fields, 'Boeiboord', 'Boeidelen 1');
  assert.deepEqual(assignments.map(row => area(row.line)), [0.4, 2.6]);
  const result = sync(notes, assignments);
  assert.equal(result.notes.includes('Mijn omschrijving'), true);
  assert.equal(result.notes.includes(untouched), true);
  assert.equal(result.notes.includes('https://voorbeeld.nl'), true);
  assert.equal(result.notes.split(original).length - 1, 1, 'Dezelfde maat in een ander blok blijft behouden');
  assert.match(result.notes, /Achterkant — Voorzijde/);
  assert.match(result.notes, /Achterkant — Onderzijde/);
  assert.equal(result.sources.get(0).lines.length, 2);
});

test('gewijzigde maten na herladen vervangen dezelfde regels, zonder extra oppervlakte', () => {
  let items = imported();
  const first = sync(notes, build(items, fields, 'Boeiboord', 'Boeidelen 1'));
  items = JSON.parse(JSON.stringify(items.map((item, index) => ({ ...item, noteImportSource: first.sources.get(index) }))));
  items[0].lengte_onderzijde = '6000';
  const assignments = build(items, fields, 'Boeiboord', 'Boeidelen 1');
  const second = sync(first.notes, assignments);
  assert.equal(second.notes.split('\n').filter(line => line.includes('Achterkant —')).length, 2);
  assert.equal(assignments.reduce((sum, row) => sum + area(row.line), 0), 3.52);
  assert.equal(sync(second.notes, build([{ ...items[0], noteImportSource: second.sources.get(0) }], fields, 'Boeiboord')).notes, second.notes);
});

test('gewone calculatie en toevallig gelijke maten vervangen geen handmatige notities', () => {
  const assignments = build([{ lengte: 5000, hoogte: 100, lengte_onderzijde: 5000, breedte: 520 }], fields, 'Boeiboord', 'Boeidelen 1');
  assert.equal(sync(notes, assignments).notes, notes);
  const added = assign(notes, 'Boeidelen', assignments.map(row => row.line));
  assert.equal(added.includes(original), true);
  assert.equal(added.includes(untouched), true);
});

test('ontbrekende, gewijzigde of ambigue bron wordt niet overschreven', () => {
  const assignments = build(imported(), fields, 'Boeiboord');
  assert.throws(() => sync(notes.replace(original, original.replace('520', '600')), assignments), /bronmaat/);
  assert.throws(() => sync(notes.replace(original, `${original}\n${original}`), assignments), /bronmaat/);
  assert.throws(() => sync(notes.replace('### Boeidelen', '### Gewijzigd'), assignments), /Notitieblok/);
});

test('opnieuw importeren kiest gekoppeld onderdeel; bron kan niet dubbel worden toegekend', () => {
  const items = imported();
  const rows = parse(original, 'Boeidelen');
  assert.equal(initial(rows, fields, items)['row-0'].target, 'existing:0');
  assert.throws(() => apply(items, [{ target: 'new:row-0', values: { lengte: '5000' }, source: items[0].noteImportSource }], () => ({})), /al gekoppeld/);
});

test('twee bronregels kunnen samen één boeiboord worden, met beide vlakken één keer', () => {
  const secondLine = '- Voorkant = Lengte: 4000 mm | Breedte: 100 mm';
  const rows = parse(`${original}\n${secondLine}`, 'Boeidelen');
  const choices = { 'row-0': { target: 'new:row-0', fields: { lengte: 'lengte_onderzijde', breedte: 'breedte' } }, 'row-1': { target: 'new:row-0', fields: { lengte: 'lengte', breedte: 'hoogte' } } };
  const result = patches(rows, choices, fields, 0);
  const items = apply([], result.patches, () => ({}));
  const resultNotes = sync(`### Boeidelen\n#### Maatwerk\n${original}\n${secondLine}`, build(items, fields, 'Boeiboord'));
  assert.equal(resultNotes.notes.split('\n').filter(line => line.startsWith('- ')).length, 2);
});

test('driehoek, spiegeling, alleen onderzijde en lege boeiboorden hebben correcte oppervlakten', () => {
  const triangle = build([{ shape: 'slope', lengte: 4000, hoogte: 1000, lengte_onderzijde: 5000, breedte: 520, boeiboord_mirror: true }], fields, 'Boeiboord');
  assert.deepEqual(triangle.map(row => area(row.line)), [2, 2.6, 2, 2.6]);
  assert.deepEqual(build([{ lengte_onderzijde: 5000, breedte: 520 }], fields, 'Boeiboord').map(row => area(row.line)), [2.6]);
  assert.equal(build([{ hoogte: NaN, latafstand: 300 }], fields, 'Boeiboord').length, 0);
});
