function buildReminderMessages(data) {
  if (data?.ok !== true || data.visitsOnly !== true || data.attendanceRequired !== true || !Array.isArray(data.quotes)) {
    throw new Error('De Calvora-gegevensbron moet eerst expliciete bezoekbevestiging ondersteunen (attendanceRequired: true).');
  }
  if (data.shouldAlert !== true || data.quotes.length === 0) return [];

  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const allowed = new Set(['werkbespreking', 'concept', 'in_behandeling', 'in_afwachting']);
  const seen = new Set();
  const blocks = [];
  for (const quote of data.quotes) {
    if (!quote.id || seen.has(quote.id) || quote.archived === true || !allowed.has(quote.status)) continue;
    if (!quote.visitedAt || !Number.isFinite(Date.parse(quote.visitedAt))) {
      throw new Error('Bezoekdatum ontbreekt voor een open offerte.');
    }
    seen.add(quote.id);
    const number = quote.offerteNummer ? ' #' + clean(quote.offerteNummer) : '';
    const date = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(quote.visitedAt));
    const url = 'https://app.calvora.nl/offertes/' + encodeURIComponent(quote.id);
    blocks.push('• ' + clean(quote.klant || 'Onbekende klant').slice(0,200) + ' — offerte' + number + '\n  ' + clean(quote.titel || 'Offerte').slice(0,200) + '\n  Bezoek: ' + date + '\n  ' + url);
  }
  if (!blocks.length) return [];
  const header = '🔔 Deze offertes moet je nog maken (' + blocks.length + ')\n\n';
  const footer = '\n\nDit blijft dagelijks terugkomen totdat de offerte verzonden of geaccepteerd is.';
  const messages = [];
  let text = header;
  for (const block of blocks) {
    if (text.length + block.length + footer.length + 2 > 3800) {
      messages.push({ json: { text: text.trimEnd() + footer } });
      text = header;
    }
    text += block + '\n\n';
  }
  if (text !== header) messages.push({ json: { text: text.trimEnd() + footer } });
  return messages;
}

function createQuoteReminderWorkflow(workflow) {
  const result = structuredClone(workflow);
  const oldName = 'Dagelijks om 20:00';
  const newName = 'Dagelijks om 19:00';
  const schedule = result.nodes.find((node) => node.name === oldName || node.name === newName);
  const code = result.nodes.find((node) => node.name === 'Maak Telegram-herinnering');
  const telegram = result.nodes.find((node) => node.name === 'Stuur offerte-herinnering');
  if (!schedule || !code || !telegram) throw new Error('Bestaande offerteketen ontbreekt.');
  schedule.name = newName;
  schedule.parameters.rule.interval = [{ field: 'days', daysInterval: 1, triggerAtHour: 19, triggerAtMinute: 0 }];
  if (result.connections[oldName]) {
    result.connections[newName] = result.connections[oldName];
    delete result.connections[oldName];
  }
  code.parameters.jsCode = buildReminderMessages.toString() + '\nreturn buildReminderMessages($input.first().json);';
  telegram.parameters.chatId = 'VUL_JE_TELEGRAM_CHAT_ID_IN';
  telegram.parameters.additionalFields = { ...telegram.parameters.additionalFields, appendAttribution: false, parse_mode: 'HTML' };
  // Escape gebruikersvelden vóór Telegram HTML-verwerking; de zichtbare tekst blijft ongewijzigd.
  telegram.parameters.text = "={{ $json.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }}";
  delete telegram.credentials;
  result.settings = { ...result.settings, timezone: 'Europe/Amsterdam' };
  const quoteNodes = new Set([newName, 'Haal open concept-offertes op', 'Maak Telegram-herinnering', 'Stuur offerte-herinnering']);
  result.nodes = result.nodes.filter((node) => quoteNodes.has(node.name));
  result.connections = Object.fromEntries(Object.entries(result.connections).filter(([name]) => quoteNodes.has(name)));
  result.name = 'Offerte maken na bezoek - dagelijks 19:00';
  delete result.id;
  delete result.versionId;
  delete result.activeVersionId;
  delete result.meta;
  delete result.staticData;
  result.pinData = {};
  result.active = false;
  return result;
}

module.exports = { buildReminderMessages, createQuoteReminderWorkflow };
