const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { summarizeTimeEntries } = require('../src/lib/time-entry-totals');

test('GPS werk, leveranciersbezoek en alle rijtijd tellen ieder eenmaal', () => {
  const result = summarizeTimeEntries([{ worked_hours: 8, exact_minutes: 480, onsite_minutes: 360, supplier_stop_minutes: 30, outbound_travel_minutes: 20, return_travel_minutes: 25, client_transfer_minutes: 15, supplier_travel_minutes: 30 }]);
  assert.deepEqual(result, { entries: 1, workMinutes: 360, supplierMinutes: 30, driveMinutes: 90, unsplitMinutes: 0 });
});
test('handmatige en oude GPS uren zonder uitsplitsing blijven apart', () => {
  const result = summarizeTimeEntries([{ worked_hours: 2 }, { exact_minutes: 75, source: 'gps_tracking_auto' }]);
  assert.deepEqual(result, { entries: 2, workMinutes: 0, supplierMinutes: null, driveMinutes: null, unsplitMinutes: 195 });
});
test('geen registraties betekent geen gemeten rijtijd', () => {
  assert.equal(summarizeTimeEntries([]).driveMinutes, null);
});
test('gemengde registratie behoudt nog niet uitgesplitste minuten', () => {
  const result = summarizeTimeEntries([{ exact_minutes: 120, onsite_minutes: 60, supplier_stop_minutes: 15, supplier_travel_minutes: 15 }, { worked_hours: 1 }]);
  assert.equal(result.unsplitMinutes, 90);
  assert.equal(result.workMinutes + result.supplierMinutes + result.driveMinutes + result.unsplitMinutes, 180);
});
