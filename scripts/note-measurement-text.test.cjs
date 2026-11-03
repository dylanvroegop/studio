const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const { formatNoteMeasurementTexts: format } = require('../src/lib/note-measurement-text');
const { noteSurfaceArea } = require('../src/lib/note-surfaces');
const title = 'Boeidelen (Trespa/HPL) 1 — Boeiboord 2';
const row = values => ({ title, length: '', width: '', height: '', thickness: '', shape: 'rectangle', ...values });

test('bestaande boeiboordtekst toont de vier benoemde maten en de Nederlandse vorm', () => {
    const source = row({ title: `${title} (Lengte Onderzijde 5000 mm; Latafstand Voorzijde (h.o.h.) 300 mm; Latafstand Onderzijde (h.o.h.) 300 mm)`, length: '5000', width: '520', height: '100' });
    const before = structuredClone(source);
    assert.deepEqual(format([source]), [`${title} | Lengte onderzijde = 5000 mm | Breedte onderzijde = 520 mm | Lengte voorzijde = 5000 mm | Hoogte voorzijde = 100 mm | Vorm: rechthoek`]);
    assert.deepEqual(source, before);
});

test('voorzijde en onderzijde houden hun onafhankelijke lengte; oppervlakte blijft gelijk', () => {
    const rows = [row({ title: `${title} — Voorzijde`, length: '5000', height: '100' }),
        row({ title: `${title} — Onderzijde`, length: '4200', width: '520' })];
    const before = structuredClone(rows);
    assert.deepEqual(format(rows), [`${title} | Lengte onderzijde = 4200 mm | Breedte onderzijde = 520 mm | Lengte voorzijde = 5000 mm | Hoogte voorzijde = 100 mm | Vorm: rechthoek`]);
    assert.deepEqual(rows, before);
    assert.equal(rows.reduce((total, value) => total + noteSurfaceArea(value), 0), 2.684);
});

test('een ontbrekend vlak wordt niet aangevuld met maten van het andere vlak', () => {
    assert.deepEqual(format([row({ title: `${title} — Onderzijde`, length: '5000', width: '520' })]),
        [`${title} | Lengte onderzijde = 5000 mm | Breedte onderzijde = 520 mm | Vorm: rechthoek`]);
});

test('gespiegelde onderdelen en verschillende vormen blijven herkenbaar', () => {
    const rows = [1, 2].flatMap(copy => [row({ title: `${title} — Voorzijde ${copy}`, length: '5000', shape: 'slope', hoogteLinks: '0', hoogteRechts: '100' }),
        row({ title: `${title} — Onderzijde ${copy}`, length: '5000', width: '520' })]);
    const result = format(rows);
    assert.equal(result.length, 2);
    assert.match(result[0], /Boeiboord 2 1/);
    assert.match(result[1], /Boeiboord 2 2/);
    assert.match(result[0], /Hoogte links voorzijde = 0 mm/);
    assert.match(result[0], /Vorm: schuin \/ driehoek$/);
});

test('gewone maten krijgen geen voorzijde of onderzijde toegewezen', () => {
    assert.deepEqual(format([row({ title: 'Wand', length: '5000', height: '2600' })]),
        ['Wand | Lengte = 5000 mm | Hoogte = 2600 mm | Vorm: rechthoek']);
});
