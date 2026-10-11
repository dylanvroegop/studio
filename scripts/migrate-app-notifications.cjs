const fs = require('node:fs');

const PLANS = {
  '4PGr4pDmthCfbtc9': { title: 'Planning', url: '/planning' },
  'WUZV4SnYH214qRvt': { title: 'Boodschappenlijst', url: '/boodschappenlijst' },
  'wadI3Mkx1FZmkmXR': { title: 'Materiaallijst', url: '/materiaallijsten' },
  'NkUKPls4PryIxjAH': { title: 'Appmelding', url: '/dashboard' },
  'Xal6adg1neOkMczi': { title: 'Klant en afspraak', url: '/planning' },
};

function expression(value) {
  const text = String(value || '');
  if (text.startsWith('={{') && text.endsWith('}}')) return '(' + text.slice(3, -2).trim() + ')';
  if (!text.startsWith('=')) return JSON.stringify(text);
  const parts = []; let last = 1;
  for (const match of text.matchAll(/{{([\s\S]*?)}}/g)) {
    if (match.index > last) parts.push(JSON.stringify(text.slice(last, match.index)));
    parts.push('String(' + match[1].trim() + ')'); last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(JSON.stringify(text.slice(last)));
  return parts.join(' + ') || '""';
}

function migrate(workflow, authParameters) {
  const plan = PLANS[workflow.id];
  if (!plan) throw new Error('Geen gecontroleerd migratieplan voor deze workflow.');
  const result = structuredClone(workflow);
  const changed = [];
  if (workflow.id === '4PGr4pDmthCfbtc9') {
    const prepare = result.nodes.find(node => node.name === 'Maak lead-melding klaar');
    if (!prepare?.parameters.jsCode.includes('data.shouldAlert === true && Boolean(chatId)')) throw new Error('Onverwachte planningversie.');
    prepare.parameters.jsCode = prepare.parameters.jsCode.replace('data.shouldAlert === true && Boolean(chatId)', 'data.shouldAlert === true');
  }
  for (const node of result.nodes) {
    if (node.type !== 'n8n-nodes-base.telegram' || node.parameters.resource === 'file') continue;
    if (node.parameters.operation && node.parameters.operation !== 'sendMessage') throw new Error('Interactieve Telegram-operatie: ' + node.name);
    if (node.parameters.replyMarkup || node.parameters.inlineKeyboard) throw new Error('Knoppen vereisen handmatige omzetting: ' + node.name);
    let body = expression(node.parameters.text);
    let title = JSON.stringify(plan.title), url = JSON.stringify(plan.url);
    if (workflow.id === 'NkUKPls4PryIxjAH') {
      body = '($json.body?.telegramText || $json.telegramText || $json.body?.message || $json.message || "Er is een appfout gemeld.")';
      title = 'String($json.body?.title || "Appmelding").slice(0,100)';
      url = '($json.body?.route || "/dashboard")';
    }
    if (workflow.id === 'Xal6adg1neOkMczi') {
      url = '($json.project_id ? "/offertes/" + encodeURIComponent($json.project_id) : "/planning")';
      if (node.name === 'Send a text message4') title = '"Afspraakvoorstel"';
      if (node.name === 'Send a text message3') title = '"Klantverwerking gestopt"';
    }
    if (workflow.id === '4PGr4pDmthCfbtc9' && node.name === 'Stuur nieuwe-lead melding') {
      body = '"Nog ruimte in de planning: " + String($json.text || "Bekijk je planning")';
    }
    const normalized = `String(${body}).replace(/\\\\n/g, "\\n").replace(/<\\/?(?:b|i|u|s|code|pre)>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")`;
    const eventId = workflow.id === '4PGr4pDmthCfbtc9' && node.name === 'Stuur nieuwe-lead melding'
      ? `"planning:" + $now.setZone('Europe/Amsterdam').toFormat('yyyy-MM-dd')`
      : `${JSON.stringify(workflow.id + ':' + node.id + ':')} + $execution.id + ':' + $itemIndex`;
    node.type = 'n8n-nodes-base.httpRequest'; node.typeVersion = 4.2;
    node.parameters = {
      method: 'POST', url: 'https://app.calvora.nl/api/push/send',
      ...structuredClone(authParameters),
      sendBody: true, specifyBody: 'json',
      jsonBody: `={{ JSON.stringify({title: ${title}, body: ${normalized}, url: ${url}, eventId: ${eventId}}) }}`,
      options: { timeout: 60000 },
    };
    delete node.credentials;
    node.retryOnFail = true; node.maxTries = 3; node.waitBetweenTries = 5000;
    node.notes = 'Verstuurt naar de Calvora-app. Volledige tekst staat onder Meldingen. Telegram blijft alleen voor invoer.';
    changed.push(node.name);
  }
  if (!changed.length) throw new Error('Geen Telegram-verzendstappen gevonden.');
  result.pinData = {};
  return { workflow: result, changed };
}
module.exports = { migrate, expression, PLANS };
if (require.main === module) {
  const [input, authFile, output] = process.argv.slice(2);
  const workflow = JSON.parse(fs.readFileSync(input));
  const reference = JSON.parse(fs.readFileSync(authFile));
  const auth = reference.nodes.find(n => n.parameters?.headerParameters?.parameters?.some(h => h.name === 'x-offertehulp-secret'));
  if (!auth) throw new Error('Bestaande Calvora-authenticatie ontbreekt.');
  const result = migrate(workflow, { sendHeaders: true, headerParameters: auth.parameters.headerParameters });
  fs.writeFileSync(output, JSON.stringify(result.workflow, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ id: workflow.id, changed: result.changed, output }));
}
