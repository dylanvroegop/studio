const assert = require('node:assert/strict');
const { test } = require('node:test');
const { importBody, successfulImport, importMessage, expression, hardenWorkflow } = require('./harden-telegram-workflow.cjs');

const saved = { success: true, client_id: 'client', project_id: 'project', appointment_status: 'none' };
test('opgeslagen klant zonder voorstel geeft een bruikbaar bericht, nooit null', () => {
  for (const value of [null, undefined, '', '  ', 'null', ' NULL ', 'undefined', false, 0, {}]) {
    const data = { ...saved, telegram_message: value };
    assert.equal(successfulImport(data), true);
    assert.match(importMessage(data), /Klant en offerte zijn opgeslagen/);
    assert.match(importMessage(data), /geen afspraakvoorstel/);
  }
});
test('bestaande afspraak wordt niet beschreven als ontbrekend voorstel', () => {
  assert.match(importMessage({ ...saved, appointment_status: 'scheduled' }), /bevestigde werkbespreking/);
  assert.match(importMessage({ ...saved, appointment_status: 'pending' }), /afspraakvoorstel in Calvora/);
});
test('bruikbare voorsteltekst blijft intact', () => {
  const text = 'Beste klant,\n\nKomt vrijdag om 19:00 gelegen?';
  assert.equal(importMessage({ ...saved, telegram_message: text }), text);
});
test('mislukte of onvolledige import gaat nooit door als succes', () => {
  for (const data of [{}, { success: 'true' }, { ...saved, success: false }, { ...saved, client_id: null }, { ...saved, project_id: 'null' }]) {
    assert.equal(successfulImport(data), false);
    assert.match(importMessage(data), /niet bevestigd/);
  }
});
test('JSON behoudt echte nulls, quotes, nieuwe regels en Nederlandse tekens', () => {
  const body = importBody({ id: 42, client_json: { client_name: 'Zoë "de Vries"', city: 'Almere', job_title: 'Wand\n"afwerken"', phone: null, email: 'null' } });
  assert.equal(body.client.email, null);
  assert.equal(body.client.phone, null);
  assert.equal(JSON.parse(JSON.stringify(body)).client.job_title, 'Wand\n"afwerken"');
  assert.equal(body.client.appointment_status, 'not_found');
  assert.equal(body.client.appointment_date, null);
});
test('herhalen behoudt dezelfde importsleutel', () => {
  const row = { id: '42', client_json: { phone: '+31612345678' } };
  assert.deepEqual(importBody(row), importBody(row));
  assert.equal(importBody(row).lead_key, 'telegram_session_42');
});
test('ontbrekende sessie of klantidentiteit stopt voor import', () => {
  assert.throws(() => importBody({}), /sessie ontbreekt/);
  assert.throws(() => importBody({ id: 42, client_json: { client_name: 'null' } }), /Onvoldoende klantgegevens/);
});
test('n8n-expressies geven native boolean en object terug zonder tekstprefix', () => {
  const evaluate = (fn, data) => {
    const text = expression(fn);
    assert.ok(text.startsWith('={{'));
    return new Function('$json', `return (${text.slice(3, -2)});`)(data);
  };
  assert.equal(typeof evaluate(successfulImport, saved), 'boolean');
  assert.equal(evaluate(successfulImport, { success: 'false' }), false);
  assert.equal(typeof evaluate(importBody, { id: '42', client_json: { phone: '0612345678' } }), 'object');
});

// Optioneel controleert de echte export dezelfde verbindingen, zonder netwerkverkeer.
if (process.env.TELEGRAM_WORKFLOW_EXPORT) {
  const source = JSON.parse(require('node:fs').readFileSync(process.env.TELEGRAM_WORKFLOW_EXPORT, 'utf8'));
  const schedulingCode = hardenWorkflow(source).nodes.find(node => node.name === 'Code in JavaScript1').parameters.jsCode;
  const plan = (events, status = 'pending', time = '19:00') => {
    const lookup = {
      If: { id: 'session', client_json: { client_name: 'Test', city: 'Almere' } },
      'AI Agent': { output: { appointment_status: status, appointment_date: '2026-09-16', appointment_time: time } },
    };
    const $ = name => ({ first: () => ({ json: lookup[name] }), all: () => events.map(json => ({ json })) });
    return new Function('$', '$json', '$input', schedulingCode)($, {}, { all: () => events.map(() => ({ json: { durationMinOneWay: 30 } })) });
  };
  const event = (start, end) => ({ start: { dateTime: `2026-09-16T${start}:00+02:00` }, end: { dateTime: `2026-09-16T${end}:00+02:00` } });
  test('lege agenda levert één voorstel op', () => {
    assert.equal(plan([{}])[0].json.client_json.appointment_time, '19:00');
  });
  test('planner reserveert heel uur plus reistijd vóór volgende afspraak', () => {
    assert.equal(plan([event('19:30', '21:00')])[0].json.client_json.appointment_time, '18:00');
  });
  test('volle dag stopt in plaats van conflicterende 19:00 te kiezen', () => {
    assert.throws(() => plan([event('08:00', '23:00')]), /Geen vrij afspraakblok/);
  });
  test('bevestigde afspraaktijd blijft behouden', () => {
    assert.equal(plan([event('08:00', '23:00')], 'confirmed', '14:30')[0].json.client_json.appointment_time, '14:30');
  });
  test('export heeft werkende fouttakken en start herinnering uitsluitend na succes', () => {
    const updated = hardenWorkflow(source);
    const get = name => updated.nodes.find(node => node.name === name);
    assert.equal(updated.nodes.length, source.nodes.length);
    assert.deepEqual(updated.nodes.map(node => node.id), source.nodes.map(node => node.id));
    assert.equal(get('If2').parameters.looseTypeValidation, false);
    assert.equal(get('Get many events').alwaysOutputData, true);
    assert.equal(updated.connections['HTTP Request1'].main[1][0].node, 'Send a text message3');
    assert.ok(updated.connections.If2.main[0].some(edge => edge.node === 'Wait1'));
    assert.ok(!updated.connections['HTTP Request1'].main[0].some(edge => edge.node === 'Wait1'));
    assert.deepEqual(updated.pinData, {});
    assert.equal(get('Create an event').retryOnFail, undefined);
    for (const node of updated.nodes) {
      if (node.onError === 'continueErrorOutput') {
        const outputs = updated.connections[node.name].main;
        assert.ok(outputs.at(-1).length, `Ontbrekende fouttak: ${node.name}`);
      }
    }
  });
}
