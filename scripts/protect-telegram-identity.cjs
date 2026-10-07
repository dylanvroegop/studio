const { resolveSession } = require('./resolve-telegram-session.cjs');

function protectTelegramIdentity(original) {
  const workflow = structuredClone(original);
  if (workflow.name !== 'auto making client') throw new Error('Onverwachte workflow.');
  const node = name => {
    const matches = workflow.nodes.filter(n => n.name === name);
    if (matches.length !== 1) throw new Error('Ontbrekende of dubbele node: ' + name);
    return matches[0];
  };
  // Lees alle sessies van deze chat, zodat ook oude contacten onder een andere
  // naam worden ontdekt. Geen selectie van de eerste rij of filter op alleen naam.
  node('Get a row1').parameters = {
    operation: 'getAll', tableId: 'telegram_lead_sessions', returnAll: true,
    filterType: 'manual', matchType: 'allFilters',
    filters: { conditions: [{ keyName: 'chat_id', condition: 'eq',
      keyValue: "={{ String($('Telegram Trigger').first().json.message.chat.id) }}" }] },
  };
  node('Get a row1').alwaysOutputData = true;
  node('Kies bestaande sessie').parameters.jsCode = `const resolveSession = ${resolveSession.toString()};\nreturn [{json:resolveSession($input.all().map(item=>item.json), $('AI Agent').first().json.output, $('Telegram Trigger').first().json.message.chat.id)}];`;
  node('Kies bestaande sessie').onError = 'continueErrorOutput';
  const destinations = workflow.connections['Kies bestaande sessie']?.main;
  if (destinations?.[0]?.[0]?.node !== 'If' || destinations?.[1]?.[0]?.node !== 'Send a text message3') {
    throw new Error('Onverwachte verbindingen voor de identiteitscontrole.');
  }
  node('AI Agent').parameters.options.systemMessage += '\n\nCONTACT IDENTITY SAFETY:\n- Extract contact details only from the active client conversation in this screenshot. Never copy a phone or email from another conversation, sidebar, notification, forwarded contact or quoted unrelated message.\n- The client name and phone/email must visibly belong to the same person. If that association is uncertain or multiple clients are visible, return null for uncertain fields. Never guess or reconstruct missing digits.\n- Extract only data visible in this input. A prior customer, message or example must never supply a missing contact detail.';
  workflow.pinData = {};
  return workflow;
}

module.exports = { protectTelegramIdentity };
if (require.main === module) {
  const fs = require('node:fs');
  const [, , source, destination] = process.argv;
  if (!source || !destination || source === destination) throw new Error('Geef bronexport en apart uitvoerbestand op.');
  fs.writeFileSync(destination, JSON.stringify(protectTelegramIdentity(JSON.parse(fs.readFileSync(source))), null, 2), { mode: 0o600 });
}
