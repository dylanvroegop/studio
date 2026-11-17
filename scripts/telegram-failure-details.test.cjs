const { test } = require('node:test');
const assert = require('node:assert/strict');
const { telegramFailureDetails, failureExpression, addFailureDetails } = require('./telegram-failure-details.cjs');
const client = { client_name: 'Test Klant', appointment_date: '2026-11-03', appointment_time: '19:00' };
const body = { success: false, message: 'Invalid request body', errors: { fieldErrors: { client: ['Provide phone, email, or both client_name and city.'] } } };
test('werkelijke n8n Axios-vorm toont ontbrekende identiteit en herstelkoppeling', () => {
 const result = telegramFailureDetails({id:'session',client_json:client,error:{message:'400 - '+JSON.stringify(JSON.stringify(body)),status:400,stack:'secret stack'}},{stage:'HTTP Request',executionId:'2143',sessionId:'session'});
 assert.match(result.body,/telefoonnummer, e-mailadres of de combinatie/); assert.match(result.body,/Woonplaats: ontbreekt/);
 assert.match(result.body,/HTTP 400/); assert.match(result.body,/uitvoering|Uitvoering/); assert.doesNotMatch(result.body,/secret stack/);
 assert.equal(result.url,'/planning'); assert.match(result.body,/Telegram-sessie kan al opgeslagen/);
});
test('geneste API-conflicten blijven zichtbaar',()=>{
 const result=telegramFailureDetails({error:{response:{data:{code:'APPOINTMENT_SLOT_CONFLICT',message:'Tijdslot is bezet.'}}}});
 assert.match(result.body,/Tijdslot is bezet/); assert.match(result.body,/niet automatisch verplaatst/);
});
test('onbekende transportfout claimt geen rollback en schermt geheim af',()=>{
 const result=telegramFailureDetails({error:{message:'timeout Authorization: Bearer abc123 api_key=supersecret',status:503}});
 assert.doesNotMatch(result.body,/abc123|supersecret/); assert.match(result.body,/gedeeltelijk/);
});
test('ontbrekende context en foutobject geven altijd een bruikbaar bericht',()=>{
 assert.match(telegramFailureDetails().body,/geen bruikbaar foutantwoord/);
 const execute=new Function('$json','$','$execution','$prevNode','return '+failureExpression());
 const result=execute({error:'AI failed'},()=>{throw new Error('not executed');},{id:23},{name:'AI Agent'});
 assert.match(result.body,/AI Agent/);assert.equal(result.url,'/planning');
});
test('fout na bevestigde import claimt geen mislukte klantopslag',()=>{
 assert.match(telegramFailureDetails({error:'delivery failed'}, {importResult:{success:true,client_id:'client',project_id:'quote'}}).body,/De import is bevestigd/);
});
test('migratie wijzigt uitsluitend foutnode en blijft idempotent',()=>{
 const original={name:'auto making client',nodes:[{name:'Send a text message3',type:'n8n-nodes-base.httpRequest',parameters:{url:'https://app.calvora.nl/api/push/send',jsonBody:'old',headerParameters:{kept:true}}},{name:'Other',parameters:{untouched:true}}],connections:{a:{main:[]}}};
 const changed=addFailureDetails(original);assert.deepEqual(changed.connections,original.connections);assert.deepEqual(changed.nodes[1],original.nodes[1]);assert.equal(original.nodes[0].parameters.jsonBody,'old');assert.deepEqual(changed,addFailureDetails(changed));
 const execute=new Function('$json','$','$execution','$prevNode','return '+changed.nodes[0].parameters.jsonBody.slice(3,-2));
 const result=JSON.parse(execute({error:'example'},()=>{throw Error();},{id:123},{name:'AI Agent'}));assert.equal(result.eventId,'telegram-failure:123');assert.match(result.body,/example/);
});

test('Nederlandse validatiefout krijgt dezelfde gerichte vervolgstap',()=>{
 const result=telegramFailureDetails({code:'INVALID_IMPORT_INPUT',message:'Controleer de invoer.',errors:{fieldErrors:{client:['Vul een telefoonnummer, e-mailadres of zowel klantnaam als woonplaats in.']}}});
 assert.match(result.body,/antwoord met die correctie/);
});

test('success zonder identifiers geldt niet als bevestigde import',()=>assert.doesNotMatch(telegramFailureDetails({}, {importResult:{success:true}}).body,/De import is bevestigd/));

test('fout bij sessiekeuze koppelt nooit willekeurige invoerrij aan de herstelknop',()=>{
 const result=telegramFailureDetails({id:'andere-klant',client_json:{client_name:'Andere klant'},error:'Tegenstrijdige gegevens'},{stage:'Kies bestaande sessie',client:{client_name:'Ingezonden klant'}});
 assert.equal(result.url,'/planning');assert.match(result.body,/Klant: Ingezonden klant/);assert.doesNotMatch(result.body,/andere-klant/);
});
