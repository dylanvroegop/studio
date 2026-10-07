// Zelfstandig: dezelfde controle draait vóór de eerste schrijfactie in n8n.
function validateAppointmentDate(client, referenceDate) {
  const validDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + 'T12:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!validDate(referenceDate)) throw new Error('De actuele datum ontbreekt. Er is niets opgeslagen.');
  const date = client?.appointment_date;
  const time = client?.appointment_time;
  const hasDate = date !== null && date !== undefined && date !== '';
  const hasTime = time !== null && time !== undefined && time !== '';
  const status = client?.appointment_status;
  if (!hasDate) {
    if (hasTime || status === 'confirmed' || status === 'pending') {
      throw new Error('De afspraakdatum ontbreekt. Controleer de datum en het jaartal; er is niets opgeslagen.');
    }
    return client;
  }
  if (!validDate(date)) throw new Error('Ongeldige afspraakdatum. Er is niets opgeslagen.');
  if (date < referenceDate) {
    throw new Error('Afspraakdatum ' + date + ' ligt in het verleden. Controleer het jaartal; er is niets opgeslagen.');
  }
  if (hasTime && (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    throw new Error('Ongeldige afspraaktijd. Er is niets opgeslagen.');
  }
  if (status === 'confirmed' && !hasTime) {
    throw new Error('De bevestigde afspraaktijd ontbreekt. Er is niets opgeslagen.');
  }
  return client;
}

const DATE_RULES = `

APPOINTMENT YEAR SAFETY:
- The reference date above is today's real date in Europe/Amsterdam. Use it to resolve dates without a year as well as relative dates.
- When no year is written, use the next occurrence of that day and month in the reference year or the following year, consistent with the conversation. Never choose an earlier year merely because its weekday matches.
- Check the named weekday against the resolved date. If the weekday or conversation context conflicts, do not guess: return null for appointment_date and preserve the visible evidence and appointment status so validation stops processing.
- If an explicit year is visible, preserve that year exactly, even if it is in the past; validation must flag it rather than silently reschedule it.
- Treat clearly historical or ambiguous appointment messages as unresolved; do not silently turn a historical appointment into a future appointment.
- Examples only: with reference date 2026-09-18, 'zaterdag 19 september om 17 uur' means 2026-09-19 at 17:00, never 2020-09-19. With reference date 2026-12-30, an upcoming '2 januari' means 2027-01-02. Always use the actual reference date, not these example years.`;

function protectTelegramDates(original) {
  const workflow = structuredClone(original);
  if (workflow.name !== 'auto making client') throw new Error('Onverwachte workflow.');
  const node = name => {
    const matches = workflow.nodes.filter(item => item.name === name);
    if (matches.length !== 1) throw new Error('Ontbrekende of dubbele node: ' + name);
    return matches[0];
  };
  const agent = node('AI Agent');
  const prompt = agent.parameters.options.systemMessage;
  if (typeof prompt !== 'string' || !prompt.includes("{{ $now.setZone('Europe/Amsterdam').toISODate() }}")) {
    throw new Error('Onverwachte referentiedatum in het AI-prompt.');
  }
  if (prompt.includes('APPOINTMENT YEAR SAFETY:')) throw new Error('Datumbeveiliging is al toegepast.');
  // Het voorvoegsel = is essentieel: zonder dit stuurt n8n de expressie letterlijk.
  agent.parameters.options.systemMessage = (prompt.startsWith('=') ? prompt : '=' + prompt) + DATE_RULES;
  const resolver = node('Kies bestaande sessie');
  const oldReturn = "return [{json:resolveSession($input.all().map(item=>item.json), $('AI Agent').first().json.output, $('Telegram Trigger').first().json.message.chat.id)}];";
  if (!resolver.parameters.jsCode.endsWith(oldReturn)) throw new Error('De sessiecode is gewijzigd; controleer de patch.');
  if (resolver.onError !== 'continueErrorOutput' || workflow.connections[resolver.name]?.main?.[1]?.[0]?.node !== 'Send a text message3') {
    throw new Error('De foutuitgang moet naar de bestaande Telegram-foutmelding leiden.');
  }
  const guardedReturn = `const validateAppointmentDate = ${validateAppointmentDate.toString()};
const referenceDate = $now.setZone('Europe/Amsterdam').toISODate();
const incoming = $('AI Agent').first().json.output;
validateAppointmentDate(incoming, referenceDate);
const resolved = resolveSession($input.all().map(item => item.json), incoming, $('Telegram Trigger').first().json.message.chat.id);
// Controleer ook een datum die uit een bestaande sessie wordt overgenomen.
validateAppointmentDate(resolved.client_json, referenceDate);
return [{json: resolved}];`;
  resolver.parameters.jsCode = resolver.parameters.jsCode.slice(0, -oldReturn.length) + guardedReturn;
  workflow.pinData = {};
  return workflow;
}

module.exports = { validateAppointmentDate, protectTelegramDates, DATE_RULES };
if (require.main === module) {
  const fs = require('node:fs');
  const [, , source, destination] = process.argv;
  if (!source || !destination || source === destination) throw new Error('Geef bronexport en apart uitvoerbestand op.');
  fs.writeFileSync(destination, JSON.stringify(protectTelegramDates(JSON.parse(fs.readFileSync(source))), null, 2), { mode: 0o600 });
}
