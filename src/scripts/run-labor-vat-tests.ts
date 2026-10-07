import assert from 'node:assert/strict';
import path from 'node:path';
import Module from 'node:module';
import type { QuoteSettings } from '../lib/quote-calculations';

const resolver = Module as unknown as { _resolveFilename: (request: string, parent: unknown, isMain: boolean, options: unknown) => string };
const originalResolve = resolver._resolveFilename;
resolver._resolveFilename = function (request, parent, isMain, options) {
    return originalResolve.call(this, request.startsWith('@/') ? path.join(__dirname, '..', request.slice(2)) : request, parent, isMain, options);
};
const { calculateQuoteTotals } = require('../lib/quote-calculations') as typeof import('../lib/quote-calculations');
const { resolveQuoteCalculationSettings } = require('../lib/quote-pdf-data') as typeof import('../lib/quote-pdf-data');
const { buildInvoiceCostTable } = require('../lib/generate-invoice-pdf') as typeof import('../lib/generate-invoice-pdf');

const data = { grootmaterialen: [{ product: 'Hout', aantal: 1, prijs_per_stuk: 100 }], totaal_uren: 10 };
const settings: QuoteSettings = {
    btwTarief: 21, uurTariefExclBtw: 50, arbeidBtwLaagUren: 4, arbeidBtwLaagTarief: 9,
    extras: {
        transport: { mode: 'fixed', vasteTransportkosten: 20 },
        winstMarge: { mode: 'fixed', fixedAmount: 30, percentage: 0, basis: 'totaal' },
    },
};
const normal = calculateQuoteTotals(data, settings, 10);
const withoutVatSettings = { ...settings, arbeidZonderBtw: true };
const withoutVat = calculateQuoteTotals(data, withoutVatSettings, 10);
assert.equal(normal.btw, 112.5);
assert.equal(withoutVat.arbeidTotaal, 500);
assert.equal(withoutVat.totaalExclBtw, 650);
assert.equal(withoutVat.btw, 31.5, 'Btw blijft gelden over materiaal, transport en marge');
assert.equal(withoutVat.totaalInclBtw, 681.5);
assert.equal(withoutVat.btwLaag, 0, 'Ook uren met laag btw-tarief zijn zonder btw');
assert.equal(withoutVat.arbeidHoogBtwTarief, 0);
assert.equal(withoutVat.arbeidLaagBtwTarief, 0);
assert.equal(withoutVat.winstProjectie.btwArbeidEnMarge, 6.3);
assert.equal(withoutVat.winstProjectie.winstNaBtwArbeidEnMarge, normal.winstProjectie.winstNaBtwArbeidEnMarge);
assert.equal(calculateQuoteTotals(data, { ...withoutVatSettings, arbeidZonderBtw: false }, 10).btw, normal.btw);
for (const lowHours of [0, 10]) {
    assert.equal(calculateQuoteTotals(data, { ...withoutVatSettings, arbeidBtwLaagUren: lowHours }, 10).btw, 31.5);
}
assert.equal(calculateQuoteTotals(data, { ...settings, btwMode: 'materiaal_only' }, 10).btw, 21);

const saved = JSON.parse(JSON.stringify({ ...data, instellingen: withoutVatSettings }));
const restored = resolveQuoteCalculationSettings(saved, null);
assert.equal(restored.arbeidZonderBtw, true);
assert.equal(calculateQuoteTotals(saved, restored, 10).totaalInclBtw, 681.5);
assert.equal(resolveQuoteCalculationSettings(saved, { instellingen: { arbeidZonderBtw: false } }).arbeidZonderBtw, false);
assert.equal(resolveQuoteCalculationSettings({ instellingen: settings }, null).arbeidZonderBtw, false);

const invoice = buildInvoiceCostTable({
    calculationSnapshot: saved, totals: withoutVat, laborHoursPerDay: 10,
    showMaterialLaborBreakdown: true, showTransportBreakdown: true, showHourlyRateOnInvoice: true,
});
assert.equal(invoice.btw, 31.5);
assert.equal(invoice.totalInclBtw, 681.5);
assert.equal(invoice.rows.find((row) => row.label === 'Arbeid')?.amount, 500);
assert.equal(invoice.rows.some((row) => /^Arbeid .*%/.test(row.label)), false);
console.log('Arbeid-btw-controle geslaagd: aan/uit, lage en hoge btw, herladen en factuurtotalen.');
