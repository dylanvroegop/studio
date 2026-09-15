const fs = require('node:fs');

// Deze functies worden ook als n8n-expressie gebruikt. Houd ze zelfstandig.
function importBody(row) {
  if (row.id === undefined || row.id === null || !String(row.id).trim()) {
    throw new Error('De Telegram-sessie ontbreekt; import is gestopt.');
  }
  const fields = ['client_name', 'phone', 'email', 'address', 'city', 'job_title'];
  const client = {};
  for (const field of fields) {
    const value = row.client_json?.[field];
    client[field] = typeof value === 'string' && !['', 'null', 'undefined'].includes(value.trim().toLowerCase())
      ? value.trim() : null;
  }
  if (!client.phone && !client.email && !(client.client_name && client.city)) {
    throw new Error('Onvoldoende klantgegevens. Stuur een screenshot met telefoonnummer, e-mail of naam en woonplaats.');
  }
  // Deze tak verwerkt uitsluitend screenshots zonder afspraak.
  client.appointment_date = null;
  client.appointment_time = null;
  client.appointment_status = 'not_found';
  return { lead_key: 'telegram_session_' + row.id, appointment_status: 'not_found', client };
}

function successfulImport(data) {
  const identifier = value => typeof value === 'string' && !['', 'null', 'undefined'].includes(value.trim().toLowerCase());
  return data.success === true && identifier(data.client_id) && identifier(data.project_id);
}

function importMessage(data) {
  const valid = value => typeof value === 'string' && !['', 'null', 'undefined'].includes(value.trim().toLowerCase());
  if (data.success !== true || !valid(data.client_id) || !valid(data.project_id)) {
    return 'De klantimport is niet bevestigd. Controleer de uitvoering in n8n voordat je opnieuw importeert.';
  }
  if (valid(data.telegram_message)) return data.telegram_message.trim();
  if (data.appointment_status === 'scheduled') {
    return 'Klant en offerte zijn opgeslagen. Er staat al een bevestigde werkbespreking in Calvora. Er is geen nieuw voorstel gemaakt.';
  }
  if (data.appointment_status === 'pending') {
    return 'Klant en offerte zijn opgeslagen. Er staat een afspraakvoorstel in Calvora, maar er is geen berichttekst beschikbaar. Controleer de planning.';
  }
  return 'Klant en offerte zijn opgeslagen. Er is geen afspraakvoorstel beschikbaar. Kies een moment in Calvora en bevestig dit met de klant.';
}

function expression(fn) {
  return `={{ (${fn.toString()})($json) }}`;
}

function hardenWorkflow(original) {
  const workflow = structuredClone(original);
  if (workflow.name !== 'auto making client') throw new Error('Onverwachte workflow.');
  const node = name => {
    const found = workflow.nodes.filter(item => item.name === name);
    if (found.length !== 1) throw new Error(`Node ontbreekt of is dubbel: ${name}`);
    return found[0];
  };
  const edge = name => ({ node: name, type: 'main', index: 0 });
  const request = node('HTTP Request1');
  request.parameters.jsonBody = expression(importBody);
  request.parameters.options = { ...request.parameters.options, timeout: 30000 };
  // Dezelfde sessiesleutel maakt herhalen van deze import veilig.
  request.retryOnFail = true;
  request.maxTries = 3;
  request.waitBetweenTries = 2000;
  request.onError = 'continueErrorOutput';

  const condition = node('If2');
  condition.parameters.conditions.options.typeValidation = 'strict';
  condition.parameters.conditions.conditions = [{
    id: condition.parameters.conditions.conditions[0].id,
    leftValue: expression(successfulImport),
    rightValue: '',
    operator: { type: 'boolean', operation: 'true', singleValue: true },
  }];
  condition.parameters.looseTypeValidation = false;
  node('Send a text message4').parameters.text = expression(importMessage);
  node('Send a text message3').parameters.text = 'Verwerking niet voltooid. De import of controle van de klantgegevens is mislukt. Controleer de uitvoering in n8n en de klant in Calvora voordat je opnieuw importeert.';
  node('Send a text message2').parameters.text = 'Calvora is bijgewerkt, maar opslaan in Google Agenda is mislukt. Controleer de afspraak in beide agenda\'s voordat je opnieuw verwerkt.';
  for (const name of ['Send a text message2', 'Send a text message3']) {
    node(name).parameters.additionalFields.appendAttribution = false;
  }

  // Lege zoekresultaten moeten naar de bestaande validatie doorstromen.
  node('Get a row1').alwaysOutputData = true;
  node('Get many events').alwaysOutputData = true;
  for (const name of ['AI Agent', 'Get a row1', 'Get many events', 'Code in JavaScript1', 'Create a row', 'Update a row']) {
    node(name).onError = 'continueErrorOutput';
    const outputs = workflow.connections[name].main;
    outputs[1] = [edge('Send a text message3')];
  }
  const match = node('If');
  match.parameters.conditions.conditions[0].leftValue = '={{ $input.all().filter(item => item.json.id).length === 1 && Boolean($json.id) }}';
  match.parameters.conditions.conditions[0].operator = { type: 'boolean', operation: 'true', singleValue: true };
  workflow.connections.If.main[1] = [edge('Send a text message3')];

  // Het agendablok duurt een uur: de conflictcontrole moet hetzelfde uur reserveren.
  const scheduling = node('Code in JavaScript1');
  const replaceOnce = (before, after) => {
    if (!scheduling.parameters.jsCode.includes(before)) throw new Error('De planningscode is gewijzigd; controleer de patch.');
    scheduling.parameters.jsCode = scheduling.parameters.jsCode.replace(before, after);
  };
  replaceOnce('const meetingMinutes = 30;', 'const meetingMinutes = 60;');
  replaceOnce('scheduledMinutes = targetMinutes;', 'scheduledMinutes = null;');
  replaceOnce('if (scheduledMinutes === null) scheduledMinutes = targetMinutes;', "if (scheduledMinutes === null) throw new Error('Geen vrij afspraakblok gevonden; er is niets ingepland.');");
  replaceOnce('reistijd plus 30 minuten gesprek.', 'reistijd plus 60 minuten gesprek.');
  workflow.connections['HTTP Request1'].main = [[edge('If2')], [edge('Send a text message3')]];
  workflow.connections.If2.main = [
    [edge('Send a text message4'), edge('Wait1')],
    [edge('Send a text message3')],
  ];
  // Handmatige testgegevens horen niet thuis in de gepubliceerde workflow.
  workflow.pinData = {};
  return workflow;
}

module.exports = { hardenWorkflow, importBody, successfulImport, importMessage, expression };

if (require.main === module) {
  const [, , source, destination] = process.argv;
  if (!source || !destination || source === destination) {
    throw new Error('Gebruik: node scripts/harden-telegram-workflow.cjs <export.json> <gewijzigd.json>');
  }
  const updated = hardenWorkflow(JSON.parse(fs.readFileSync(source, 'utf8')));
  fs.writeFileSync(destination, JSON.stringify(updated, null, 2), { mode: 0o600 });
  console.log(`Workflow voorbereid: ${updated.nodes.length} nodes. Uitvoer bevat bestaande credentials; niet committen.`);
}
