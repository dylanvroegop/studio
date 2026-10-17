const { test } = require('node:test');
const assert = require('node:assert/strict');
const { client, makeRoute } = require('./telegram-appointment-test-harness.cjs');
const { importMessage } = require('./harden-telegram-workflow.cjs');

test('API en zelfstandige n8n-expressie gebruiken dezelfde aanhef en berichttekst', async () => {
  const serializedMessage = new Function('return (' + importMessage.toString() + ')')();
  for (const [name, salutation] of [
    ['a. Achternaam', 'Goedendag,'], ['a', 'Goedendag,'],
    ['A.B. Achternaam', 'Goedendag,'], ['A B Achternaam', 'Goedendag,'],
    ['dhr. Jansen', 'Goedendag,'], ['onbekend', 'Goedendag,'],
    [null, 'Goedendag,'], ['van Dijk', 'Goedendag,'],
    ['Dylan Vroegop', 'Beste Dylan,'], ['Zoë Jansen', 'Beste Zoë,'],
    ['Anne-Marie Jansen', 'Beste Anne-Marie,'], ['Li Wang', 'Beste Li,'],
  ]) {
    const incoming = { ...client, client_name: name };
    const result = await makeRoute({ clients: {}, existingProject: null }).post(incoming);
    const text = result.body.telegram_message;
    assert.ok(text.startsWith(salutation + '\n\nBedankt voor uw aanvraag.'), name);
    assert.ok(text.endsWith('Mvg,\nDylan\n\nVroegoptimmerwerken.nl'));
    assert.match(text, /Ik kan op .+ om \d{2}:\d{2} langskomen voor een werkbespreking/);
    assert.equal(serializedMessage(result.body, incoming), text);
  }
});

test('ook een initiaal in een ouder bericht krijgt een neutrale aanhef', () => {
  const data = { success: true, client_id: 'client', project_id: 'project',
    appointment_status: 'pending', appointment_date: '2026-10-20', appointment_time: '19:00',
    telegram_message: 'Beste a. Achternaam,\n\nBedankt voor uw bericht.' };
  assert.ok(importMessage(data).startsWith('Goedendag,\n'));
});
