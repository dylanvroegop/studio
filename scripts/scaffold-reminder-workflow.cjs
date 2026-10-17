const { randomUUID } = require('node:crypto');

function reminderItems(data) {
  if (data?.ok !== true || data.version !== 1 || !Array.isArray(data.reminders) || !Array.isArray(data.uncertain)) {
    throw new Error('Geen geldige steigerherinneringen ontvangen.');
  }
  if (data.uncertain.length) throw new Error('Eerdere Telegram-verzending onzeker. Controleer scaffoldReminders voordat je opnieuw verstuurt.');
  return data.reminders.map(item => ({ json: { quoteId: item.quoteId, startDay: item.startDay } }));
}

function createScaffoldReminderWorkflow() {
  const node = (name, type, parameters, typeVersion = 1) => ({ id: randomUUID(), name, type: 'n8n-nodes-base.' + type, typeVersion, parameters, position: [0, 0] });
  const http = (name, method, body) => ({ ...node(name, 'httpRequest', {
    method, url: 'https://app.calvora.nl/api/offertes/scaffold-reminder',
    authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    ...(body ? { sendBody: true, specifyBody: 'json', jsonBody: body } : {}), options: { timeout: 60000 },
  }, 4.2), retryOnFail: method === 'GET' || name === 'Bevestig verzending', maxTries: 3, waitBetweenTries: 5000 });
  const schedule = node('Dagelijks 08:00', 'scheduleTrigger', { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 8, triggerAtMinute: 0 }] } }, 1.2);
  const get = http('Haal steigerherinneringen op', 'GET');
  const items = node('Controleer herinneringen', 'code', { jsCode: reminderItems.toString() + '\nreturn reminderItems($input.first().json);' }, 2);
  const loop = node('Eén herinnering tegelijk', 'splitInBatches', { batchSize: 1, options: {} }, 3);
  const claim = http('Reserveer herinnering', 'POST', '={{ JSON.stringify({ action: "claim", quoteId: $json.quoteId, startDay: $json.startDay }) }}');
  const condition = node('Nog niet verstuurd', 'if', { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: randomUUID(), leftValue: '={{ $json.claimed }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} }, 2.2);
  const telegram = { ...node('Stuur steigerherinnering', 'telegram', { resource: 'message', operation: 'sendMessage',
    chatId: 'VUL_JE_TELEGRAM_CHAT_ID_IN', text: "={{ $json.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }}",
    additionalFields: { appendAttribution: false, parse_mode: 'HTML' } }, 1.2), retryOnFail: false };
  const sent = http('Bevestig verzending', 'POST', '={{ JSON.stringify({ action: "sent", quoteId: $("Reserveer herinnering").item.json.quoteId, startDay: $("Reserveer herinnering").item.json.startDay, token: $("Reserveer herinnering").item.json.token, messageId: $json.result?.message_id ?? $json.message_id }) }}');
  const nodes = [schedule, get, items, loop, claim, condition, telegram, sent];
  const edge = node => ({ node: node.name, type: 'main', index: 0 });
  const connections = {};
  nodes.forEach((node, i) => { node.position = [i * 240, 0]; if (i < nodes.length - 1) connections[node.name] = { main: [[edge(nodes[i + 1])]] }; });
  connections[loop.name] = { main: [[], [edge(claim)]] };
  connections[condition.name] = { main: [[edge(telegram)], [edge(loop)]] };
  connections[sent.name] = { main: [[edge(loop)]] };
  return { name: 'Steiger reserveren - 14 dagen voor start', nodes, connections, active: false,
    settings: { executionOrder: 'v1', timezone: 'Europe/Amsterdam' }, pinData: {} };
}
module.exports = { createScaffoldReminderWorkflow, reminderItems };
if (require.main === module) process.stdout.write(JSON.stringify(createScaffoldReminderWorkflow(), null, 2) + '\n');
