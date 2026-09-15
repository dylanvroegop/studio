const {test} = require('node:test');
const assert = require('node:assert/strict');
const {resolveSession,repairSessionRouting,existingCalendarEvent} = require('./resolve-telegram-session.cjs');
const client = {client_name:'Test Klant',phone:'+31612345678',email:'test@example.com',city:'Almere',job_title:'Binnenwand plaatsen',appointment_status:'not_found'};
const rows = ['10:01','11:23','13:19'].map((time,i)=>({id:String(i+1),chat_id:'chat',created_at:`2026-09-15T${time}:00Z`,client_json:{...client},appointment_status:'not_found'}));
const confirmed = {client_name:client.client_name,city:'Almere',job_title:client.job_title,phone:null,email:null,appointment_date:'2026-09-19',appointment_time:'19:00',appointment_status:'confirmed'};
test('drie identieke sessies leveren één geselecteerde sessie met bevestiging op',()=>{
 const r=resolveSession(rows,confirmed,'chat');assert.equal(r.id,'3');assert.equal(r.matched_session_count,3);assert.equal(r.client_json.appointment_date,'2026-09-19');assert.equal(r.client_json.phone,client.phone);
});
test('opnieuw insturen zonder afspraak hergebruikt de sessie',()=>assert.equal(resolveSession(rows,client,'chat').id,'3'));
test('nieuwe klant geeft één aanmaakopdracht',()=>assert.equal(resolveSession([{}],client,'chat').id,undefined));
test('andere chat wordt nooit gekoppeld',()=>assert.equal(resolveSession(rows,client,'andere-chat').id,undefined));
test('andere klus krijgt een eigen sessie',()=>assert.equal(resolveSession(rows,{...client,job_title:'Dak repareren'},'chat').id,undefined));
test('gelijknamige verschillende klanten worden niet stil samengevoegd',()=>assert.throws(()=>resolveSession([rows[0],{...rows[1],client_json:{...client,phone:'0699999999'}}],confirmed,'chat'),/verschillende klanten/));
test('gedeelde naam zonder gedeeld contactgegeven is onvoldoende voor samenvoegen',()=>assert.throws(()=>resolveSession(rows.map(r=>({...r,client_json:{...r.client_json,phone:null,email:null}})),confirmed,'chat'),/zonder gedeeld contactgegeven/));
test('expliciet telefoonnummer selecteert de juiste klant',()=>assert.equal(resolveSession([rows[0],{...rows[1],client_json:{...client,phone:'0699999999',email:'other@example.com'}}],{...confirmed,phone:client.phone},'chat').id,'1'));
test('bestaande bevestigde sessie heeft voorrang op recente kopie',()=>assert.equal(resolveSession([{...rows[0],appointment_status:'confirmed',appointment_json:'2026-09-19 19:00'},rows[2]],confirmed,'chat').id,'1'));
test('screenshot zonder afspraak wist bevestiging niet',()=>{
 const r=resolveSession([{...rows[0],appointment_status:'confirmed',client_json:{...client,...confirmed}}],client,'chat');assert.equal(r.client_json.appointment_status,'confirmed');assert.equal(r.client_json.appointment_time,'19:00');
});
test('internationaal en Nederlands telefoonnummer zijn dezelfde identiteit',()=>assert.equal(resolveSession([rows[0],{...rows[1],client_json:{...client,phone:'0612345678'}}],confirmed,'chat').id,'2'));
const event = {id:'calendar-id',description:`Klant: ${client.client_name}\nTelefoon: ${client.phone}\nWerk: ${client.job_title}`};
test('bestaande agenda-afspraak wordt herkend bij opnieuw insturen',()=>assert.equal(existingCalendarEvent([event],client,'3'),'calendar-id'));
test('andere klus in agenda wordt niet gewijzigd',()=>assert.equal(existingCalendarEvent([event],{...client,job_title:'Dak'},'3'),null));
test('identieke naam zonder telefoon koppelt geen willekeurige agenda-afspraak',()=>assert.equal(existingCalendarEvent([event],{...client,phone:null},'3'),null));
test('opgeslagen sessiereferentie vindt afspraak ook zonder telefoon',()=>assert.equal(existingCalendarEvent([{id:'existing',description:'Telegram-sessie: 3'}],{...client,phone:null},'3'),'existing'));
test('dubbele agenda-afspraken stoppen veilig',()=>assert.throws(()=>existingCalendarEvent([event,{...event,id:'second'}],client,'3'),/Meerdere bestaande agenda/));
if(process.env.TELEGRAM_WORKFLOW_EXPORT)test('beide screenshotroutes zoeken eerst een bestaande sessie',()=>{
 const w=repairSessionRouting(JSON.parse(require('node:fs').readFileSync(process.env.TELEGRAM_WORKFLOW_EXPORT)));
 assert.equal(w.connections['AI Agent'].main[0][0].node,'Get a row1');assert.equal(w.connections['Create a row'].main[0][0].node,'If1');
 assert.equal(w.connections.If.main[0][0].node,'If1');assert.equal(w.connections.If1.main[1][0].node,'HTTP Request1');
 assert.equal(w.nodes.find(n=>n.name==='Send a text message3').executeOnce,true);
 assert.match(w.nodes.find(n=>n.name==='Code in JavaScript1').parameters.jsCode,/const base = \$\('If1'\)/);
});
