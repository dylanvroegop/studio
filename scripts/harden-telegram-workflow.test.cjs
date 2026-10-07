const assert = require('node:assert/strict');
const { test } = require('node:test');
const { importBody, successfulImport, importMessage, expression, hardenWorkflow } = require('./harden-telegram-workflow.cjs');

const saved = { success: true, client_id: 'client', project_id: 'project', appointment_status: 'none' };
test('opgeslagen klant zonder voorstel stopt altijd vóór een klantbericht', () => {
  for (const value of [null, undefined, '', '  ', 'null', ' NULL ', 'undefined', false, 0, {}]) {
    const data = { ...saved, telegram_message: value };
    assert.equal(successfulImport(data), true);
    assert.throws(() => importMessage(data), /AFSPRAAKVOORSTEL_ONTBREEKT/);
  }
});
test('bestaande afspraak wordt niet beschreven als ontbrekend voorstel', () => {
  assert.match(importMessage({ ...saved, appointment_status: 'scheduled' }), /bevestigde werkbespreking/);
  assert.throws(() => importMessage({ ...saved, appointment_status: 'pending' }), /AFSPRAAKVOORSTEL_ONTBREEKT/);
});
test('handmatig verwijderd voorstel wordt niet opnieuw aangeboden', () => {
  const text = importMessage({ ...saved, appointment_status: 'cancelled', appointment_date: '2026-10-09', appointment_time: '19:00' });
  assert.match(text, /handmatig verwijderd uit Google Agenda/);
  assert.doesNotMatch(text, /19:00|Ik kan op/);
});
test('voorstel over twee weken krijgt één datum en een vraag om een alternatief', () => {
  const text = importMessage({ ...saved, appointment_status: 'pending', appointment_date: '2026-10-20', appointment_time: '19:00' }, { client_name: 'Erdal Test' });
  assert.match(text, /^Beste Erdal,/);
  assert.match(text, /dinsdag 20 oktober om 19:00/);
  assert.match(text, /Mocht dit moment niet uitkomen, welke dag en tijd zouden u beter uitkomen/);
  assert.doesNotMatch(text, /twee momenten|1\.|2\./);
});
test('oude gecachete tekst met twee opties wordt opnieuw gemaakt met eerste afspraak', () => {
  const text = importMessage({ ...saved, appointment_status: 'pending', appointment_date: '2026-10-09', appointment_time: '19:00', telegram_message: 'Beste Erdal,\n\nIk kan op één van deze twee momenten:\n1. vrijdag 9 oktober om 19:00\n2. zaterdag 10 oktober om 19:00' });
  assert.match(text, /^Beste Erdal,/);
  assert.match(text, /vrijdag 9 oktober om 19:00/);
  assert.doesNotMatch(text, /twee momenten|zaterdag|1\.|2\./);
});
test('ontbrekende of ongeldige datum/tijd stopt zonder ongedateerde uitnodiging', () => {
  for (const date of [null, undefined, '', '2026-02-30', 'ongeldig']) {
    assert.throws(() => importMessage({ ...saved, appointment_date: date, appointment_time: '19:00' }), /AFSPRAAKVOORSTEL_ONTBREEKT/);
  }
  for (const time of [null, undefined, '', '24:00', '19:60', 'avond', 19]) {
    assert.throws(() => importMessage({ ...saved, appointment_date: '2026-10-30', appointment_time: time }), /AFSPRAAKVOORSTEL_ONTBREEKT/);
  }
});
test('voorstel verder dan twee weken blijft een expliciete dag en tijd bevatten', () => {
  const text = importMessage({ ...saved, appointment_status: 'pending', appointment_date: '2026-10-30', appointment_time: '19:00',
    telegram_message: 'Ik kom graag langs. Welke dag en tijd zouden u goed uitkomen?' });
  assert.match(text, /vrijdag 30 oktober om 19:00 langskomen/);
  assert.match(text, /Mocht dit moment niet uitkomen/);
  assert.doesNotMatch(text, /Welke dag en tijd zouden u goed uitkomen/);
});
test('een volledig oud voorstel blijft bruikbaar maar losse velden worden nooit gecombineerd', () => {
  assert.match(importMessage({ ...saved, suggested_appointment_date: '2026-10-30', suggested_appointment_time: '19:00' }), /vrijdag 30 oktober om 19:00/);
  for (const partial of [{ appointment_date: '2026-10-31' }, { appointment_time: '18:00' }]) {
    assert.throws(() => importMessage({ ...saved, ...partial, suggested_appointment_date: '2026-10-30', suggested_appointment_time: '19:00' }), /AFSPRAAKVOORSTEL_ONTBREEKT/);
  }
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
