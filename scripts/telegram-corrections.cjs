const { randomUUID } = require('node:crypto');
const { validateAppointmentDate } = require('./protect-telegram-dates.cjs');
const { addFailureDetails } = require('./telegram-failure-details.cjs');

// Zelfstandig: draait in n8n, zonder AI of netwerktoegang. Een reply wijst één
// concrete sessie aan; nooit de nieuwste rij of alleen een klantnaam gebruiken.
function prepareTelegramCorrection(rows, message, ownerChatId, botId, today) {
  const text = value => typeof value === 'string' ? value.trim() : '';
  if (String(message?.chat?.id) !== String(ownerChatId) || message?.chat?.type !== 'private'
      || String(message?.from?.id) !== String(ownerChatId) || message?.from?.is_bot
      || message?.forward_origin || message?.forward_from || message?.via_bot) return null;
  let selected;
  const fail = reason => ({
    ...(selected ? { id: selected.id, chat_id: selected.chat_id, updated_at: selected.updated_at, client_json: selected.client_json } : {}),
    telegram_correction: true, correction_error: true,
    error: 'Correctie niet opgeslagen. ' + reason,
  });
  const reply = message.reply_to_message;
  if (!reply?.from?.is_bot || String(reply.from.id) !== String(botId)
      || String(reply.chat?.id) !== String(ownerChatId) || reply.forward_origin || reply.forward_from) {
    return fail('Gebruik Beantwoorden op de foutmelding van deze bot. Bijvoorbeeld: Woonplaats: Almere.');
  }
  const source = text(reply.text);
  const sessions = [...source.matchAll(/^Sessie: ([a-f0-9-]{36})$/gm)];
  const versions = [...source.matchAll(/^Versie: ([^\r\n]+)$/gm)];
  if (sessions.length !== 1 || versions.length !== 1 || !/^Verwerking gestopt bij:|^Correctie verwerkt\./.test(source)) {
    return fail('Deze melding bevat nog geen herstelverwijzing. Stuur de screenshot opnieuw met de juiste gegevens als bijschrift (bijvoorbeeld Woonplaats: Almere).');
  }
  const matches = rows.filter(row => row.id === sessions[0][1] && String(row.chat_id) === String(ownerChatId));
  if (matches.length !== 1) return fail('De genoemde sessie is niet gevonden in deze chat. Stuur de screenshot opnieuw.');
  selected = matches[0];
  const expected = Date.parse(versions[0][1]);
  if (!Number.isFinite(expected) || versions[0][1] !== selected.updated_at) {
    return fail('De sessie is ondertussen gewijzigd. Hieronder staan de actuele gegevens. Antwoord op deze nieuwe melding met je correctie.');
  }
  let patch;
  try { patch = parseTelegramCorrection(message.text); }
  catch (error) { return fail(error.message); }
  const original = selected.client_json || {};
  const client = { ...original, ...patch };
  if (!client.appointment_status) client.appointment_status = selected.appointment_status || 'not_found';
  const moved = ['appointment_date', 'appointment_time'].some(key => Object.hasOwn(patch, key) && patch[key] !== original[key]);
  if (moved && (original.appointment_status === 'confirmed' || selected.appointment_status === 'confirmed') && !Object.hasOwn(patch, 'appointment_status')) {
    return fail('Je wijzigt een bevestigde afspraak. Voeg Status: voorstel toe, of Status: bevestigd als de klant de nieuwe datum en tijd heeft bevestigd.');
  }
  if (moved && client.appointment_status === 'not_found' && !Object.hasOwn(patch, 'appointment_status')) client.appointment_status = 'pending';
  if (!text(client.client_name)) return fail('Vul Klantnaam: … in.');
  if (!text(client.phone) && !text(client.email) && !text(client.city)) return fail('Vul Telefoon: …, E-mail: … of Woonplaats: … in. Naam en straatadres alleen zijn onvoldoende.');
  if (client.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)) return fail('Het e-mailadres is ongeldig.');
  if (client.appointment_status === 'not_found' && (client.appointment_date || client.appointment_time)) return fail('Er staat nog een datum of tijd. Gebruik Status: voorstel of Status: bevestigd.');
  try { validateAppointmentDate(client, today); }
  catch (error) { return fail(error.message); }
  return { ...selected, client_json: client, output: client, appointment_status: client.appointment_status,
    telegram_correction: true, correction_error: false, correction_revision: selected.updated_at };
}

