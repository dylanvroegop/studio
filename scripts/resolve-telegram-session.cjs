// Zelfstandige functie, ook uitgevoerd in een n8n Code-node (eenmaal voor alle rijen).
function resolveSession(rows, incoming, chatId) {
  const text = value => typeof value === 'string' && !['', 'null', 'undefined'].includes(value.trim().toLowerCase()) ? value.trim() : '';
  const normal = value => text(value).normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();
  const phone = value => {
    const digits = text(value).replace(/\D/g, '');
    return digits.replace(/^0031/, '0').replace(/^31/, '0');
  };
  const clean = Object.fromEntries(Object.entries(incoming || {}).filter(([, value]) => text(value)));
  let candidates = rows.filter(row => row.id && String(row.chat_id) === String(chatId));
  // Een contactgegeven uit de nieuwe screenshot mag niet met een andere klant botsen.
  for (const [key, normalize] of [['phone', phone], ['email', normal], ['city', normal]]) {
    if (text(incoming[key])) candidates = candidates.filter(row => !text(row.client_json?.[key]) || normalize(row.client_json[key]) === normalize(incoming[key]));
  }
  if (text(incoming.job_title)) {
    candidates = candidates.filter(row => !text(row.client_json?.job_title) || normal(row.client_json.job_title) === normal(incoming.job_title));
  }
  if (!candidates.length) {
    return { chat_id: String(chatId), output: incoming, client_json: incoming, appointment_status: incoming.appointment_status || 'not_found', matched_session_count: 0 };
  }
  if (candidates.length > 1) {
    for (const key of ['client_name', 'city', 'job_title', 'email', 'phone']) {
      const normalize = key === 'phone' ? phone : normal;
      const values = new Set(candidates.map(row => normalize(row.client_json?.[key])).filter(Boolean));
      if (values.size > 1) throw new Error('Meerdere verschillende klanten of klussen gevonden. Er is niets gewijzigd. Voeg telefoonnummer en klusnaam toe.');
    }
    const sharedContact = ['phone', 'email'].some(key => {
      const normalize = key === 'phone' ? phone : normal;
      const values = candidates.map(row => normalize(row.client_json?.[key]));
      return values.every(Boolean) && new Set(values).size === 1;
    });
    if (!sharedContact) throw new Error('De klantnaam komt meermaals voor zonder gedeeld contactgegeven. Er is niets gewijzigd. Voeg telefoonnummer of e-mail toe.');
  }
  // Een bestaande afspraak heeft voorrang; anders hoort een reply bij de laatste import.
  const rank = row => row.appointment_status === 'confirmed' ? 2 : row.appointment_json ? 1 : 0;
  candidates.sort((a, b) => rank(b) - rank(a)
    || (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)
    || String(a.id).localeCompare(String(b.id)));
  const selected = candidates[0];
  const merged = { ...selected.client_json };
  for (const row of candidates) {
    for (const [key, value] of Object.entries(row.client_json || {})) if (!text(merged[key]) && text(value)) merged[key] = value;
  }
  // Geen afspraak in de nieuwe screenshot mag een bestaande afspraak niet wissen.
  for (const [key, value] of Object.entries(clean)) {
    if (key.startsWith('appointment_') && incoming.appointment_status === 'not_found') continue;
    merged[key] = value;
  }
  return { ...selected, client_json: merged, output: incoming, matched_session_count: candidates.length };
}

function existingCalendarEvent(events, client, sessionId) {
  const normal = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  const phone = value => String(value || '').replace(/\D/g, '').replace(/^0031/, '0').replace(/^31/, '0');
  const matches = events.filter(event => {
    if (!event.id || event.status === 'cancelled') return false;
    const description = String(event.description || '');
    if (description.split('\n').some(line => line.trim() === 'Telegram-sessie: ' + sessionId)) return true;
    const field = label => description.split('\n').find(line => line.startsWith(label + ':'))?.slice(label.length + 1).trim() || '';
    return Boolean(phone(client.phone)) && phone(field('Telefoon')) === phone(client.phone)
      && normal(field('Klant')) === normal(client.client_name)
      && Boolean(normal(client.job_title)) && normal(field('Werk')) === normal(client.job_title);
  });
  if (matches.length > 1) throw new Error('Meerdere bestaande agenda-afspraken voor deze klus gevonden. Er is geen nieuwe afspraak aangemaakt.');
  return matches[0]?.id || null;
}

