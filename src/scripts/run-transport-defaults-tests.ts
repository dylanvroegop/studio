import assert from 'node:assert/strict';
import path from 'node:path';
import Module from 'node:module';
import { buildEmptyQuoteDefaults } from '../lib/quote-defaults';
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

const oldQuote = buildEmptyQuoteDefaults({settings:{standaardTransport:{mode:'perKm',prijsPerKm:0.23}}});
const newQuote = buildEmptyQuoteDefaults({instellingen:{standaardTransport:{mode:'perKm',prijsPerKm:0.23}},settings:{standaardTransport:{mode:'perKm',prijsPerKm:0.4}}});
assert.equal(newQuote.extras.transport.prijsPerKm, 0.4);
assert.equal(oldQuote.extras.transport.prijsPerKm, 0.23);
assert.equal(buildEmptyQuoteDefaults({instellingen:{standaardTransport:{mode:'perKm',prijsPerKm:0.31}}}).extras.transport.prijsPerKm, 0.31);
assert.equal(buildEmptyQuoteDefaults({settings:{standaardTransport:{mode:'perKm',prijsPerKm:0}}}).extras.transport.prijsPerKm, 0);
const settings:any={...newQuote.instellingen,extras:{...newQuote.extras,winstMarge:{mode:'none'}}};
const result=calculateQuoteTotals({totaal_uren:8,transport_berekening:{roundTripDistanceKm:100}}, settings);
assert.equal(result.transportDistanceKmOneWay,50);
assert.equal(result.transportOneWayCost,20);
assert.equal(result.transportRoundTripCost,40);
console.log('Transport: actuele standaard, bestaande snapshot, legacy, nul en retourafstand geslaagd.');
