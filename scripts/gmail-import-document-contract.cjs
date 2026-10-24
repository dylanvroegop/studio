/** Bewaar de documentidentiteit bij de overdracht van n8n naar kosten/create. */
function repairDocumentContract(original) {
  const workflow = structuredClone(original);
  const node = workflow.nodes.find(item => item.name === 'Maak Kost Aan');
  if (!node || typeof node.parameters?.jsonBody !== 'string') {
    throw new Error('Maak Kost Aan met JSON-body ontbreekt.');
  }
  const body = node.parameters.jsonBody;
  if (!/\bdocument_type\s*:/.test(body)) {
    if (!body.includes('supplier_name: $json.data.supplier_name')) {
      throw new Error('Onbekend kostencontract; pas de workflow niet blind aan.');
    }
    node.parameters.jsonBody = body.replace(
      'supplier_name: $json.data.supplier_name',
      'document_type: $json.data.document_type, supplier_name: $json.data.supplier_name',
    );
  }
  return workflow;
}

module.exports = { repairDocumentContract };
if (require.main === module) {
  const fs = require('node:fs');
  const [input, output] = process.argv.slice(2);
  fs.writeFileSync(output, JSON.stringify(repairDocumentContract(JSON.parse(fs.readFileSync(input))), null, 2), { mode: 0o600 });
}
