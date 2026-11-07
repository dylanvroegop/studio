/** Bewaar alle factuurvelden en verstuur altijd een JSON-string naar n8n HTTP Request. */
function repairDocumentContract(original) {
  const workflow = structuredClone(original);
  const node = workflow.nodes.find(item => item.name === 'Maak Kost Aan');
  const body = node?.parameters?.jsonBody;
  if (typeof body !== 'string' || !body.includes('$json.data')) {
    throw new Error('Onbekend kostencontract; pas de workflow niet blind aan.');
  }
  const uid = body.match(/user_id\s*:\s*['"]([^'"]+)['"]/)?.[1];
  node.parameters.jsonBody = '={{ JSON.stringify({ ...$json.data' +
    (uid ? `, user_id: ${JSON.stringify(uid)}` : '') +
    ", category: $json.data.suggested_category || 'overig', status: 'confirmed' }) }}";
  node.retryOnFail = true;
  node.maxTries = 5;
  node.waitBetweenTries = 5000;
  const confirm = workflow.nodes.find(item => item.name === 'Bevestig geslaagde import');
  if (confirm) confirm.parameters.jsCode = `return $input.all().map((item, index) => {
const result = item.json;
const ids = result.cost_ids || result.rows?.map(row => row.id) || (result.data?.id ? [result.data.id] : []);
if (result.ok !== true || result.pending === true || !ids.length || ids.some(id => !id)) throw new Error('Calvora heeft geen geboekte kosten bevestigd. Niet als verwerkt geregistreerd.');
return { json: { processing_key: $('Verwerk bijlage').item.json.processing_key }, pairedItem: { item: index } };
});`;
  return workflow;
}
module.exports = { repairDocumentContract };
if (require.main === module) {
  const fs = require('node:fs');
  const [input, output] = process.argv.slice(2);
  fs.writeFileSync(output, JSON.stringify(repairDocumentContract(JSON.parse(fs.readFileSync(input))), null, 2), { mode: 0o600 });
}
