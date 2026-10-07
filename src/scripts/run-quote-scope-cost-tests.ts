import assert from 'node:assert/strict';
import path from 'node:path';
import Module from 'node:module';
import { getMissingScopeCosts, getScopeCosts, setScopeCost } from '../lib/quote-scope-costs';
import type { MaterialItem, QuoteSettings, WorkDescriptionJob } from '../lib/quote-calculations';

const moduleResolver = Module as unknown as {
    _resolveFilename: (request: string, parent: unknown, isMain: boolean, options: unknown) => string;
};
const originalResolveFilename = moduleResolver._resolveFilename;
moduleResolver._resolveFilename = function resolveFilename(request: string, parent: unknown, isMain: boolean, options: unknown) {
    return originalResolveFilename.call(this, request.startsWith('@/') ? path.join(__dirname, '..', request.slice(2)) : request, parent, isMain, options);
};
// Laad pas nadat de Next.js-padalias voor deze losse test is ingesteld.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { calculateQuoteTotals } = require('../lib/quote-calculations') as typeof import('../lib/quote-calculations');
const item = (product: string, aantal: number, prijs_per_stuk: number): MaterialItem => ({ product, aantal, prijs_per_stuk });
const original = {
    groot: [item('Hout', 2, 100), item('Afvalkosten', 2, 20)],
    verbruik: [item('Extra kosten', 1, 30), item('Kit', 2, 10), item('afvalkosten', 1, 10), item('Steigerkosten', 3, 10)],
};
const before = JSON.stringify(original);
assert.deepEqual(getScopeCosts(original), { afval: 50, steiger: 30, groot: 40, verbruik: 40 });
const changed = setScopeCost(original, 'afval', 100);
assert.equal(JSON.stringify(original), before, 'Bestaande invoer niet muteren');
assert.deepEqual(getScopeCosts(changed), { afval: 100, steiger: 30, groot: 0, verbruik: 130 });
assert.ok(changed.verbruik.some((row) => row.product === 'Extra kosten' && row.prijs_per_stuk === 30));
const reloaded = JSON.parse(JSON.stringify(setScopeCost(changed, 'steiger', 50)));
assert.deepEqual(getScopeCosts(reloaded), { afval: 100, steiger: 50, groot: 0, verbruik: 150 });
const settings: QuoteSettings = {
    btwTarief: 21, uurTariefExclBtw: 50,
    extras: { transport: { mode: 'none' }, winstMarge: { mode: 'fixed', fixedAmount: 0, percentage: 0, basis: 'totaal' } },
};
for (const btwMode of ['normaal', 'materiaal_only'] as const) {
    const totals = calculateQuoteTotals({ grootmaterialen: reloaded.groot, verbruiksartikelen: reloaded.verbruik }, { ...settings, btwMode });
    assert.equal(totals.materialenTotaal, 400);
    assert.equal(totals.totaalInclBtw, 484, 'Elke kostenpost telt precies eenmaal mee, inclusief btw');
    const split = getScopeCosts(reloaded);
    assert.equal(totals.materialenGroot - split.groot + totals.materialenVerbruik - split.verbruik + split.afval + split.steiger, totals.materialenTotaal);
}
const enabled = { afvalAfvoeren: true, steigerInbegrepen: true, jobs: [] };
assert.deepEqual(getMissingScopeCosts(enabled, { afval: 0, steiger: 0 }), { afval: true, steiger: true });
assert.deepEqual(getMissingScopeCosts(enabled, getScopeCosts(reloaded)), { afval: false, steiger: false });
assert.deepEqual(getMissingScopeCosts(enabled, getScopeCosts(setScopeCost(reloaded, 'afval', 0))), { afval: true, steiger: false });
assert.deepEqual(getMissingScopeCosts({ ...enabled, afvalAfvoeren: false, steigerInbegrepen: false }, { afval: 0, steiger: 0 }), { afval: false, steiger: false });
const legacyJobs = [{ afvalAfvoeren: true, steigerInbegrepen: true } as WorkDescriptionJob];
assert.deepEqual(
    getMissingScopeCosts({ afvalAfvoeren: false, steigerInbegrepen: false, jobs: legacyJobs }, { afval: 0, steiger: 0 }),
    { afval: false, steiger: false },
    'Uitgeschakelde offerteschakelaars onderdrukken waarschuwingen ondanks oude kluswaarden',
);
assert.deepEqual(
    getMissingScopeCosts({ afvalAfvoeren: false, steigerInbegrepen: true, jobs: legacyJobs }, { afval: 0, steiger: 0 }),
    { afval: false, steiger: true },
    'Afval uitschakelen behoudt een terechte waarschuwing voor ontbrekende steigerkosten',
);
console.log('Kostencontrole geslaagd: bewaren, vervangen, herladen, btw, geen dubbeltelling en offerteschakelaars.');
