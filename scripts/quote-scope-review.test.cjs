const assert = require('node:assert/strict');
const { test } = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const Module = require('node:module');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
    return resolve.call(this, name.startsWith('@/') ? process.cwd() + '/src/' + name.slice(2) : name, ...args);
};
const { addScopeDecisions, scopeReviewSources } = require('../src/lib/quote-scope-review');
const { toStructuredWorkDescription, completeStructuredWorkDescription } = require('../src/lib/quote-calculations');
const { resolveQuotePdfWorkDescription, forceSummaryIntoWorkScope } = require('../src/lib/quote-pdf-data');

function reopen(work) {
    const saved = forceSummaryIntoWorkScope(toStructuredWorkDescription({ werkbeschrijving_structured: work }));
    return resolveQuotePdfWorkDescription({ werkbeschrijving_structured: JSON.parse(JSON.stringify(saved)) });
}

test('gekozen klusspecifieke tekst blijft bij opslaan en PDF-heropening naast de standaardregels staan', () => {
    const work = completeStructuredWorkDescription({ title: 'Plafond', summary: 'Platen tussen zichtbalken.', nadenVullenInbegrepen: true });
    const decision = { topic: 'Zichtbalken', kind: 'excluded', text: 'De schilder verzorgt het afplakken en afkitten van de balkranden vóór het schilderen.' };
    const first = reopen(addScopeDecisions(work, [decision]));
    assert.ok(first.excluded.includes(decision.text));
    assert.ok(first.included.length > 0);
    const again = reopen(addScopeDecisions(first, [decision]));
    assert.equal(again.excluded.filter(row => row === decision.text).length, 1);
    const revised = { ...decision, kind: 'included', text: 'Wij plakken de zichtbalken af en kitten de randen vóór het schilderen.' };
    const changed = reopen(addScopeDecisions(again, [revised]));
    assert.ok(!changed.excluded.includes(decision.text));
    assert.ok(changed.included.includes(revised.text));
    const removed = reopen({ ...changed, included: changed.included.filter(row => row !== revised.text) });
    assert.ok(!removed.included.includes(revised.text));
});

test('opname vóór calculatie en bestaande offertes houden notities, maatregels en offertescheidingen herkenbaar', () => {
    assert.deepEqual(scopeReviewSources('', 'Klant wil direct kunnen schilderen.', [], null).map(s => s.label), ['Notities']);
    const work = toStructuredWorkDescription({ werkbeschrijving_structured: {
        title: 'Plafond', summary: 'Platen monteren.', included: ['Alleen plaatnaden.'], excluded: ['Kitten langs balken.'],
        jobs: [{ title: 'Deel A', dimensions: ['L = 3050 mm', 'L = 3050 mm'] }],
    } });
    const sources = scopeReviewSources('Aanvraag plafond', '', ['Gips 12,5 mm'], work);
    assert.equal(sources.find(s => s.label === 'Werk & levering · uitgesloten').text, 'Kitten langs balken.');
    assert.equal(sources.find(s => s.label === 'Klus 1').text.match(/3050/g).length, 2);
});
