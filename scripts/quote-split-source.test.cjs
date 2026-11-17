const assert = require('node:assert/strict');
const { test } = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { stableSplitSourceKey, splitSourceChanges, acceptSplitAnalysisSource } = require('../src/lib/quote-split-source.ts');
const source = () => ['calc', { grootmaterialen: [{ product: 'Vuren', aantal: 40, prijs_per_stuk: 4.95 }], totaal_uren: 50 }, { btwTarief: 21, extras: { transport: { mode: 'none', prijsPerKm: 0.4 } } }, { wall: { maatwerk: { hoogte: 2650, lengte: 3625 } }, ceiling: { titel: 'Plafond' } }];
test('Firestores andere veldvolgorde is geen inhoudelijke wijziging, ook voor een open voorstel', () => {
 const before = source();
 const after = structuredClone(before);
 after[3] = { ceiling: before[3].ceiling, wall: { maatwerk: { lengte: 3625, hoogte: 2650 } } };
 after[1] = { totaal_uren: 50, grootmaterialen: [{ aantal: 40, prijs_per_stuk: 4.95, product: 'Vuren' }] };
 assert.notEqual(JSON.stringify(before), JSON.stringify(after));
 assert.equal(stableSplitSourceKey(before), stableSplitSourceKey(after));
 assert.deepEqual(splitSourceChanges(JSON.stringify(before), stableSplitSourceKey(after)), []);
});
test('echte wijzigingen in aantallen, uren, instellingen en klusmaten blijven geblokkeerd', () => {
 for (const [change, label] of [
  [s => s[0] = 'new', 'de calculatieversie'],
  [s => s[1].grootmaterialen[0].aantal = 41, 'de calculatiegegevens'],
  [s => s[1].totaal_uren = 51, 'de calculatiegegevens'],
  [s => s[2].btwTarief = 9, 'de prijsinstellingen'],
  [s => s[3].wall.maatwerk.hoogte = 2700, 'de calculatieklussen'],
 ]) { const after=source(); change(after); assert.deepEqual(splitSourceChanges(stableSplitSourceKey(source()),stableSplitSourceKey(after)),[label]); }
});
test('de volgorde van productregels blijft belangrijk voor de verdeling op bronindex', () => {
 const before=source(); before[1].grootmaterialen.push({product:'Gips',aantal:8,prijs_per_stuk:5});
 const after=structuredClone(before); after[1].grootmaterialen.reverse();
 assert.deepEqual(splitSourceChanges(stableSplitSourceKey(before),stableSplitSourceKey(after)),['de calculatiegegevens']);
});

test('een nieuw gevalideerd AI-voorstel vervangt de oude bronversie, maar een wijziging tijdens analyse niet', () => {
 const initial=stableSplitSourceKey(source());
 const updated=source();updated[1].totaal_uren=51;
 const analyzed=stableSplitSourceKey(updated);
 assert.deepEqual(splitSourceChanges(initial,analyzed),['de calculatiegegevens']);
 const accepted=acceptSplitAnalysisSource(analyzed,analyzed);
 assert.deepEqual(splitSourceChanges(accepted,analyzed),[]);
 assert.throws(()=>acceptSplitAnalysisSource(initial,analyzed),/tijdens de analyse gewijzigd/);
});
