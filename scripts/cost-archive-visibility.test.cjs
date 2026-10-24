const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { COST_ARCHIVE_VISIBILITY, isCostArchiveVisible, isCostArchiveLinked } = require('../src/lib/cost-archive-visibility');
const metadata = { finance_visibility: COST_ARCHIVE_VISIBILITY };

test('nieuwe Gmail-bijlage blijft buiten Finance zolang er geen kostenpost is', () => {
  assert.equal(isCostArchiveVisible({ metadata, linked_cost_ids: [] }), false);
  assert.equal(isCostArchiveVisible({ metadata }), false);
  assert.equal(isCostArchiveVisible({ metadata, linked_cost_ids: ['  '] }), false);
});

test('goedgekeurde import of opgeslagen fotobon verschijnt na kostenkoppeling', () => {
  assert.equal(isCostArchiveVisible({ metadata, linked_cost_ids: ['cost-123'] }), true);
});

test('bestaande archieven worden niet achteraf verborgen of opgeschoond', () => {
  assert.equal(isCostArchiveVisible({ metadata: {}, linked_cost_ids: [] }), true);
  assert.equal(isCostArchiveVisible({ metadata: null }), true);
  assert.equal(isCostArchiveVisible({ linked_cost_ids: ['old-cost'] }), true);
});

test('expliciete bronweergave kan een mislukte import terugvinden zonder kostenkoppeling', () => {
  const record = { metadata, linked_cost_ids: [] };
  assert.equal(isCostArchiveVisible(record, true), true);
  assert.deepEqual(record.linked_cost_ids, []);
  assert.equal(isCostArchiveVisible(record), false);
});

test('een order is alleen een brondocument; zichtbaarheid geeft geen kostenboeking', () => {
  const record = { metadata: { ...metadata, document_type: 'order_confirmation' }, linked_cost_ids: [] };
  assert.equal(isCostArchiveVisible(record), false);
  assert.equal(isCostArchiveVisible(record, true), true);
  assert.deepEqual(record.linked_cost_ids, []);
});

test('UI zet oude ongekoppelde archieven alleen bij bronnen, onafhankelijk van API-compatibiliteit', () => {
  for (const record of [{ metadata: {}, linked_cost_ids: [] }, { metadata: null }, { linked_cost_ids: [' ', null] }]) {
    assert.equal(isCostArchiveVisible(record), true);
    assert.equal(isCostArchiveLinked(record), false);
  }
});

test('UI-kostenweergave vereist een werkelijke koppeling, niet alleen documenttype of metadata', () => {
  assert.equal(isCostArchiveLinked({ metadata: { document_type: 'invoice' } }), false);
  assert.equal(isCostArchiveLinked({ metadata, linked_cost_ids: ['cost-123'] }), true);
  assert.equal(isCostArchiveLinked({ linked_cost_ids: ['old-cost'] }), true);
});