function parseTelegramCorrection(input) {
  if (typeof input !== 'string' || input.length > 4000) throw new Error('Gebruik maximaal 4000 tekens met één veld per regel.');
  const aliases = { naam: 'client_name', klantnaam: 'client_name', klant: 'client_name', telefoon: 'phone', telefoonnummer: 'phone',
    email: 'email', 'e-mail': 'email', 'e-mailadres': 'email', adres: 'address', woonplaats: 'city', plaats: 'city', klus: 'job_title',
    datum: 'appointment_date', tijd: 'appointment_time', status: 'appointment_status' };
  const patch = {};
  for (const line of input.split(/\r?\n/).map(line => line.trim()).filter(Boolean)) {
    if (/^correctie:?$/i.test(line)) continue;
    const match = line.match(/^([^:]+):\s*(.*)$/);
    const label = match && match[1].trim().toLowerCase();
    const key = label && Object.hasOwn(aliases, label) ? aliases[label] : null;
    if (!key) throw new Error('Onbekend veld. Gebruik Klantnaam, Telefoon, E-mail, Adres, Woonplaats, Klus, Datum, Tijd of Status, gevolgd door een dubbele punt.');
    if (Object.hasOwn(patch, key)) throw new Error('Hetzelfde veld staat twee keer in je bericht. Gebruik één waarde per veld.');
    let value = match[2].trim();
    if (!value || value.length > 500) throw new Error('Vul een waarde van maximaal 500 tekens in; gebruik - om een veld leeg te maken.');
    if (key === 'appointment_date' && /^\d{2}-\d{2}-\d{4}$/.test(value)) value = value.split('-').reverse().join('-');
    if (key === 'appointment_time' && /^\d:\d{2}$/.test(value)) value = '0' + value;
    if (key === 'appointment_status') {
      const statuses = { voorstel: 'pending', pending: 'pending', bevestigd: 'confirmed', confirmed: 'confirmed', 'geen afspraak': 'not_found', not_found: 'not_found' };
      value = Object.hasOwn(statuses, value.toLowerCase()) ? statuses[value.toLowerCase()] : null;
      if (!value) throw new Error('Gebruik Status: voorstel, Status: bevestigd of Status: geen afspraak.');
    }
    patch[key] = value === '-' ? null : value;
  }
  if (!Object.keys(patch).length) throw new Error('Noem minimaal één correctie, bijvoorbeeld Woonplaats: Almere.');
  return patch;
}

function correctionImportBody(row) {
  if (!row?.id || !row.client_json) throw new Error('De correctie is niet opgeslagen: de sessie is ondertussen gewijzigd. Antwoord opnieuw op de nieuwste foutmelding.');
  const client = row.client_json;
  return { lead_key: 'telegram_session_' + row.id, appointment_status: client.appointment_status, client };
}

