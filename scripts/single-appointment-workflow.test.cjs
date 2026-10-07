const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const { singleAppointmentWorkflow } = require('./single-appointment-workflow.cjs');

const source = process.env.TELEGRAM_SINGLE_APPOINTMENT_EXPORT
  ? JSON.parse(fs.readFileSync(process.env.TELEGRAM_SINGLE_APPOINTMENT_EXPORT, 'utf8'))
  : {
    name: 'auto making client', pinData: {},
    nodes: [{ name: 'If1', parameters: {} }, { name: 'Send a text message4', parameters: { text: 'oude tekst', chatId: 'zelfde chat' } }],
    connections: { If1: { main: [] } },
  };

test('migratie wijzigt uitsluitend de voorsteltekst', () => {
  const before = structuredClone(source);
  const updated = singleAppointmentWorkflow(source);
  assert.deepEqual(source, before);
  const changedNode = updated.nodes.find(node => node.name === 'Send a text message4');
  assert.notEqual(changedNode.parameters.text, source.nodes.find(node => node.name === changedNode.name).parameters.text);
  changedNode.parameters.text = source.nodes.find(node => node.name === changedNode.name).parameters.text;
  assert.deepEqual(updated, source);
});

test('echte n8n-expressie gebruikt eigen klantsessie en de eerste afspraak', () => {
  const updated = singleAppointmentWorkflow(source);
  const expression = updated.nodes.find(node => node.name === 'Send a text message4').parameters.text;
  const data = { success: true, client_id: 'test-client', project_id: 'test-project', appointment_status: 'pending',
    appointment_date: '2026-10-20', appointment_time: '19:00',
    suggested_appointment_options: [{ date: '2026-10-20', time: '19:00' }, { date: '2026-10-21', time: '19:00' }],
  };
  const $ = name => {
    assert.equal(name, 'If1');
    return { first: () => ({ json: { client_json: { client_name: 'Voorbeeld Klant' } } }) };
  };
  const result = new Function('$json', '$', `return (${expression.slice(3, -2)});`)(data, $);
  assert.match(result, /^Beste Voorbeeld,/);
  assert.match(result, /dinsdag 20 oktober om 19:00/);
  assert.match(result, /Mocht dit moment niet uitkomen/);
  assert.doesNotMatch(result, /21 oktober|twee momenten|geen afspraakvoorstel/);
});

test('vastgezette invoer wordt niet ongemerkt meegenomen', () => {
  assert.throws(() => singleAppointmentWorkflow({ ...source, pinData: { 'AI Agent': [{}] } }), /testgegevens/);
});
