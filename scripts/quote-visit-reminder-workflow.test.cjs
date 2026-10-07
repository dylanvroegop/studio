const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildReminderMessages, createQuoteReminderWorkflow } = require('./quote-visit-reminder-workflow.cjs');

const quote = { id:'offerte-1', status:'concept', klant:'Voorbeeld Klant', titel:'Wand plaatsen', offerteNummer:260001, visitedAt:'2026-10-06T13:00:00Z' };
const payload = (quotes) => ({ ok:true, visitsOnly:true, attendanceRequired:true, shouldAlert:quotes.length > 0, quotes });

test('alleen na gecontroleerd bezoek; oude API wordt geblokkeerd', () => {
  assert.throws(() => buildReminderMessages({ok:true,shouldAlert:true,quotes:[quote]}), /bezoekbevestiging/);
  assert.throws(() => buildReminderMessages({...payload([quote]),attendanceRequired:false}), /bezoekbevestiging/);
  assert.throws(() => buildReminderMessages(payload([{...quote,visitedAt:null}])));
});
test('geen open offertes geeft geen Telegrambericht', () => assert.deepEqual(buildReminderMessages(payload([])), []));
test('verzonden, geaccepteerd, afwijzing en archief stoppen de melding', () => {
  const quotes = ['verzonden','geaccepteerd','afgewezen','vervallen'].map((status,i) => ({...quote,id:String(i),status}));
  quotes.push({...quote,archived:true});
  assert.deepEqual(buildReminderMessages(payload(quotes)), []);
});
test('herhaalt dagelijks met echte regels, bezoekdatum en offertelink', () => {
  const result=buildReminderMessages(payload([quote,quote]));
  assert.equal(result.length,1);
  assert.match(result[0].json.text,/Deze offertes moet je nog maken \(1\)/);
  assert.match(result[0].json.text,/Bezoek: 6 oktober 2026/);
  assert.match(result[0].json.text,/\n\n• Voorbeeld Klant/);
  assert.doesNotMatch(result[0].json.text,/\\n/);
  assert.match(result[0].json.text,/https:\/\/app.calvora.nl\/offertes\/offerte-1/);
  assert.deepEqual(buildReminderMessages(payload([quote])),result);
});
test('lange lijst wordt veilig in meerdere berichten opgesplitst', () => {
  const result=buildReminderMessages(payload(Array.from({length:80},(_,i)=>({...quote,id:String(i)}))));
  assert.ok(result.length>1);
  assert.ok(result.every(item=>item.json.text.length<=3800));
  assert.equal((result.map(item=>item.json.text).join('\n').match(/• Voorbeeld Klant/g)||[]).length,80);
});
test('zelfstandige workflow gebruikt alleen offertes, dagelijks 19:00 Amsterdam en botinvulveld', () => {
  const original={id:'old-id',active:false,settings:{executionOrder:'v1'},nodes:[{name:'Dagelijks om 20:00',parameters:{rule:{interval:[]}}},{name:'Maak Telegram-herinnering',parameters:{}},{name:'Stuur offerte-herinnering',parameters:{},credentials:{telegramApi:{id:'old'}}},{name:'Materialen',parameters:{unchanged:true}}],connections:{'Dagelijks om 20:00':{main:[[{node:'Maak Telegram-herinnering'}]]},'Materialen':{main:[]}}};
  const result=createQuoteReminderWorkflow(original);
  assert.equal(result.settings.timezone,'Europe/Amsterdam');
  assert.equal(result.nodes[0].parameters.rule.interval[0].triggerAtHour,19);
  assert.equal(result.nodes[0].parameters.rule.interval[0].triggerAtMinute,0);
  assert.ok(result.connections['Dagelijks om 19:00']);
  assert.ok(!result.connections['Dagelijks om 20:00']);
  assert.equal(result.nodes[2].parameters.chatId,'VUL_JE_TELEGRAM_CHAT_ID_IN');
  assert.equal(result.nodes[2].credentials,undefined);
  assert.equal(result.nodes.length,3);
  assert.equal(result.connections.Materialen,undefined);
  assert.equal(result.id,undefined);
  assert.equal(result.active,false);
  assert.equal(original.nodes[0].name,'Dagelijks om 20:00');
});
