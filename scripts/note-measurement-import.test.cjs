const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const { parseNoteImportRows: parse, initialNoteImportChoices: initial, buildNoteImportPatches: build, applyNoteImportPatches: apply, noteImportFields, SKIP_NOTE_MEASUREMENT: skip } = require('../src/lib/note-measurement-import');
const fields = [
  { key: 'lengte', label: 'Lengte Voorzijde', type: 'number', suffix: 'mm' },
  { key: 'hoogte', label: 'Hoogte Voorzijde', type: 'number', suffix: 'mm' },
  { key: 'lengte_onderzijde', label: 'Lengte Onderzijde', type: 'number', suffix: 'mm' },
  { key: 'breedte', label: 'Breedte Onderzijde', type: 'number', suffix: 'mm' },
];
const source = [
  ['Achterkant', 5000, 520], ['Achterkant', 1550, 520], ['Achterkant', 8500, 520],
  ['Zijkant', 12000, 520], ['Voorkant', 8500, 520], ['Zijkant', 5000, 520],
  ['Zijkant', 5000, 1550], ['Zijkant', 10000, 520], ['Zijkant', 10000, 250],
].map(([title, length, width]) => `- ${title} = Lengte: ${length} mm | Breedte: ${width} mm | Hoogte: mm | Dikte: mm`).join('\n');

test('alle negen HPL-regels blijven gekoppeld, inclusief herhaalde lengtes en breedtes', () => {
  const rows = parse(source);
  assert.equal(rows.length, 9);
  assert.deepEqual(rows.map(row => row.dimensions.map(value => value.value)), [
    ['5000', '520'], ['1550', '520'], ['8500', '520'], ['12000', '520'], ['8500', '520'],
    ['5000', '520'], ['5000', '1550'], ['10000', '520'], ['10000', '250'],
  ]);
  assert.equal(rows[0].title, 'Achterkant');
  const choices = initial(rows, fields);
  assert.deepEqual(choices['row-0'].fields, { lengte: '', breedte: '' });
  assert.ok(build(rows, choices, fields, 0).error);
  assert.equal(build(rows, choices, fields, 0).patches.length, 0);
});

test('voorzijde en onderzijde kunnen naar hetzelfde bestaande boeiboord zonder extra velden te wijzigen', () => {
  const rows = parse(source).slice(0, 2);
  const choices = initial(rows, fields);
  choices['row-0'] = { target: 'existing:0', fields: { lengte: 'lengte', breedte: 'hoogte' } };
  choices['row-1'] = { target: 'existing:0', fields: { lengte: 'lengte_onderzijde', breedte: 'breedte' } };
  assert.deepEqual(build(rows, choices, fields, 1), { error: '', patches: [{ target: 'existing:0', values: {
    lengte: '5000', hoogte: '520', lengte_onderzijde: '1550', breedte: '520',
  } }] });
  choices['row-1'].fields.lengte = 'lengte';
  assert.match(build(rows, choices, fields, 1).error, /Meerdere maten/);
});

test('lege en ongeldige waarden worden niet geleend uit andere regels; cm worden mm', () => {
  const rows = parse('- A = Lengte: 500 cm | Hoogte: mm\n- B = Lengte: mm | Hoogte: 52 cm\n- C = Lengte: onbekend | Dikte: mm');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.dimensions.map(value => value.value)), [['5000'], ['520']]);
  assert.equal(parse('Lengte: 2,5 m\nHoogte: 52 cm').length, 1);
});

test('de zichtbare veldnaam bepaalt de koppeling, niet de interne sleutel', () => {
  const rows = parse('- Dak = Lengte: 4000 mm | Breedte: 2500 mm');
  const roofFields = [{ key: 'lengte', label: 'Lengte' }, { key: 'hoogte', label: 'Breedte' }];
  assert.deepEqual(initial(rows, roofFields)['row-0'].fields, { lengte: 'lengte', breedte: 'hoogte' });
});

test('overslaan is expliciet, onbekende doelvelden en verdwenen onderdelen worden geweigerd', () => {
  const rows = parse(source).slice(0, 2);
  const choices = initial(rows, fields);
  choices['row-0'] = { target: 'new:row-1', fields: { lengte: 'lengte', breedte: skip } };
  choices['row-1'].target = skip;
  assert.deepEqual(build(rows, choices, fields, 0).patches, [{ target: 'new:row-1', values: { lengte: '5000' } }]);
  choices['row-0'].fields.lengte = 'onbekend';
  assert.ok(build(rows, choices, fields, 0).error);
  choices['row-0'].target = 'existing:9';
  assert.ok(build(rows, choices, fields, 0).error);
});

test('alleen gekozen velden veranderen; instellingen, andere boeiboorden en de invoer blijven behouden', () => {
  const items = [{ lengte: '5000', hoogte: '', latafstand: 400, notitie: 'Handmatig' }, { lengte: '1550' }];
  const before = structuredClone(items);
  const next = apply(items, [{ target: 'existing:0', values: { hoogte: '520' } }, { target: 'new:row-2', values: { lengte: '8500', hoogte: '520' } }], () => ({ latafstand: 300 }));
  assert.deepEqual(items, before);
  assert.deepEqual(next[0], { ...before[0], hoogte: '520' });
  assert.deepEqual(next[1], before[1]);
  assert.deepEqual(next[2], { latafstand: 300, lengte: '8500', hoogte: '520' });
});

test('vorm en nulhoogte blijven behouden bij een driehoek uit notities', () => {
  const rows = parse('- Gevel = Vorm: slope | Lengte: 3800 mm | Hoogte links: 0 mm | Hoogte rechts: 1750 mm');
  assert.equal(rows[0].title, 'Gevel');
  const targets = noteImportFields([{ key: 'lengte', label: 'Lengte', type: 'number' }, { key: 'hoogte', label: 'Hoogte', type: 'number' }]);
  const result = build(rows, initial(rows, targets), targets, 0);
  assert.equal(result.error, '');
  assert.deepEqual(result.patches[0].values, { lengte: '3800', hoogteLinks: '0', hoogteRechts: '1750', shape: 'slope' });
});
