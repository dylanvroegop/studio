const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { gpsDistanceKm, amsterdamMidnight } = require('../src/lib/tracking-distance');
test('afstand uit GPS-punten, niet uit rijtijd', () => {
  const distance = gpsDistanceKm([{ latitude: 0, longitude: 0, recorded_at: '2026-10-01T10:00:00Z' }, { latitude: 0, longitude: 1, recorded_at: '2026-10-01T11:00:00Z' }]);
  assert.ok(Math.abs(distance - 111.195) < 0.01);
});
test('ontbrekende GPS is onbekend', () => assert.equal(gpsDistanceKm([]), null));
test('Amsterdam daggrenzen werken over zomer- en wintertijd', () => {
  assert.equal(amsterdamMidnight('2026-10-25'), '2026-10-24T22:00:00.000Z');
  assert.equal(amsterdamMidnight('2026-10-26'), '2026-10-25T23:00:00.000Z');
  assert.equal(amsterdamMidnight('2026-03-29'), '2026-03-28T23:00:00.000Z');
  assert.equal(amsterdamMidnight('2026-03-30'), '2026-03-29T22:00:00.000Z');
});
