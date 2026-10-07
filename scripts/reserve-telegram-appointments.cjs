const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { importMessage } = require('./harden-telegram-workflow.cjs');

function calendarImportSucceeded(data) {
  const identifier = value => typeof value === 'string' && value.trim().length > 0
    && !['null', 'undefined'].includes(value.trim().toLowerCase());
  return data.success === true && identifier(data.client_id) && identifier(data.project_id)
    && data.calendar_synced === true
    && (data.appointment_status === 'cancelled' || (
      ['pending', 'scheduled'].includes(data.appointment_status)
      && identifier(data.appointment_id) && identifier(data.google_calendar_event_id)
    ));
}

function reserveTelegramAppointments(original) {
  if (original.name !== 'auto making client') throw new Error('Onverwachte workflow.');
  const workflow = structuredClone(original);
  const node = name => {
    const matches = workflow.nodes.filter(item => item.name === name);
    if (matches.length !== 1) throw new Error('Node ontbreekt of is dubbel: ' + name);
    return matches[0];
  };
  if (Object.keys(workflow.pinData || {}).length) throw new Error('Verwijder vastgezette testgegevens vóór publicatie.');
  const edge = name => ({ node: name, type: 'main', index: 0 });
  const gate = name => {
    const current = node(name);
    current.parameters.conditions.options.typeValidation = 'strict';
    current.parameters.conditions.conditions = [{
      id: current.parameters.conditions.conditions[0].id,
      leftValue: `={{ (${calendarImportSucceeded.toString()})($json) }}`,
      rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true },
    }];
    current.parameters.looseTypeValidation = false;
  };
  gate('If2');
  gate('Afspraak bestaat');
  workflow.connections['Afspraak bestaat'].main = [[edge('Send a text message1')], [edge('Send a text message3')]];
  node('Send a text message4').parameters.text = `={{ (${importMessage.toString()})($json, $('If1').first().json.client_json || {}) }}`;
  node('Send a text message1').parameters.text = "={{ $json.appointment_status === 'scheduled' ? 'Afspraak bevestigd en bijgewerkt in Google Agenda.' : $json.appointment_status === 'cancelled' ? 'Het eerdere voorstel is verwijderd uit Google Agenda. Het tijdslot is weer vrij.' : 'Voorstel opgeslagen als PENDING in Google Agenda; klant heeft nog niet bevestigd.' }}";

  // De API beheert één stabiele afspraak. Een tweede Google-write vanuit n8n
  // zou een dubbele afspraak aanmaken of de bevestiging weer terugdraaien.
  for (const name of ['Create an event', 'Werk afspraak bij', 'Send a text message2']) node(name);
  const obsolete = new Set(['Create an event', 'Werk afspraak bij', 'Send a text message2']);
  workflow.nodes = workflow.nodes.filter(item => !obsolete.has(item.name));
  for (const name of obsolete) delete workflow.connections[name];
  for (const output of Object.values(workflow.connections)) {
    for (const groups of Object.values(output)) {
      for (const connections of groups) {
        if (connections.some(connection => obsolete.has(connection.node))) throw new Error('Onverwachte verbinding naar oude agendanode.');
      }
    }
  }
  // Een datum/tijd uit een verstuurd voorstel blijft exact staan. De API
  // controleert conflicten; n8n mag geen andere tijd aanbieden zonder overleg.
  const scheduler = node('Code in JavaScript1');
  const before = "if (status === 'pending' && appointmentDate) {";
  if (!scheduler.parameters.jsCode.includes(before)) throw new Error('Planningscode wijkt af; controleer de migratie.');
  scheduler.parameters.jsCode = scheduler.parameters.jsCode.replace(before, "if (status === 'pending' && appointmentDate && !requestedTime) {");
  return workflow;
}

// Eerst deze versie publiceren: oude API-reacties volgen hun bestaande route,
// de nieuwe API slaat de tweede Google-write over. Zo kan de API zonder een
// overgangsperiode met dubbele agenda-afspraken worden uitgerold.
function prepareCalendarDeployment(original) {
  const workflow = structuredClone(original);
  if (workflow.name !== 'auto making client') throw new Error('Onverwachte workflow.');
  if (Object.keys(workflow.pinData || {}).length) throw new Error('Verwijder vastgezette testgegevens vóór publicatie.');
  const name = 'Agenda door Calvora';
  if (workflow.nodes.some(node => node.name === name)) throw new Error('Overgangsnode bestaat al.');
  const originalGate = workflow.nodes.find(node => node.name === 'Afspraak bestaat');
  const message = workflow.nodes.find(node => node.name === 'Send a text message1');
  if (!originalGate || !message) throw new Error('Agendaroute ontbreekt.');
  const edge = node => ({ node, type: 'main', index: 0 });
  const expression = `={{ (() => { if ($json.calendar_synced === undefined) return false; if (!(${calendarImportSucceeded.toString()})($json)) throw new Error('Google-opslag is niet bevestigd.'); return true; })() }}`;
  workflow.nodes.push({
    ...structuredClone(originalGate), id: randomUUID(), name,
    position: [originalGate.position[0] - 180, originalGate.position[1] - 160],
    onError: 'continueErrorOutput',
    parameters: { ...originalGate.parameters,
      conditions: { ...originalGate.parameters.conditions,
        conditions: [{ ...originalGate.parameters.conditions.conditions[0], leftValue: expression }],
      }, looseTypeValidation: false,
    },
  });
  workflow.connections['HTTP Request'].main[0] = [edge(name)];
  workflow.connections[name] = { main: [[edge('Send a text message1')], [edge('Afspraak bestaat')], [edge('Send a text message3')]] };
  message.parameters.text = `={{ $json.calendar_synced === true ? ($json.appointment_status === 'scheduled' ? 'Afspraak bevestigd en bijgewerkt in Google Agenda.' : $json.appointment_status === 'cancelled' ? 'Het eerdere voorstel is verwijderd uit Google Agenda. Het tijdslot is weer vrij.' : 'Voorstel opgeslagen als PENDING in Google Agenda; klant heeft nog niet bevestigd.') : (${message.parameters.text.slice(3, -2).trim()}) }}`;
  return workflow;
}

module.exports = { calendarImportSucceeded, reserveTelegramAppointments, prepareCalendarDeployment };
if (require.main === module) {
  const [, , source, destination, mode] = process.argv;
  if (!source || !destination || source === destination) throw new Error('Geef een bronexport en apart uitvoerbestand.');
  const transform = mode === '--prepare-deployment' ? prepareCalendarDeployment : reserveTelegramAppointments;
  fs.writeFileSync(destination, JSON.stringify(transform(JSON.parse(fs.readFileSync(source))), null, 2), { mode: 0o600 });
  console.log('Workflow voorbereid. Alleen publiceren nadat de API calendar_synced ondersteunt.');
}
