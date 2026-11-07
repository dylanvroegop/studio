const {randomUUID}=require('node:crypto');
const {repairDocumentContract}=require('./gmail-import-document-contract.cjs');
function recoveryQuery(nowMs) {
 const day = 86400, hour = 3600000;
 const offset = (Math.floor(nowMs / hour) % 10) * 3;
 const today = Math.floor(nowMs / (day * 1000)) * day;
 return 'has:attachment -in:sent -in:drafts after:' + (today - (offset + 2) * day - 1) + ' before:' + (today + (1 - offset) * day);
}
const recoveryQueryExpression = '={{ (' + recoveryQuery.toString() + ')(Date.now()) }}';
function repairRecovery(original){
 const w=repairDocumentContract(original), node=name=>w.nodes.find(n=>n.name===name);
 const connect=(from,to,output=0)=>{w.connections[from]??={main:[]};w.connections[from].main[output]=[{node:to,type:'main',index:0}];};
 const add=(name,type,parameters,position,typeVersion=2,extra={})=>w.nodes.push({id:randomUUID(),name,type:'n8n-nodes-base.'+type,typeVersion,parameters,position,...extra});
 const mailboxes=['vroegoptimmerwerken@gmail.com','facturenvroegoptimmerwerken@gmail.com'];
 const sources=[];
 for(const [i,mailbox] of mailboxes.entries()){
  node(mailbox).parameters.filters = {...node(mailbox).parameters.filters, q:'has:attachment -in:sent -in:drafts',readStatus:'both'};
  const schedule='Hercontrole mailbox '+(i+1), fetch='Herlees mailbox '+(i+1);
  add(schedule,'scheduleTrigger',{rule:{interval:[{field:'hours',hoursInterval:1,triggerAtMinute:i?45:15}]}},[-200,700+i*250],1.2);
  add(fetch,'gmail',{resource:'message',operation:'getAll',returnAll:true,simple:false,filters:{q:recoveryQueryExpression,readStatus:'both'},options:{downloadAttachments:true,dataPropertyAttachmentsPrefixName:'attachment_'}},[40,700+i*250],2.1,{credentials:node(mailbox).credentials,retryOnFail:true,maxTries:3,waitBetweenTries:5000});
  connect(schedule,fetch); connect(fetch,'Select Invoice PDF'); sources.push({name:mailbox,mailbox},{name:fetch,mailbox});
 }
 const select=node('Select Invoice PDF');
 select.parameters.jsCode=select.parameters.jsCode.replace(/const names =[\s\S]*?const mailbox = active\[0\];/,`const sources = ${JSON.stringify(sources)};\nconst active = sources.filter(source => $(source.name).isExecuted);\nif (active.length !== 1) throw new Error('Precies één Gmail-bron vereist.');\nconst mailbox = active[0].mailbox;`);
 // Beide branches boeken voortaan via hetzelfde gecontroleerde contract.
 const pending=node('Save For Quote Linking');pending.parameters.jsonBody=node('Maak Kost Aan').parameters.jsonBody;
 pending.retryOnFail=true;pending.maxTries=5;pending.waitBetweenTries=5000;
 // Laat een mislukte bijlage de overige bijlagen niet blokkeren. Mislukkingen
 // krijgen geen verwerkt-sleutel, en maken de uitvoering uiteindelijk rood.
 add('Bewaar importfout','code',{jsCode:`const source = $('Verwerk bijlage').item.json;\nreturn [{json:{import_failed:true,mailbox:source.source_mailbox,message_id:source.id,filename:source.source_filename,error:String($json.error?.message || $json.error || $json.message || 'Import mislukt')},pairedItem:{item:0}}];`},[2700,850]);
 add('Controleer importresultaat','code',{jsCode:`const items=$input.all(); const failures=items.filter(item=>item.json.import_failed);\nif(failures.length) throw new Error(failures.length+' bijlage(n) niet geboekt; worden opnieuw geprobeerd. '+failures.map(item=>item.json.filename+': '+item.json.error).join(' | '));\nreturn items;`},[1150,780]);
 connect('Bewaar importfout','Verwerk bijlage');connect('Verwerk bijlage','Controleer importresultaat',0);
 const guarded=['Archive Original PDF in Calvora','Normalize Archived PDF','Upload Invoice PDF','Classify Financial Document','Parse Document Classification','Analyze Invoice PDF','Parse Invoice Analysis','Attach PDF To Cost Data','Maak Kost Aan','Save For Quote Linking','Bevestig geslaagde import','Registreer verwerkt','Skip Non-Financial Attachment'];
 for(const name of guarded){node(name).onError='continueErrorOutput';connect(name,'Bewaar importfout',1);}
 // Onduidelijke classificaties mogen niet definitief als niet-financieel eindigen.
 node('Skip Non-Financial Attachment').parameters.jsCode=`const c=$('Parse Document Classification').item.json.classification;\nif(!c || c.confidence < 0.9 || ['unknown','other'].includes(c.document_type)) throw new Error('Documenttype onduidelijk: '+(c?.reason || 'geen classificatie'));\nreturn [{json:{processing_key:$('Verwerk bijlage').item.json.processing_key},pairedItem:{item:0}}];`;
 w.settings={...w.settings,timezone:'Europe/Amsterdam',saveDataErrorExecution:'all',saveDataSuccessExecution:'all'};
 w.pinData={};return w;
}
module.exports={repairRecovery,recoveryQuery};
if(require.main===module){const fs=require('fs');const [input,output]=process.argv.slice(2);fs.writeFileSync(output,JSON.stringify(repairRecovery(JSON.parse(fs.readFileSync(input))),null,2),{mode:0o600});}
