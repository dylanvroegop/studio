const { randomUUID } = require('node:crypto');
function createGpsMonitorWorkflow() {
  const schedule = { id: randomUUID(), name: 'Elke 5 minuten', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0], parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } } };
  schedule.parameters.rule.interval.push({ field: 'cronExpression', expression: '0 19 * * *' });
  const check = { id: randomUUID(), name: 'Controleer GPS en stuur appmelding', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [260, 0], parameters: {
    method: 'POST', url: 'https://app.calvora.nl/api/tracking/monitor',
    authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { timeout: 60000 },
  }, retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 };
  return { name: 'GPS bewaking - appmelding bij uitval', nodes: [schedule, check], connections: { [schedule.name]: { main: [[{ node: check.name, type: 'main', index: 0 }]] } }, settings: { executionOrder: 'v1', timezone: 'Europe/Amsterdam' }, active: false };
}
module.exports = { createGpsMonitorWorkflow };
if (require.main === module) process.stdout.write(JSON.stringify(createGpsMonitorWorkflow(), null, 2) + '\n');
