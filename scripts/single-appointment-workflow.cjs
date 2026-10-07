const fs = require('node:fs');
const { importMessage } = require('./harden-telegram-workflow.cjs');

// Gerichte migratie: alleen de klantberichttekst, geen planning of klantgegevens.
function singleAppointmentWorkflow(original) {
  if (original.name !== 'auto making client') throw new Error('Onverwachte workflow.');
  const workflow = structuredClone(original);
  const matches = workflow.nodes.filter(node => node.name === 'Send a text message4');
  if (matches.length !== 1) throw new Error('De voorstelbericht-node ontbreekt of is dubbel.');
  if (!workflow.nodes.some(node => node.name === 'If1')) throw new Error('De klantsessienode ontbreekt.');
  if (Object.keys(workflow.pinData || {}).length) throw new Error('Verwijder eerst vastgezette testgegevens.');
  matches[0].parameters.text = `={{ (${importMessage.toString()})($json, $('If1').first().json.client_json || {}) }}`;
  return workflow;
}

module.exports = { singleAppointmentWorkflow };

if (require.main === module) {
  const [, , source, destination] = process.argv;
  if (!source || !destination || source === destination) throw new Error('Geef bronexport en apart uitvoerbestand op.');
  fs.writeFileSync(destination, JSON.stringify(singleAppointmentWorkflow(JSON.parse(fs.readFileSync(source))), null, 2), { mode: 0o600 });
}
