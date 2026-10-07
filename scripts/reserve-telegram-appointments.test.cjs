const assert = require('node:assert/strict');
const { test } = require('node:test');
const { calendarImportSucceeded, reserveTelegramAppointments, prepareCalendarDeployment } = require('./reserve-telegram-appointments.cjs');
const valid = { success: true, client_id: 'client', project_id: 'quote', appointment_id: 'appointment',
  appointment_status: 'pending', calendar_synced: true, google_calendar_event_id: 'event' };

test('alleen na geslaagde kalenderreservering mag een voorstelbericht worden verstuurd', () => {
  assert.equal(calendarImportSucceeded(valid), true);
  for (const change of [{ calendar_synced: false }, { calendar_synced: 'true' }, { google_calendar_event_id: null }, { appointment_id: null }, { success: false }]) {
    assert.equal(calendarImportSucceeded({ ...valid, ...change }), false);
  }
  assert.equal(calendarImportSucceeded({ ...valid, appointment_status: 'scheduled' }), true);
  assert.equal(calendarImportSucceeded({ ...valid, appointment_status: 'cancelled', appointment_id: null, google_calendar_event_id: null }), true);
});

if (process.env.TELEGRAM_RESERVATION_WORKFLOW_EXPORT) {
  const source = JSON.parse(require('node:fs').readFileSync(process.env.TELEGRAM_RESERVATION_WORKFLOW_EXPORT));
  test('overgang tijdens uitrol behoudt oude API-route en voorkomt dubbele nieuwe Google-writes', () => {
    const prepared = prepareCalendarDeployment(source);
    assert.equal(prepared.nodes.length, source.nodes.length + 1);
    const expression = prepared.nodes.find(node => node.name === 'Agenda door Calvora').parameters.conditions.conditions[0].leftValue;
    const evaluate = new Function('$json', `return (${expression.slice(3, -2)});`);
    assert.equal(evaluate(valid), true);
    assert.equal(evaluate({ ...valid, calendar_synced: undefined }), false);
    assert.throws(() => evaluate({ ...valid, calendar_synced: false }), /niet bevestigd/);
    assert.deepEqual(prepared.connections['Agenda door Calvora'].main.map(group => group[0].node), ['Send a text message1', 'Afspraak bestaat', 'Send a text message3']);
    assert.deepEqual(prepared.connections['HTTP Request'].main[1], source.connections['HTTP Request'].main[1]);
  });
  test('beide imports vereisen Google-opslag en n8n maakt geen tweede agenda-afspraak', () => {
    const updated = reserveTelegramAppointments(source);
    assert.equal(updated.nodes.length, source.nodes.length - 3);
    assert.equal(updated.nodes.some(node => ['Create an event', 'Werk afspraak bij'].includes(node.name)), false);
    assert.deepEqual(updated.connections['Afspraak bestaat'].main.map(group => group[0].node), ['Send a text message1', 'Send a text message3']);
    for (const name of ['If2', 'Afspraak bestaat']) {
      const expression = updated.nodes.find(node => node.name === name).parameters.conditions.conditions[0].leftValue;
      const evaluate = new Function('$json', `return (${expression.slice(3, -2)});`);
      assert.equal(evaluate(valid), true);
      assert.equal(evaluate({ ...valid, calendar_synced: undefined }), false);
    }
    for (const name of ['AI Agent', 'Kies bestaande sessie']) {
      assert.deepEqual(updated.nodes.find(node => node.name === name), source.nodes.find(node => node.name === name));
    }
  });
  test('tijd uit een verstuurd voorstel blijft ongewijzigd tot de API die controleert', () => {
    const updated = reserveTelegramAppointments(source);
    const code = updated.nodes.find(node => node.name === 'Code in JavaScript1').parameters.jsCode;
    const records = {
      If1: { id: 'session', client_json: { client_name: 'Test', city: 'Almere' } },
      'AI Agent': { output: { appointment_status: 'pending', appointment_date: '2026-10-20', appointment_time: '18:00' } },
    };
    const $ = name => ({ first: () => ({ json: records[name] }), all: () => [] });
    const result = new Function('$', '$json', '$input', code)($, {}, { all: () => [] });
    assert.equal(result[0].json.client_json.appointment_time, '18:00');
    assert.equal(result[0].json.appointment_status, 'pending');
  });
}
