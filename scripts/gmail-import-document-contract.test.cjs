const test = require('node:test');
const assert = require('node:assert/strict');
const { repairDocumentContract } = require('./gmail-import-document-contract.cjs');

test('invoice, creditnota en documentidentiteit bereiken de kosten-API ongewijzigd', () => {
  const original = { nodes: [{ name: 'Maak Kost Aan', parameters: {
    jsonBody: '={{ ({ supplier_name: $json.data.supplier_name, supplier_invoice_number: $json.data.supplier_invoice_number, amount_incl_btw: $json.data.amount_incl_btw, receipt_files: $json.data.receipt_files }) }}',
  } }] };
  const fixed = repairDocumentContract(original);
  for (const type of ['invoice', 'receipt', 'credit_note', 'order_confirmation', 'other']) {
    const data = { document_type: type, supplier_name: 'Leverancier', supplier_invoice_number: '2026-123', amount_incl_btw: type === 'credit_note' ? -121 : 121, receipt_files: [{ archive_id: 'original' }] };
    const expression = fixed.nodes[0].parameters.jsonBody.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '');
    assert.deepEqual(new Function('$json', `return ${expression}`)({ data }), data);
  }
  assert.deepEqual(repairDocumentContract(fixed), fixed);
  assert.ok(!original.nodes[0].parameters.jsonBody.includes('document_type'));
});

test('onbekend contract wordt niet stilzwijgend gewijzigd', () => {
  assert.throws(() => repairDocumentContract({ nodes: [] }));
  assert.throws(() => repairDocumentContract({ nodes: [{ name: 'Maak Kost Aan', parameters: { jsonBody: '={{ $json }}' } }] }));
});
