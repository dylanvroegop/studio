// Zelfstandig uitvoerbaar in een n8n-expressie; neem nooit headers/stacks over.
function telegramFailureDetails(data = {}, context = {}) {
  const text = value => typeof value === 'string' ? value.trim() : '';
  const clean = value => text(value).replace(/[\r\n]+/g, ' ').replace(/Bearer\s+\S+/gi, 'Bearer [afgeschermd]')
    .replace(/((?:authorization|api[_-]?key|secret|token|password)\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[afgeschermd]').slice(0, 900);
  const parse = value => {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string') return {};
    try { const decoded = JSON.parse(value); return typeof decoded === 'string' ? JSON.parse(decoded) : decoded; } catch { return {}; }
  };
  const error = typeof data.error === 'object' && data.error ? data.error : {};
  const raw = text(error.message) || text(data.error) || text(data.message);
  const response = parse(error.response?.body || error.response?.data || error.body || raw.replace(/^\d{3}\s*-\s*/, '')) || {};
  const api = response.message || response.code || response.errors ? response : data;
  const code = text(api.code) || text(error.code);
  const status = error.status || error.statusCode || data.statusCode || raw.match(/^(\d{3})\s*-/)?.[1];
  const client = context.client || data.client_json || {};
  const session = text(context.sessionId);
  const validation = Object.values(api.errors?.fieldErrors || {}).flat().filter(v => typeof v === 'string');
  let reason = clean(api.message) || clean(raw) || 'De stap gaf geen bruikbaar foutantwoord terug.';
  let action = 'Controleer de gegevens hieronder. Open de uitvoering voor de technische oorzaak.';
  if (validation.some(v => (v.includes('Provide phone, email') || v.includes('zowel klantnaam als woonplaats'))) || /Onvoldoende klantgegevens/.test(reason)) {
    reason = 'Er ontbreekt een telefoonnummer, e-mailadres of de combinatie klantnaam en woonplaats.';
    action = 'Vul een telefoonnummer, e-mailadres of naam én woonplaats aan en antwoord met die correctie op de Telegram-melding.';
  } else if (code === 'CLIENT_IDENTITY_CONFLICT' || /Tegenstrijdige|verschillende klanten|gedeeld contactgegeven/.test(reason)) {
    action = 'Vergelijk naam, telefoon, e-mail en woonplaats met de bestaande klant. Corrigeer de verkeerde gegevens; verschillende klanten worden niet automatisch samengevoegd.';
  } else if (code === 'APPOINTMENT_SLOT_CONFLICT') {
    action = 'Controleer de bestaande afspraak in Planning. Vul alleen na overleg een andere datum of tijd in; een bestaande reservering wordt niet automatisch verplaatst.';
  } else if (/datum|tijd|jaartal/.test(reason)) {
    action = 'Controleer de datum inclusief jaartal en de tijd. Pas ze aan en verwerk opnieuw.';
  } else if (code === 'CALENDAR_SYNC_IN_PROGRESS') {
    action = 'De agenda wordt nog bijgewerkt. Wacht even en probeer dezelfde sessie opnieuw.';
  } else if (code === 'CALENDAR_SYNC_FAILED' || Number(status) >= 500 || /timeout|ECONN|ETIMEDOUT/i.test(raw)) {
    action = 'De opslag is mogelijk gedeeltelijk uitgevoerd. Controleer klant en Planning en herhaal daarna dezelfde sessie; maak geen nieuwe kopie aan.';
  } else if (Number(status) === 401 || Number(status) === 403) {
    reason = 'De koppeling heeft geen geldige toegang.';
    action = 'Herstel de inloggegevens van de mislukte koppeling in n8n. Andere klantgegevens invullen lost dit niet op.';
  }
  const fields = [['client_name', 'Klant'], ['phone', 'Telefoon'], ['email', 'E-mail'], ['address', 'Adres'], ['city', 'Woonplaats'], ['job_title', 'Klus'], ['appointment_date', 'Datum'], ['appointment_time', 'Tijd'], ['appointment_status', 'Afspraakstatus']];
  const stage = clean(context.stage) || 'Onbekende stap';
  const execution = text(String(context.executionId || ''));
  const identifier = value => Boolean(text(value)) && !['null', 'undefined'].includes(text(value).toLowerCase());
  const importSucceeded = context.importResult?.success === true && identifier(context.importResult.client_id) && identifier(context.importResult.project_id);
  const saveStatus = importSucceeded ? 'De import is bevestigd. De fout ontstond daarna; controleer de afspraak voordat je opnieuw verwerkt.'
    : Number(status) === 400 ? 'Deze import is afgewezen. De Telegram-sessie kan al opgeslagen zijn; een afspraak is hiermee niet bevestigd.'
    : 'De volledige verwerking is niet bevestigd. Eerdere stappen kunnen al gegevens hebben opgeslagen.';
  const telegram = context.channel === 'telegram';
  if (telegram) action = action.replace('en antwoord met die correctie op de Telegram-melding.', 'en antwoord met die correctie op deze melding.');
  const path = '/planning';
  const body = [
    'Verwerking gestopt bij: ' + stage,
    'Reden: ' + reason,
    code || status ? 'Foutcode: ' + [code, status ? 'HTTP ' + status : ''].filter(Boolean).join(' · ') : '',
    validation.length ? 'Controle: ' + validation.map(v => (v.includes('Provide phone, email') || v.includes('zowel klantnaam als woonplaats')) ? 'Telefoon, e-mail of naam en woonplaats vereist.' : clean(v)).join(' ').slice(0, 600) : '',
    '', saveStatus, '', 'Wat je kunt doen: ' + action,
    '', 'Gebruikte gegevens:', ...fields.map(([key, label]) => label + ': ' + (clean(client[key]).slice(0, 120) || 'ontbreekt')),
    session ? '\nSessie: ' + session : '\nEr is nog geen eenduidige sessie. Stuur de screenshot opnieuw met de juiste gegevens als bijschrift, bijvoorbeeld Woonplaats: Almere.',
    session && context.sessionVersion ? 'Versie: ' + clean(context.sessionVersion) : '',
    execution ? 'Uitvoering: ' + execution : '',
    execution ? 'https://n8n.srv1553475.hstgr.cloud/workflow/Xal6adg1neOkMczi/executions/' + encodeURIComponent(execution) : '',
    telegram ? (session && context.sessionVersion ? '\nAanpassen: gebruik Beantwoorden op deze melding. Zet één veld per regel, bijvoorbeeld:\nWoonplaats: Almere\n\nAndere velden: Klantnaam, Telefoon, E-mail, Adres, Klus, Datum (jjjj-mm-dd), Tijd (uu:mm), Status (voorstel/bevestigd).\nAlleen genoemde velden veranderen. Gebruik - om een veld leeg te maken.' : '') : 'Controleer Planning: https://app.calvora.nl' + path,
  ].filter((line, index, lines) => line || (index && lines[index - 1])).join('\n');
  return { body, url: path };
}

function failureExpression(channel = 'app') {
  return `(() => {
    const read = name => { try { return $(name).first(0).json || {}; } catch { return {}; } };
    const stage = (() => { try { return $prevNode.name; } catch { return ''; } })();
    const session = ['Werk correctiestatus bij', 'Bewaar Telegram-correctie', 'Update a row', 'Create a row', 'Kies bestaande sessie'].map(read).find(row => row.id) || {};
    const imported = [read('Importeer Telegram-correctie'), read('HTTP Request'), read('HTTP Request1')].find(row => row.success === true);
    return (${telegramFailureDetails.toString()})($json, { stage, executionId: $execution.id, sessionId: session.id, sessionVersion: session.updated_at, channel: ${JSON.stringify(channel)}, client: session.client_json || read('AI Agent').output, importResult: imported });
  })()`;
}
function addFailureDetails(original) {
  const workflow = structuredClone(original);
  if (workflow.name !== 'auto making client') throw new Error('Onverwachte workflow.');
  const node = workflow.nodes.find(n => n.name === 'Send a text message3');
  if (!node) throw new Error('Foutnode ontbreekt.');
  const expression = failureExpression(node.type === 'n8n-nodes-base.telegram' ? 'telegram' : 'app');
  if (node.type === 'n8n-nodes-base.telegram') {
    node.parameters.text = `={{ ${expression}.body }}`;
    node.parameters.additionalFields = { ...node.parameters.additionalFields, parse_mode: 'HTML', appendAttribution: false };
    node.parameters.text = `={{ ${expression}.body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }}`;
  } else if (node.type === 'n8n-nodes-base.httpRequest' && node.parameters.url === 'https://app.calvora.nl/api/push/send') {
    node.parameters.jsonBody = `={{ JSON.stringify({ title: 'Klantverwerking gestopt', ...${expression}, eventId: 'telegram-failure:' + $execution.id }) }}`;
  } else throw new Error('Onbekende meldingsbestemming.');
  node.executeOnce = true;
  return workflow;
}
module.exports = { telegramFailureDetails, failureExpression, addFailureDetails };
if (require.main === module) {
  const fs = require('node:fs');
  const [, , source, destination] = process.argv;
  if (!source || !destination || source === destination) throw new Error('Geef bron en apart uitvoerbestand op.');
  fs.writeFileSync(destination, JSON.stringify(addFailureDetails(JSON.parse(fs.readFileSync(source))), null, 2), { mode: 0o600 });
}
