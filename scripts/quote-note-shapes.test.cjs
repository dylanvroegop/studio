const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const shapes = require('../src/lib/note-surfaces');
const { buildCalculationMeasurementAssignments: build } = require('../src/lib/calculation-note-assignment');

// Test de daadwerkelijke Notes-parser en opslag, zonder Firebase/React te starten.
const source = fs.readFileSync('src/components/quote/QuoteWorkspace.tsx', 'utf8');
const ast = ts.createSourceFile('QuoteWorkspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['createQuoteNoteSectionId', 'createQuoteNoteMaatwerkLine', 'normalizeMaatwerkDimension',
  'extractMaatwerkDimensionFromTitle', 'getQuoteNoteMaatwerkLineIdentity', 'deduplicateQuoteNoteMaatwerkLines',
  'parseQuoteNoteMaatwerkLine', 'serializeQuoteNoteSections', 'getQuoteNoteAuxiliaryTitle', 'createQuoteNoteSection']);
const code = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map(node => node.getText(ast)).join('\n');
const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const { parse, serialize } = new Function('noteShapeFields', 'formatNoteShape', 'parseNoteShape', `${compiled}\nreturn {parse: parseQuoteNoteMaatwerkLine, serialize: serializeQuoteNoteSections};`)(shapes.noteShapeFields, shapes.formatNoteShape, shapes.parseNoteShape);
const fields = [{ key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm' }, { key: 'breedte', label: 'Breedte', type: 'number', suffix: 'mm' }];

test('vorm en alle maten overleven calculatie → Notes-editor → opslag → herladen', () => {
  const sources = [
    { shape: 'slope', lengte: 3800, hoogteLinks: 0, hoogteRechts: 1750 },
    { shape: 'gable', lengte: 4000, hoogte: 0, hoogteNok: 2000 },
    { shape: 'l-shape', lengte: 6000, lengte1: 2000, hoogte1: 4000, hoogte2: 2000 },
    { shape: 'u-shape', lengte: 6000, lengte1: 2000, lengte2: 2000, hoogte1: 4000, hoogte2: 2000, hoogte3: 4000 },
  ];
  const expected = [3.325, 4, 16, 20];
  sources.forEach((source, index) => {
    const row = parse(build([source], fields, 'Plafond')[0].line);
    assert.equal(row.height, source.shape === 'gable' ? '0' : '', 'Zijhoogten worden niet als gewone hoogte gelezen');
    assert.equal(shapes.noteSurfaceArea(row, 'plafond'), expected[index]);
    const saved = serialize([{ title: 'Plafond', notes: '', linksTitle: '', links: [], maatwerkLines: [row] }]);
    const reloaded = parse(saved.split('\n').find(line => line.startsWith('- ')));
    assert.deepEqual(shapes.noteShapeFields(reloaded), shapes.noteShapeFields(row));
    assert.equal(shapes.noteSurfaceArea(reloaded, 'plafond'), expected[index]);
  });
});

test('onleesbare of ontbrekende zijhoogte wordt niet stilzwijgend nul', () => {
  const row = { title: 'Plafond', length: '3800', width: '', height: '', thickness: '', shape: 'slope', hoogteLinks: 'onbekend', hoogteRechts: '1750' };
  assert.equal(shapes.noteSurfaceArea(row, 'plafond'), 0);
  assert.equal(shapes.noteSurfaceArea({ ...row, hoogteLinks: '' }, 'plafond'), 0);
});

test('boeiboord houdt voorzijde en onderzijde apart na Notes-opslag en herladen', () => {
  const boeiFields = [
    { key: 'lengte', label: 'Lengte Voorzijde', type: 'number', suffix: 'mm' },
    { key: 'hoogte', label: 'Hoogte Voorzijde', type: 'number', suffix: 'mm' },
    { key: 'lengte_onderzijde', label: 'Lengte Onderzijde', type: 'number', suffix: 'mm' },
    { key: 'breedte', label: 'Breedte Onderzijde', type: 'number', suffix: 'mm' },
  ];
  const rows = build([{ lengte: 5000, hoogte: 100, lengte_onderzijde: 5000, breedte: 520 }], boeiFields, 'Boeiboord').map(assignment => parse(assignment.line));
  const saved = serialize([{ title: 'Boeidelen', notes: 'Handmatige tekst', linksTitle: '', links: [], maatwerkLines: rows }]);
  const reloaded = saved.split('\n').filter(line => line.startsWith('- ')).map(parse);
  assert.equal(reloaded.length, 2);
  assert.deepEqual(reloaded.map(row => shapes.noteSurfaceArea(row)), [0.5, 2.6]);
  assert.equal(reloaded.reduce((sum, row) => sum + shapes.noteSurfaceArea(row), 0), 3.1);
});

test('bestaande gecombineerde boeiboordregels tellen beide vlakken, ook na opslag en herladen', () => {
  const title = 'Boeidelen (Trespa/HPL) 1 — Boeiboord 10 (Lengte Onderzijde 10000 mm; Latafstand Voorzijde (h.o.h.) 300 mm; Latafstand Onderzijde (h.o.h.) 300 mm)';
  const row = parse(`- ${title} = Lengte: 10000 mm | Breedte: 250 mm | Hoogte: 100 mm | Dikte: mm | Vorm: rectangle`);
  assert.equal(shapes.noteSurfaceArea(row), 3.5);
  assert.equal(shapes.noteSurfaceArea(row, 'plafond'), 3.5);
  const saved = serialize([{ title: 'Boeidelen', notes: '', linksTitle: '', links: [], maatwerkLines: [row] }]);
  const reloaded = parse(saved.split('\n').find(line => line.startsWith('- ')));
  assert.equal(shapes.noteSurfaceArea(reloaded), 3.5);
  const candidates = shapes.collectNoteSurfaces([{ title: 'Boeidelen', notes: '', maatwerkLines: [reloaded] }]);
  const jobs = shapes.noteSurfaceJobs(candidates, { fingerprint: 'test', surfaces: [{ key: '0:0', kind: 'wand' }] });
  assert.equal(jobs['0:0'].maatwerk.basis[0].oppervlakte_m2, 3.5);
});

test('onderzijde gebruikt eigen lengte, actuele breedte en blijft rechthoekig bij driehoekige voorzijde', () => {
  const row = parse('- Boeidelen 1 — Boeiboord 2 (Lengte Onderzijde 4200 mm) = Lengte: 5000 mm | Breedte: 520 mm | Hoogte: 100 mm | Vorm: rectangle');
  assert.equal(shapes.noteSurfaceArea(row), 2.684);
  assert.equal(shapes.noteSurfaceArea({ ...row, width: '250' }), 1.55);
  assert.equal(shapes.noteSurfaceArea({ ...row, shape: 'slope' }), 2.434);
  assert.equal(shapes.noteSurfaceArea({ ...row, width: '' }), 0.5);
  assert.equal(shapes.noteSurfaceArea({ ...row, height: '' }), 2.184);
});

test('gewone wand of plafond met drie maten behoudt de eigen oppervlakteberekening', () => {
  const row = parse('- Wand = Lengte: 10000 mm | Breedte: 250 mm | Hoogte: 100 mm | Vorm: rectangle');
  assert.equal(shapes.noteSurfaceArea(row, 'wand'), 1);
  assert.equal(shapes.noteSurfaceArea(row, 'plafond'), 2.5);
});