function correctionSucceeded(data) {
  const validDate = value => { const date = new Date(value + 'T12:00:00Z'); return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; };
  const id = value => typeof value === 'string' && value.trim() && !['null', 'undefined'].includes(value.toLowerCase());
  return data?.success === true && Boolean(id(data.client_id) && id(data.project_id)) && data.calendar_synced === true
    && (['cancelled', 'completed'].includes(data.appointment_status) || (['scheduled', 'pending'].includes(data.appointment_status)
      && Boolean(id(data.appointment_id) && id(data.google_calendar_event_id))
      && validDate(data.appointment_date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(data.appointment_time)));
}
function correctionSuccessMessage(data, session) {
  const status = { scheduled: 'Bevestigd', pending: 'Voorstel; nog niet door de klant bevestigd', cancelled: 'Geannuleerd', completed: 'Afgerond' };
  return ['Correctie verwerkt.', 'Afspraak: ' + (status[data.appointment_status] || 'Onbekend'),
    data.appointment_date ? 'Datum en tijd: ' + data.appointment_date + ' ' + (data.appointment_time || '') : '',
    'Google Agenda: opslag bevestigd.',
    'Offerte: https://app.calvora.nl/offertes/' + encodeURIComponent(data.project_id),
    session?.id ? '\nSessie: ' + session.id : '\nDe import is gelukt, maar de sessie is ondertussen gewijzigd. Controleer de opgeslagen gegevens.',
    session?.updated_at ? 'Versie: ' + session.updated_at : '',
    '\nEr is geen bericht naar de klant gestuurd.',
    data.telegram_message ? '\nVoorsteltekst om zelf te versturen:\n' + data.telegram_message : '',
  ].filter(Boolean).join('\n');
}

function addTelegramCorrections(original, telegramReference, ownerChatId, botId) {
  let w = structuredClone(original);
  const node = name => { const found = w.nodes.filter(n => n.name === name); if (found.length !== 1) throw new Error('Ontbrekende/dubbele node: ' + name); return found[0]; };
  if (w.name !== 'auto making client' || w.nodes.some(n => n.name === 'Tekstcorrectie?')) throw new Error('Onverwachte workflow of correctieroute bestaat al.');
  if (!/^\d+$/.test(String(ownerChatId)) || !/^\d+$/.test(String(botId))) throw new Error('Vaste eigenaar en bot-ID vereist.');
  const reference = telegramReference.nodes.find(n => n.name === 'Send a text message3');
  if (reference?.type !== 'n8n-nodes-base.telegram' || !reference.credentials?.telegramApi) throw new Error('Bestaande Telegram-credential ontbreekt.');
  if (String(reference.parameters.chatId) !== String(ownerChatId)) throw new Error('Telegram-eigenaar wijkt af.');
  const edge = name => ({ node: name, type: 'main', index: 0 });
  const add = (name, template, position) => { const n = { ...structuredClone(template), id: randomUUID(), name, position }; w.nodes.push(n); return n; };
  const gate = (name, expression, position) => {
    const n = add(name, node('If'), position);
    n.parameters.conditions.conditions = [{ id: randomUUID(), leftValue: `={{ ${expression} }}`, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }];
    return n;
  };
  // Fouten moeten beantwoord kunnen worden in de bestaande privéchat.
  const errorNode = node('Send a text message3');
  errorNode.type = reference.type; errorNode.typeVersion = reference.typeVersion;
  errorNode.credentials = structuredClone(reference.credentials);
  errorNode.parameters = structuredClone(reference.parameters);
  errorNode.parameters.additionalFields = { appendAttribution: false, reply_to_message_id: "={{ $('Telegram Trigger').first().json.message.message_id }}" };
  errorNode.retryOnFail = false;
  w = addFailureDetails(w);
  const trigger = node('Telegram Trigger');
  gate('Tekstcorrectie?', "typeof $json.message?.text === 'string'", [trigger.position[0] + 180, trigger.position[1]]);
  w.connections['Telegram Trigger'].main[0] = [edge('Tekstcorrectie?')];
  w.connections['Tekstcorrectie?'] = { main: [[edge('Get a row1')], [edge('AI Agent')]] };

  const resolver = node('Kies bestaande sessie');
  const before = "const incoming = $('AI Agent').first().json.output;";
  if (!resolver.parameters.jsCode.includes(before)) throw new Error('Onverwachte sessiecode.');
  const correctionCode = `const parseTelegramCorrection = ${parseTelegramCorrection.toString()};\nconst prepareTelegramCorrection = ${prepareTelegramCorrection.toString()};\nconst message = $('Telegram Trigger').first().json.message;\nif (typeof message.text === 'string') {\n  const correction = prepareTelegramCorrection($input.all().map(item => item.json), message, ${JSON.stringify(String(ownerChatId))}, ${JSON.stringify(String(botId))}, referenceDate);\n  return correction ? [{json: correction}] : [];\n}\nlet incoming = $('AI Agent').first().json.output;\n// Alleen expliciet gelabelde bijschriften zijn correcties; andere bijschriften blijven bronmateriaal.\nif (/^(?:correctie:?\\s*\\n|(?:klantnaam|klant|naam|telefoonnummer|telefoon|e-mailadres|e-mail|email|adres|woonplaats|plaats|klus|datum|tijd|status):)/i.test((message.caption || '').trim())) {\n  incoming = { ...incoming, ...parseTelegramCorrection(message.caption) };\n}`;
  resolver.parameters.jsCode = resolver.parameters.jsCode.replace(before, correctionCode);
  gate('Correctie ongeldig?', 'Boolean($json.correction_error)', [resolver.position[0] + 150, resolver.position[1] - 200]);
  gate('Is Telegram-correctie?', 'Boolean($json.telegram_correction)', [resolver.position[0] + 330, resolver.position[1] - 200]);
  w.connections[resolver.name].main[0] = [edge('Correctie ongeldig?')];
  w.connections['Correctie ongeldig?'] = { main: [[edge('Send a text message3')], [edge('Is Telegram-correctie?')]] };
  w.connections['Is Telegram-correctie?'] = { main: [[edge('Bewaar Telegram-correctie')], [edge('If')]] };
  // Een bijschrift kan de afspraakstatus aanpassen: gebruik de gecontroleerde invoer.
  node('If1').parameters.conditions.conditions[0].leftValue = "={{ $('Kies bestaande sessie').first(0).json.output.appointment_status }}";
  for (const name of ['Code in JavaScript1', 'Get many events', 'HTTP Request2']) {
    const current = node(name);
    const parameters = JSON.stringify(current.parameters);
    if (!parameters.includes("$('AI Agent').first().json.output")) throw new Error('Onverwachte invoerreferentie in ' + name);
    current.parameters = JSON.parse(parameters.replaceAll("$('AI Agent').first().json.output", "$('Kies bestaande sessie').first(0).json.output"));
  }

  const save = add('Bewaar Telegram-correctie', node('Update a row'), [resolver.position[0] + 510, resolver.position[1] - 350]);
  save.alwaysOutputData = true; save.retryOnFail = false;
  save.parameters.matchType = 'allFilters';
  save.parameters.filters.conditions = [
    { keyName: 'id', condition: 'eq', keyValue: '={{ $json.id }}' },
    { keyName: 'chat_id', condition: 'eq', keyValue: String(ownerChatId) },
    { keyName: 'updated_at', condition: 'eq', keyValue: '={{ $json.correction_revision }}' },
  ];
  save.parameters.fieldsUi.fieldValues = [
    { fieldId: 'client_json', fieldValue: '={{ $json.client_json }}' },
    { fieldId: 'updated_at', fieldValue: '={{ $now.toISO() }}' },
  ];
  const request = add('Importeer Telegram-correctie', node('HTTP Request'), [save.position[0] + 200, save.position[1]]);
  request.retryOnFail = false;
  request.parameters.jsonBody = `={{ (${correctionImportBody.toString()})($json) }}`;
  w.connections[save.name] = { main: [[edge(request.name)], [edge('Send a text message3')]] };
  gate('Correctie verwerkt?', `(${correctionSucceeded.toString()})($json)`, [request.position[0] + 200, request.position[1]]);
  w.connections[request.name] = { main: [[edge('Correctie verwerkt?')], [edge('Send a text message3')]] };
  const sync = add('Werk correctiestatus bij', save, [request.position[0] + 400, request.position[1]]);
  sync.parameters.filters.conditions[0].keyValue = "={{ $('Bewaar Telegram-correctie').first(0).json.id }}";
  sync.parameters.filters.conditions[2].keyValue = "={{ $('Bewaar Telegram-correctie').first(0).json.updated_at }}";
  sync.parameters.fieldsUi.fieldValues = [
    { fieldId: 'client_json', fieldValue: "={{ { ...$('Bewaar Telegram-correctie').first(0).json.client_json, ...(['pending','scheduled'].includes($json.appointment_status) ? { appointment_date: $json.appointment_date, appointment_time: $json.appointment_time, appointment_status: $json.appointment_status === 'scheduled' ? 'confirmed' : 'pending' } : {}) } }}" },
    { fieldId: 'appointment_status', fieldValue: "={{ $json.appointment_status === 'scheduled' ? 'confirmed' : $json.appointment_status === 'pending' ? 'pending' : $('Bewaar Telegram-correctie').first(0).json.appointment_status }}" },
    { fieldId: 'appointment_json', fieldValue: "={{ $json.appointment_date ? $json.appointment_date + ($json.appointment_time || '') : $('Bewaar Telegram-correctie').first(0).json.appointment_json }}" },
    { fieldId: 'updated_at', fieldValue: '={{ $now.toISO() }}' },
  ];
  w.connections['Correctie verwerkt?'] = { main: [[edge(sync.name)], [edge('Send a text message3')]] };
  const success = add('Telegram-correctie gelukt', node('Send a text message3'), [sync.position[0] + 200, sync.position[1]]);
  success.parameters.text = `={{ (${correctionSuccessMessage.toString()})($('Importeer Telegram-correctie').first(0).json, $json).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }}`;
  w.connections[sync.name] = { main: [[edge(success.name)], [edge('Send a text message3')]] };
  // Ook nieuwe screenshots maken oudere foutmeldingen aantoonbaar verouderd.
  const fields = node('Update a row').parameters.fieldsUi.fieldValues;
  const stamp = fields.find(f => f.fieldId === 'updated_at');
  if (stamp) stamp.fieldValue = '={{ $now.toISO() }}'; else fields.push({ fieldId: 'updated_at', fieldValue: '={{ $now.toISO() }}' });
  return w;
}
module.exports = { parseTelegramCorrection, prepareTelegramCorrection, correctionImportBody, correctionSucceeded, correctionSuccessMessage, addTelegramCorrections };
if (require.main === module) {
  const fs = require('node:fs');
  const [, , source, reference, destination, ownerChatId, botId] = process.argv;
  if (!source || !reference || !destination || source === destination) throw new Error('Geef bron, Telegram-referentie en apart uitvoerbestand, eigenaar en bot-ID.');
  fs.writeFileSync(destination, JSON.stringify(addTelegramCorrections(JSON.parse(fs.readFileSync(source)), JSON.parse(fs.readFileSync(reference)), ownerChatId, botId), null, 2), {mode:0o600});
}
