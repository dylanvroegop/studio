const { randomUUID } = require('node:crypto');

function reportMessages(data) {
  if (data?.ok !== true || data.version !== 1 || !Array.isArray(data.messages) || !Array.isArray(data.uncertain)) {
    throw new Error('Geen geldige klusrapporten ontvangen.');
  }
  if (data.uncertain.length) throw new Error('Een eerdere Telegram-verzending is onzeker. Controleer de gereserveerde rapportdelen voordat je doorgaat.');
  return data.messages.map(message => {
    if (typeof message.invoiceId !== 'string' || !Number.isInteger(message.part) || message.part < 0) throw new Error('Ongeldig rapportdeel.');
    return { json: message };
  });
}

function createJobFinanceWorkflow(source) {
  const template = source.nodes.find(node => node.type === 'n8n-nodes-base.httpRequest');
  if (!template) throw new Error('Bestaande beveiligde Calvora-HTTP-node ontbreekt.');
  function http(name, action, x, jsonBody) {
    const node = structuredClone(template);
    node.id = randomUUID(); node.name = name; node.position = [x, 0];
    node.parameters = { ...node.parameters, method: 'POST', url: 'https://app.calvora.nl/api/finance/job-report',
      sendBody: true, specifyBody: 'json', jsonBody: jsonBody || JSON.stringify({ action }), options: { timeout: 60000 } };
    node.retryOnFail = action !== 'claim'; node.maxTries = 3; node.waitBetweenTries = 5000;
    delete node.continueOnFail; delete node.onError;
    return node;
  }
  const schedule = { id: randomUUID(), name: 'Iedere ochtend 08:00', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2,
    position: [0, 0], parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 8, triggerAtMinute: 0 }] } } };
  const prepare = http('Bereid klusrapporten voor', 'prepare', 240);
  const code = { id: randomUUID(), name: 'Rapportdelen', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [480, 0], parameters: { jsCode: reportMessages.toString() + '\nreturn reportMessages($input.first().json);' } };
  const claim = http('Reserveer rapportdeel', 'claim', 720, '={{ JSON.stringify({ action: "claim", invoiceId: $json.invoiceId, part: $json.part }) }}');
  const condition = { id: randomUUID(), name: 'Nog niet verstuurd', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [960, 0],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: randomUUID(), leftValue: '={{ $json.claimed }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } };
  const telegram = { id: randomUUID(), name: 'Stuur klusrapport', type: 'n8n-nodes-base.telegram', typeVersion: 1.2,
    position: [1200, 0], retryOnFail: false, parameters: { resource: 'message', operation: 'sendMessage', chatId: 'VUL_JE_NIEUWE_TELEGRAM_CHAT_ID_IN',
      text: "={{ $json.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }}",
      additionalFields: { appendAttribution: false, parse_mode: 'HTML' } } };
  const sent = http('Bevestig verzending', 'sent', 1440,
    '={{ JSON.stringify({ action: "sent", invoiceId: $("Reserveer rapportdeel").item.json.invoiceId, part: $("Reserveer rapportdeel").item.json.part, token: $("Reserveer rapportdeel").item.json.token, telegramMessageId: $json.result?.message_id ?? $json.message_id }) }}');
  const loop = { id: randomUUID(), name: 'Eén rapportdeel tegelijk', type: 'n8n-nodes-base.splitInBatches', typeVersion: 3,
    position: [600, 0], parameters: { batchSize: 1, options: {} } };
  const nodes = [schedule, prepare, code, loop, claim, condition, telegram, sent];
  nodes.forEach((node, index) => { node.position = [index * 240, 0]; });
  const edge = node => ({ node: node.name, type: 'main', index: 0 });
  const connections = Object.fromEntries(nodes.slice(0, -1).map((node, index) => [node.name, { main: [[edge(nodes[index + 1])]] }]));
  connections[loop.name] = { main: [[], [edge(claim)]] };
  connections[condition.name] = { main: [[edge(telegram)], [edge(loop)]] };
  connections[sent.name] = { main: [[edge(loop)]] };
  return { name: 'Klusrapport na eindfactuur - volgende ochtend 08:00', nodes, connections, active: false,
    settings: { executionOrder: 'v1', timezone: 'Europe/Amsterdam' }, pinData: {} };
}
module.exports = { createJobFinanceWorkflow, reportMessages };