function repairSessionRouting(original) {
  const { randomUUID } = require('node:crypto');
  const w = structuredClone(original);
  const node = name => {
    const result = w.nodes.find(n => n.name === name);
    if (!result) throw new Error('Ontbrekende node: ' + name);
    return result;
  };
  if (w.nodes.some(n => n.name === 'Kies bestaande sessie')) throw new Error('Sessieselectie bestaat al.');
  const edge = name => ({ node: name, type: 'main', index: 0 });
  w.nodes.push({ id: randomUUID(), name: 'Kies bestaande sessie', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [node('Get a row1').position[0] + 100, node('Get a row1').position[1] - 150],
    parameters: { jsCode: `const resolveSession = ${resolveSession.toString()};\nreturn [{json:resolveSession($input.all().map(item=>item.json), $('AI Agent').first().json.output, $('Telegram Trigger').first().json.message.chat.id)}];` },
    onError: 'continueErrorOutput' });
  w.connections['AI Agent'].main[0] = [edge('Get a row1')];
  w.connections['Get a row1'].main[0] = [edge('Kies bestaande sessie')];
  w.connections['Kies bestaande sessie'] = { main: [[edge('If')], [edge('Send a text message3')]] };
  node('If').parameters.conditions.conditions[0].leftValue = '={{ Boolean($json.id) }}';
  w.connections.If.main = [[edge('If1')], [edge('Create a row')]];
  w.connections['Create a row'].main[0] = [edge('If1')];
  w.connections.If1.main = [[edge('Get many events')], [edge('HTTP Request1')]];
  node('If1').parameters.conditions.conditions[0].leftValue = "={{ $('AI Agent').first().json.output.appointment_status }}";
  const planning = node('Code in JavaScript1');
  const before = "const base = $('If').first().json || $json || {};";
  if (!planning.parameters.jsCode.includes(before)) throw new Error('Onverwachte planningscode.');
  planning.parameters.jsCode = planning.parameters.jsCode.replace(before, "const base = $('If1').first().json || $json || {};");
  node('Send a text message3').executeOnce = true;
  node('Send a text message3').parameters.text = 'Verwerking gestopt. De klantgegevens of afspraak konden niet veilig worden verwerkt. Controleer de uitvoering in n8n voordat je opnieuw instuurt.';
  node('Create a row').parameters.fieldsUi.fieldValues.find(f => f.fieldId === 'chat_id').fieldValue = "={{ String($('Telegram Trigger').first().json.message.chat.id) }}";
  // De herinnering kan nu ook een bestaande sessie betreffen.
  node('Get a row').parameters.filters.conditions[0].keyValue = "={{ $('If1').first().json.id }}";
  const calendarLine = "const calendarEvents = $('Get many events').all().map((item) => item.json || {});";
  if (!planning.parameters.jsCode.includes(calendarLine)) throw new Error('Onverwachte agendacode.');
  planning.parameters.jsCode = planning.parameters.jsCode.replace(calendarLine,
    calendarLine + `\nconst findExistingEvent = ${existingCalendarEvent.toString()};\nconst existingEventId = findExistingEvent(calendarEvents, merged, base.id);`)
    .replace('.filter(({ event }) => event.start && event.end)', '.filter(({ event }) => event.start && event.end && event.id !== existingEventId)')
    .replace('calendar_events_checked: checkedEvents', 'calendar_events_checked: checkedEvents,\n    existing_calendar_event_id: existingEventId');
  const create = node('Create an event');
  create.parameters.additionalFields.description += "\nTelegram-sessie: {{ $('Edit Fields1').first().json.id }}";
  const exists = structuredClone(node('If'));
  exists.id = randomUUID(); exists.name = 'Afspraak bestaat';
  exists.position = [create.position[0] - 100, create.position[1] - 150];
  exists.parameters.conditions.conditions[0].leftValue = "={{ Boolean($('Edit Fields1').first().json.existing_calendar_event_id) }}";
  const update = structuredClone(create);
  update.id = randomUUID(); update.name = 'Werk afspraak bij';
  update.position = [create.position[0], create.position[1] - 250];
  update.parameters = { operation:'update', calendar:create.parameters.calendar,
    eventId:"={{ $('Edit Fields1').first().json.existing_calendar_event_id }}",
    useDefaultReminders: false, remindersUi:create.parameters.remindersUi,
    updateFields:{...create.parameters.additionalFields,start:create.parameters.start,end:create.parameters.end} };
  w.nodes.push(exists,update);
  w.connections['HTTP Request'].main[0] = [edge('Afspraak bestaat')];
  w.connections['Afspraak bestaat'] = {main:[[edge('Werk afspraak bij')],[edge('Create an event')]]};
  w.connections['Werk afspraak bij'] = {main:[[edge('Send a text message1')],[edge('Send a text message2')]]};
  w.pinData = {};
  return w;
}

module.exports = { resolveSession, repairSessionRouting, existingCalendarEvent };
if (require.main === module) {
  const fs = require('node:fs');
  const [, , source, destination] = process.argv;
  if (!source || !destination || source === destination) throw new Error('Geef bronexport en apart uitvoerbestand op.');
  fs.writeFileSync(destination, JSON.stringify(repairSessionRouting(JSON.parse(fs.readFileSync(source))), null, 2), { mode: 0o600 });
}
