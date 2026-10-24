const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { costImportClaimDecision, bookedCostRowsMatch, receiptFilesWithDocumentType } = require('../src/lib/cost-import-idempotency');

const booked = { userId: 'user', status: 'booked', costIds: ['cost-a', 'cost-b'] };
const totals = { amount_excl_btw: 100, btw_amount: 21, amount_incl_btw: 121 };
const rows = [{ id: 'cost-a', user_id: 'user', amount_excl_btw: 60, btw_amount: 12.6, amount_incl_btw: 72.6 },
  { id: 'cost-b', user_id: 'user', amount_excl_btw: 40, btw_amount: 8.4, amount_incl_btw: 48.4 }];

test('nieuwe identiteit mag alleen zonder eerdere claims boeken', () => {
  assert.deepEqual(costImportClaimDecision('user', []), { state: 'new' });
});

test('geboekte factuur-, hash- en archiefclaims met dezelfde kosten zijn herhaalbaar', () => {
  assert.deepEqual(costImportClaimDecision('user', [booked, { ...booked, costIds: ['cost-b', 'cost-a'] }]),
    { state: 'booked', costIds: ['cost-a', 'cost-b'] });
  assert.equal(bookedCostRowsMatch('user', ['cost-a', 'cost-b'], rows, totals), true);
});

test('processing, fouten, ontbrekende ids en andere eigenaars blijven geblokkeerd', () => {
  for (const invalid of [{ ...booked, status: 'processing' }, { ...booked, status: 'failed' },
    { ...booked, costIds: [] }, { ...booked, costIds: [null] }, { ...booked, userId: 'someone-else' }]) {
    assert.deepEqual(costImportClaimDecision('user', [booked, invalid]), { state: 'blocked' });
  }
});

test('gedeeltelijke of tegenstrijdige claims worden nooit automatisch opnieuw verwerkt', () => {
  assert.deepEqual(costImportClaimDecision('user', [booked, { ...booked, costIds: ['cost-a'] }]), { state: 'blocked' });
  assert.deepEqual(costImportClaimDecision('user', [booked, { ...booked, costIds: ['other-cost'] }]), { state: 'blocked' });
});

test('bestaande kosten moeten compleet zijn, van de gebruiker zijn en dezelfde bedragen hebben', () => {
  assert.equal(bookedCostRowsMatch('user', booked.costIds, rows.slice(0, 1), totals), false);
  assert.equal(bookedCostRowsMatch('user', booked.costIds, [rows[0], rows[0]], totals), false);
  assert.equal(bookedCostRowsMatch('user', booked.costIds, rows.map(row => ({ ...row, user_id: 'other' })), totals), false);
  assert.equal(bookedCostRowsMatch('user', booked.costIds, rows, { ...totals, amount_incl_btw: 125 }), false);
  assert.equal(bookedCostRowsMatch('user', booked.costIds, rows, { ...totals, btw_amount: null }), false);
  assert.equal(bookedCostRowsMatch('user', booked.costIds, rows.map(row => ({ ...row, btw_amount: null })), totals), false);
});

test('creditbedragen worden ook bij duplicaten op hun echte teken gecontroleerd', () => {
  const credit = { id: 'credit', user_id: 'user', amount_excl_btw: -100, btw_amount: -21, amount_incl_btw: -121 };
  assert.equal(bookedCostRowsMatch('user', ['credit'], [credit], credit), true);
  assert.equal(bookedCostRowsMatch('user', ['credit'], [credit], totals), false);
});

test('importtype wordt op nieuwe bijlagen bewaard, bestaande afkeur wordt niet overschreven', () => {
  const files = [{ url: 'https://example.invalid/invoice.pdf', filename: 'invoice.pdf' },
    { url: 'https://example.invalid/order.pdf', document_type: 'order_confirmation', document_review_note: 'Geen factuur' },
    { url: 'https://example.invalid/unknown.pdf', document_type: 'unknown' }];
  const typed = receiptFilesWithDocumentType(files, ' Invoice ');
  assert.equal(typed[0].document_type, 'invoice');
  assert.equal(typed[1].document_type, 'order_confirmation');
  assert.equal(typed[1].document_review_note, 'Geen factuur');
  assert.equal(typed[2].document_type, 'unknown');
  assert.equal(files[0].document_type, undefined);
  assert.equal(receiptFilesWithDocumentType(files, null)[0].document_type, undefined);
});
