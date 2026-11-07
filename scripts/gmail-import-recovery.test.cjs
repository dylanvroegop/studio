const test=require('node:test'),assert=require('node:assert/strict');
const {repairRecovery}=require('./gmail-import-recovery.cjs');
function fixture(){const names=['vroegoptimmerwerken@gmail.com','facturenvroegoptimmerwerken@gmail.com','Maak Kost Aan','Select Invoice PDF','Save For Quote Linking','Verwerk bijlage','Archive Original PDF in Calvora','Normalize Archived PDF','Upload Invoice PDF','Classify Financial Document','Parse Document Classification','Analyze Invoice PDF','Parse Invoice Analysis','Attach PDF To Cost Data','Bevestig geslaagde import','Registreer verwerkt','Skip Non-Financial Attachment'];return {nodes:names.map(name=>({name,parameters:{jsonBody:"= {{ ({ user_id: 'owner', ...$json.data }) }}",jsCode:"const names = ['vroegoptimmerwerken@gmail.com', 'facturenvroegoptimmerwerken@gmail.com']; const active = names.filter(name => $(name).isExecuted); const mailbox = active[0]; return mailbox;"},credentials:{gmailOAuth2:{id:name}}})),connections:{}};}
test('beide mailboxen worden met eigen credentials inclusief gelezen mail opnieuw gecontroleerd',()=>{const w=repairRecovery(fixture());for(let i=1;i<=2;i++){const n=w.nodes.find(n=>n.name==='Herlees mailbox '+i);assert.equal(n.parameters.returnAll,true);assert.equal(n.parameters.filters.readStatus,'both');assert.equal(n.parameters.options.downloadAttachments,true);assert.equal(n.credentials.gmailOAuth2.id,i===1?'vroegoptimmerwerken@gmail.com':'facturenvroegoptimmerwerken@gmail.com');}const select=w.nodes.find(n=>n.name==='Select Invoice PDF');const run=new Function('$',select.parameters.jsCode);assert.equal(run(name=>({isExecuted:name==='Herlees mailbox 2'})),'facturenvroegoptimmerwerken@gmail.com');});
test('mislukte bijlage krijgt geen verwerkt-sleutel en wordt na de lus als fout gemeld',()=>{const w=repairRecovery(fixture());assert.equal(w.connections['Maak Kost Aan'].main[1][0].node,'Bewaar importfout');assert.equal(w.connections['Bewaar importfout'].main[0][0].node,'Verwerk bijlage');const code=w.nodes.find(n=>n.name==='Controleer importresultaat').parameters.jsCode;const run=new Function('$input',code);assert.throws(()=>run({all:()=>[{json:{import_failed:true,filename:'invoice.pdf',error:'timeout'}}]}),/invoice.pdf/);assert.doesNotThrow(()=>run({all:()=>[{json:{processing_key:'booked'}}]}));});
test('hercontrole verdeelt dertig dagen over tien kleine rondes zonder gaten',()=>{
 const {recoveryQuery}=require('./gmail-import-recovery.cjs');
 const start=Date.parse('2026-11-07T00:00:00Z'), covered=new Set();
 for(let hour=0;hour<10;hour++){
  const q=recoveryQuery(start+hour*3600000);
  const [,a,b]=q.match(/after:(\d+) before:(\d+)/);
  assert.equal(Number(b)-Number(a),3*86400+1);
  for(let day=0;day<30;day++){const t=start/1000-day*86400;if(t>Number(a)&&t<Number(b))covered.add(day);}
 }
 assert.equal(covered.size,30);
 const w=repairRecovery(fixture());for(let i=1;i<=2;i++){const schedule=w.nodes.find(n=>n.name==='Hercontrole mailbox '+i);assert.equal(schedule.parameters.rule.interval[0].hoursInterval,1);assert.match(w.nodes.find(n=>n.name==='Herlees mailbox '+i).parameters.filters.q,/^=\{\{/);}
});
