const test = require('node:test');
const assert = require('node:assert/strict');
const { repairDocumentContract } = require('./gmail-import-document-contract.cjs');

test('invoice, creditnota en documentidentiteit bereiken de kosten-API ongewijzigd', () => {
  const original = { nodes: [{ name: 'Maak Kost Aan', parameters: {
    jsonBody: '= {{ ({ supplier_name: $json.data.supplier_name, supplier_invoice_number: $json.data.supplier_invoice_number, amount_incl_btw: $json.data.amount_incl_btw, receipt_files: $json.data.receipt_files }) }}',
  } }] };
  const fixed = repairDocumentContract(original);
  for (const type of ['invoice', 'receipt', 'credit_note', 'order_confirmation', 'other']) {
    const data = { document_type: type, supplier_name: 'Leverancier', supplier_invoice_number: '2026-123', amount_incl_btw: type === 'credit_note' ? -121 : 121, receipt_files: [{ archive_id: 'original' }] };
    const expression = fixed.nodes[0].parameters.jsonBody.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '');
    const serialized = new Function('$json', `return ${expression}`)({ data });
    assert.equal(typeof serialized, 'string');
    assert.deepEqual(JSON.parse(String(serialized)), { ...data, category: 'overig', status: 'confirmed' });
  }
  assert.deepEqual(repairDocumentContract(fixed), fixed);
  assert.ok(!original.nodes[0].parameters.jsonBody.includes('document_type'));
});

test('onbekend contract wordt niet stilzwijgend gewijzigd', () => {
  assert.throws(() => repairDocumentContract({ nodes: [] }));
  assert.throws(() => repairDocumentContract({ nodes: [{ name: 'Maak Kost Aan', parameters: { jsonBody: '={{ $json }}' } }] }));
});


test('een pending antwoord telt niet als geslaagde boeking', () => {
  const fixed = repairDocumentContract({ nodes: [
    { name: 'Maak Kost Aan', parameters: { jsonBody: '={{ $json.data }}' } },
    { name: 'Bevestig geslaagde import', parameters: {} },
  ] });
  const run = new Function('$input', '$', fixed.nodes[1].parameters.jsCode);
  const source = () => ({ item: { json: { processing_key: 'mailbox-message-attachment' } } });
  for (const value of [{ok:true,pending:true}, {ok:true}, {ok:false}]) {
    assert.throws(() => run({all:()=>[{json:value}]},source));
  }
  assert.equal(run({all:()=>[{json:{ok:true,rows:[{id:'booked'}]}}]},source)[0].json.processing_key,'mailbox-message-attachment');
});
