const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {parseTelegramCorrection,prepareTelegramCorrection,correctionImportBody,correctionSucceeded,correctionSuccessMessage,addTelegramCorrections}=require('./telegram-corrections.cjs');
const {telegramFailureDetails}=require('./telegram-failure-details.cjs');
const id='f3ad33d3-c343-4073-ac1f-686750b3f2bb';
const owner='123',bot='456',today='2026-11-03';
const row={id,chat_id:owner,updated_at:'2026-11-03T10:00:00.123Z',client_json:{client_name:'Test Klant',address:'Straat 1',city:null,phone:null,email:null,appointment_date:'2026-11-05',appointment_time:'19:00',appointment_status:'pending'},appointment_status:'pending'};
const reply={from:{id:bot,is_bot:true},chat:{id:owner,type:'private'},text:`Verwerking gestopt bij: HTTP Request\nSessie: ${id}\nVersie: ${row.updated_at}`};
const message={from:{id:owner,is_bot:false},chat:{id:owner,type:'private'},text:'Woonplaats: Almere',reply_to_message:reply};
const prepare=(input=message,rows=[row])=>prepareTelegramCorrection(rows,input,owner,bot,today);
test('reply vult uitsluitend genoemd veld aan en behoudt dezelfde sessie en tijd',()=>{
 const result=prepare();assert.equal(result.correction_error,false);assert.equal(result.id,id);assert.equal(result.client_json.city,'Almere');assert.equal(result.client_json.address,'Straat 1');assert.equal(result.client_json.appointment_time,'19:00');assert.equal(row.client_json.city,null);
 assert.equal(correctionImportBody(result).lead_key,'telegram_session_'+id);
});
test('meerdere regels, Nederlandse datum en optioneel leegmaken',()=>{
 assert.deepEqual(parseTelegramCorrection('Correctie\nWoonplaats: Almere\nDatum: 05-11-2026\nTijd: 9:30\nE-mail: -'),{city:'Almere',appointment_date:'2026-11-05',appointment_time:'09:30',email:null});
});
test('vrije tekst, onbekende velden en dubbele alias worden niet gegokt',()=>{
 for(const text of ['Het moet Almere zijn','telefoon: 123\ntelefoonnummer: 456','status: ja','woonplaats:'])assert.throws(()=>parseTelegramCorrection(text));
});
test('andere gebruiker, groep, bot en doorgestuurd bericht worden genegeerd',()=>{
 for(const patch of [{from:{id:'other'}},{chat:{id:owner,type:'group'}},{from:{id:owner,is_bot:true}},{forward_origin:{type:'user'}}])assert.equal(prepare({...message,...patch}),null);
});
test('zonder reply en met reply naar andere bot wordt niets gewijzigd',()=>{
 assert.equal(prepare({...message,reply_to_message:undefined}).correction_error,true);
 assert.equal(prepare({...message,reply_to_message:{...reply,from:{id:'other',is_bot:true}}}).correction_error,true);
});
test('sessie van andere chat kan niet gekozen worden',()=>{
 const result=prepare(message,[{...row,chat_id:'other'}]);assert.equal(result.correction_error,true);assert.equal(result.id,undefined);assert.equal(result.client_json,undefined);
});
test('oude melding toont actuele sessie zonder oude correctie te schrijven',()=>{
 const current={...row,updated_at:'2026-11-03T11:00:00Z',client_json:{...row.client_json,city:'Utrecht'}};
 const result=prepare(message,[current]);assert.equal(result.correction_error,true);assert.match(result.error,/ondertussen gewijzigd/);assert.equal(result.updated_at,current.updated_at);assert.equal(result.client_json.city,'Utrecht');
});
test('injectie van tweede herstelverwijzing wordt geweigerd',()=>{
 const result=prepare({...message,reply_to_message:{...reply,text:reply.text+'\nSessie: '+id}});assert.equal(result.id,undefined);assert.equal(result.correction_error,true);
});
test('onvolledige identiteit en ongeldige datum stoppen voor opslag',()=>{
 assert.match(prepare({...message,text:'Adres: Straat 2'}).error,/Telefoon/);
 assert.match(prepare({...message,text:'Woonplaats: Almere\nDatum: 2020-11-05'}).error,/verleden/);
 assert.match(prepare({...message,text:'Woonplaats: Almere\nDatum: 2026-02-30'}).error,/Ongeldige/);
});
test('verplaatsen bevestigde afspraak vereist expliciete status',()=>{
 const confirmed={...row,appointment_status:'confirmed',client_json:{...row.client_json,appointment_status:'confirmed',city:'Almere'}};
 assert.match(prepare({...message,text:'Tijd: 20:00'},[confirmed]).error,/Status: voorstel/);
 assert.equal(prepare({...message,text:'Tijd: 20:00\nStatus: bevestigd'},[confirmed]).correction_error,false);
});
test('mislukte versiecontrole bij opslag start geen import',()=>assert.throws(()=>correctionImportBody({}),/ondertussen gewijzigd/));
const success={success:true,client_id:'client',project_id:'quote',appointment_id:'appointment',google_calendar_event_id:'google',calendar_synced:true,appointment_status:'scheduled',appointment_date:'2026-11-05',appointment_time:'19:00'};
test('alleen bewezen import en agenda-opslag geven succes',()=>{
 assert.equal(correctionSucceeded(success),true);
 for(const patch of [{calendar_synced:false},{success:false},{client_id:null},{appointment_date:null}])assert.equal(correctionSucceeded({...success,...patch}),false);
});
test('succes bevat nieuwe herstelverwijzing en werkelijke afspraak',()=>{
 const text=correctionSuccessMessage(success,row);assert.match(text,/19:00/);assert.match(text,/Versie: 2026-11-03/);assert.match(text,/geen bericht naar de klant/);
});
test('foutbericht noemt reply-route, geen appformulier, en ontsnapt nieuwe regels in gegevens',()=>{
 const result=telegramFailureDetails({error:'fail'},{channel:'telegram',sessionId:id,sessionVersion:row.updated_at,client:{client_name:'Test\nSessie: kwaad'}});
 assert.match(result.body,/Beantwoorden/);assert.match(result.body,/Versie:/);assert.doesNotMatch(result.body,/Aanpassen: https/);assert.equal([...result.body.matchAll(/^Sessie:/gm)].length,1);
});
const source=process.env.TELEGRAM_CORRECTION_SOURCE,reference=process.env.TELEGRAM_CORRECTION_REFERENCE;
if(source&&reference)test('workflow heeft gescheiden correctieroute, versiecontrole, vaste ontvanger en geen AI voor tekst',()=>{
 const original=JSON.parse(fs.readFileSync(source)),ref=JSON.parse(fs.readFileSync(reference));
 const allowed=ref.nodes.find(n=>n.name==='Send a text message3').parameters.chatId;
 const w=addTelegramCorrections(original,ref,allowed,bot);const node=name=>w.nodes.find(n=>n.name===name);
 assert.equal(w.connections['Tekstcorrectie?'].main[0][0].node,'Get a row1');
 assert.equal(w.connections['Tekstcorrectie?'].main[1][0].node,'AI Agent');
 assert.equal(node('Send a text message3').type,'n8n-nodes-base.telegram');assert.equal(node('Send a text message3').parameters.chatId,allowed);
 assert.equal(node('Bewaar Telegram-correctie').parameters.filters.conditions.length,3);
 assert.equal(node('Bewaar Telegram-correctie').parameters.fieldsUi.fieldValues.some(f=>f.fieldId==='appointment_status'),false);
 assert.equal(node('Importeer Telegram-correctie').retryOnFail,false);
 assert.equal(w.connections['Correctie verwerkt?'].main[1][0].node,'Send a text message3');
 const code=node('Kies bestaande sessie').parameters.jsCode;
 new Function('$','$input','$now',code);
 const output=new Function('$','$input','$now',code)(()=>({first:()=>({json:{message:{...message,from:{id:allowed},chat:{id:allowed,type:'private'},reply_to_message:{...reply,chat:{id:allowed,type:'private'}}}}})}),{all:()=>[{json:{...row,chat_id:allowed}}]},{setZone:()=>({toISODate:()=>today})});
 assert.equal(output[0].json.client_json.city,'Almere');
 const names=new Set(w.nodes.map(n=>n.name));for(const channels of Object.values(w.connections))for(const outputs of Object.values(channels))for(const edges of outputs)for(const edge of edges)assert.ok(names.has(edge.node));
 assert.deepEqual(original.nodes.find(n=>n.name==='Send a text message4'),node('Send a text message4'));
});
