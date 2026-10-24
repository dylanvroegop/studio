const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { costExtractionTotals } = require('../src/lib/cost-extraction-totals');
const { costDocumentError } = require('../src/lib/cost-document-policy');

test('alleen een brutobedrag krijgt geen aangenomen 21% btw', () => {
  for (const rate of [undefined, 21, 0]) {
    const result = costExtractionTotals({ total_incl_btw: 121, btw_percentage: rate });
    assert.equal(result.complete, false);
    assert.equal(result.amount_incl_btw, 121);
    assert.equal(result.amount_excl_btw, null);
    assert.equal(result.btw_amount, null);
    assert.ok(result.warning);
    assert.ok(costDocumentError({ document_type: 'invoice', ...result }));
  }
});

test('expliciete header netto en bruto bepalen de btw zonder aangenomen tarief', () => {
  const result = costExtractionTotals({ subtotal_excl_btw: 1495.07, total_incl_btw: 1809.03 });
  assert.equal(result.complete, true);
  assert.equal(result.btw_amount, 313.96);
  assert.equal(result.btw_percentage, 21);
  assert.equal(costDocumentError({ document_type: 'invoice', ...result }), null);
});

test('expliciete nul-btw en 0% blijven nul; ook bij volledig nuldocument', () => {
  for (const net of [100, 0]) {
    const result = costExtractionTotals({ subtotal_excl_btw: net, btw_amount: 0, btw_percentage: 0 });
    assert.equal(result.complete, true);
    assert.equal(result.amount_incl_btw, net);
    assert.equal(result.btw_amount, 0);
    assert.equal(result.btw_percentage, 0);
  }
});

test('bruto en expliciete btw bepalen netto bij gemengde tarieven', () => {
  const result = costExtractionTotals({ total_incl_btw: 139.13, btw_amount: 2.63, btw_percentage: 21 });
  assert.equal(result.complete, true);
  assert.equal(result.amount_excl_btw, 136.5);
  assert.equal(result.btw_amount, 2.63);
  assert.equal(result.amount_incl_btw, 139.13);
  assert.equal(result.btw_percentage, 1.93);
});

test('creditnota behoudt negatieve bedragen', () => {
  const result = costExtractionTotals({ net_amount: -100, tax_amount: -21 });
  assert.equal(result.complete, true);
  assert.equal(result.amount_incl_btw, -121);
  assert.equal(result.btw_percentage, 21);
});

test('tegenstrijdige documenttotalen worden niet stil gecorrigeerd', () => {
  const result = costExtractionTotals({ subtotal_excl_btw: 121, btw_amount: 21, total_incl_btw: 121 });
  assert.equal(result.complete, false);
  assert.equal(result.amount_excl_btw, 121);
  assert.equal(result.btw_amount, 21);
  assert.match(result.warning, /sluiten niet aan/);
});

test('null, lege tekst en booleans zijn geen nulbedragen; numerieke headeraliassen werken', () => {
  for (const empty of [undefined, null, '', ' ', false, true]) {
    const result = costExtractionTotals({ subtotal_excl_btw: empty, btw_amount: empty, total_incl_btw: 121 });
    assert.equal(result.complete, false);
    assert.equal(result.amount_excl_btw, null);
    assert.equal(result.btw_amount, null);
  }
  const result = costExtractionTotals({ totals: { net_amount: '100', gross_amount: '121' } });
  assert.equal(result.complete, true);
  assert.equal(result.btw_amount, 21);
});

test('ontbrekende header-btw wordt niet uit AI-regels of een percentage verzonnen', () => {
  const result = costExtractionTotals({ subtotal_excl_btw: 100, btw_percentage: 21,
    line_items: [{ total_price: 100, total_incl_btw: 121, btw_percentage: 21 }] });
  assert.equal(result.complete, false);
  assert.equal(result.amount_excl_btw, 100);
  assert.equal(result.btw_amount, null);
  assert.equal(result.amount_incl_btw, null);
});
