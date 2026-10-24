const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { costDocumentSourceLabel } = require('../src/lib/cost-document-display');

test('expliciete bestelbevestiging, offerte en proforma heten geen factuur', () => {
  for (const type of ['order_confirmation', 'order', 'quote', 'quotation', 'proforma', 'payment_order', 'payment_request', 'payment_confirmation', 'payment_proof', 'delivery_note', 'reminder']) {
    assert.match(costDocumentSourceLabel({ document_type: type }), /· geen factuur$/);
  }
  assert.equal(costDocumentSourceLabel({ document_type: ' Order_confirmation ' }), 'Bestelbevestiging · geen factuur');
});

test('finale facturen, bonnen en creditnotas behouden de gewone weergave', () => {
  for (const type of ['invoice', 'receipt', 'credit_note', 'Invoice', undefined, null, '']) {
    assert.equal(costDocumentSourceLabel({ document_type: type }), null);
  }
});

test('onbekende en onleesbare documenten claimen geen bevestigde factuur', () => {
  for (const type of ['unknown', 'unreadable', 'other', 'legacy_non_invoice_type']) {
    assert.match(costDocumentSourceLabel({ document_type: type }), /geen bevestigde factuur$/);
  }
});
