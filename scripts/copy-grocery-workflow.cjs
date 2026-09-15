const { randomUUID } = require('node:crypto');
const fs = require('node:fs');

function copyGroceryWorkflow(source) {
  if (source.nodes.filter(node => node.parameters?.url === 'https://app.calvora.nl/api/material-lists/telegram').length !== 2) {
    throw new Error('Verwacht de materiaallijstworkflow met tekst- en spraakopslag.');
  }
  const nodes = structuredClone(source.nodes);
  for (const node of nodes) {
    node.id = randomUUID();
    if (node.webhookId) node.webhookId = randomUUID();
    if (node.credentials?.telegramApi) delete node.credentials.telegramApi;
    if (node.parameters.url === 'https://app.calvora.nl/api/material-lists/telegram') {
      node.parameters.url = 'https://app.calvora.nl/api/grocery-lists/telegram';
    }
    if (typeof node.parameters.text === 'string') {
      node.parameters.text = node.parameters.text.replaceAll('materiaallijst', 'boodschappenlijst');
    }
  }
  return {
    name: 'boodschappenlijst',
    nodes,
    connections: structuredClone(source.connections),
    settings: structuredClone(source.settings),
    active: false,
    pinData: {},
  };
}

module.exports = { copyGroceryWorkflow };

if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Gebruik: node scripts/copy-grocery-workflow.cjs <bron.json> <kopie.json>');
  fs.writeFileSync(output, JSON.stringify(copyGroceryWorkflow(JSON.parse(fs.readFileSync(input, 'utf8'))), null, 2), { mode: 0o600 });
}
