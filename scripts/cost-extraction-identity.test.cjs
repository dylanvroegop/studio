const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { costExtractionIdentity } = require('../src/lib/cost-extraction-identity');
const { costDocumentError, costDocumentKeys } = require('../src/lib/cost-document-policy');

const totals = { supplier_name: 'Derks', amount_excl_btw: 1495.07, btw_amount: 313.96, amount_incl_btw: 1809.03 };
test('extractie geeft een boekbaar documenttype en blijvende factuuridentiteit door', () => {
  const identity = costExtractionIdentity({ document_type: 'Invoice', supplier_invoice_number: ' 56264037 ' },
    { document_type: 'invoice', supplier_invoice_number: 56264037 });
  assert.equal(identity.document_type, 'invoice');
  assert.equal(identity.supplier_invoice_number, '56264037');
  assert.equal(identity.warning, null);
  assert.equal(costDocumentError({ ...totals, ...identity }), null);
  assert.equal(costDocumentKeys('user', { ...totals, ...identity }).length, 1);
});

test('orders, betaalverzoeken en ontbrekende classificatie worden nooit automatisch facturen', () => {
  for (const document_type of ['order_confirmation', 'payment_order', 'proforma', undefined, 'not_a_supported_type']) {
    const identity = costExtractionIdentity({ document_type, supplier_order_number: '56264037' });
    assert.notEqual(identity.document_type, 'invoice');
    assert.equal(identity.supplier_invoice_number, null);
    assert.ok(costDocumentError({ ...totals, ...identity }));
  }
});

test('tegenstrijdige documentlezingen vereisen controle in plaats van een automatische boeking', () => {
  const identity = costExtractionIdentity({ document_type: 'invoice', supplier_invoice_number: '56264037' },
    { document_type: 'order_confirmation', supplier_invoice_number: '56264037' });
  assert.equal(identity.document_type, 'unknown');
  assert.match(identity.warning, /documenttype/);
  assert.ok(costDocumentError({ ...totals, ...identity }));
});

test('tegenstrijdige factuurnummers verliezen hun deduplicatiesleutel, niet de waarschuwing', () => {
  const identity = costExtractionIdentity({ document_type: 'invoice', supplier_invoice_number: '56264037' },
    { document_type: 'invoice', supplier_invoice_number: '56263658' });
  assert.equal(identity.supplier_invoice_number, null);
  assert.match(identity.warning, /factuurnummer/);
  assert.deepEqual(costDocumentKeys('user', { ...totals, ...identity }), []);
});

test('nul en voorloopnullen in echte factuurnummers blijven behouden', () => {
  assert.equal(costExtractionIdentity({ document_type: 'receipt', supplier_invoice_number: '000123' }).supplier_invoice_number, '000123');
  assert.equal(costExtractionIdentity({ document_type: 'receipt', supplier_invoice_number: 0 }).supplier_invoice_number, '0');
});
