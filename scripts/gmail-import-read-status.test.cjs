const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { updateWorkflow } = require('./gmail-import-read-status.cjs');
const names = ['Select Invoice PDF','Normalize Archived PDF','Attach PDF To Cost Data','Skip Non-Financial Attachment','Parse Invoice Analysis','Archive Original PDF in Calvora','Maak Kost Aan','Save For Quote Linking','Upload Invoice PDF','Mark a message as read','Mark a message as read1','Wait For Invoice And PDF'];
const fixture={nodes:[...names.map(name=>({name,parameters:{}})),...['vroegoptimmerwerken@gmail.com','facturenvroegoptimmerwerken@gmail.com'].map(name=>({name,type:'n8n-nodes-base.gmailTrigger',parameters:{filters:{readStatus:'unread',q:'has:attachment'}}}))], connections:{}};
const w=updateWorkflow(fixture,'test-table');
const run=(name,items,lookup={})=>new Function('$input','$',w.nodes.find(n=>n.name===name).parameters.jsCode)({all:()=>items,first:()=>items[0]},name=>lookup[name]||{isExecuted:false});
test('both mailboxes ignore read status; no mark-read nodes and no dangling connections',()=>{
 for(const n of w.nodes.filter(n=>n.type?.endsWith('gmailTrigger'))) assert.equal(n.parameters.filters.readStatus,'both');
 assert.ok(!w.nodes.some(n=>/Mark a message/.test(n.name)));
 for(const links of Object.values(w.connections))for(const output of links.main)for(const edge of output) assert.ok(w.nodes.some(n=>n.name===edge.node),edge.node);
});
test('separate identity for each message, attachment and account; preserve binary and read labels',()=>{
 const item={json:{id:'m1',labelIds:['UNREAD']},binary:{attachment_0:{fileName:'a.pdf'},attachment_1:{fileName:'b.pdf'}}};
 const normal={'vroegoptimmerwerken@gmail.com':{isExecuted:true}};
 const a=run('Select Invoice PDF',[item],normal);
 assert.equal(a.length,2); assert.notEqual(a[0].json.processing_key,a[1].json.processing_key);
 assert.deepEqual(a[0].json.labelIds,['UNREAD']);assert.equal(a[0].binary.invoice_pdf.fileName,'a.pdf');
 const b=run('Select Invoice PDF',[item],{'facturenvroegoptimmerwerken@gmail.com':{isExecuted:true}});
 assert.notEqual(a[0].json.processing_key,b[0].json.processing_key);
 assert.throws(()=>run('Select Invoice PDF',[{json:{},binary:{}}],normal),/bericht-ID/);
});
test('only confirmed imports are eligible for persistent completion',()=>{
 const lookup={'Verwerk bijlage':{item:{json:{processing_key:'key'}}}};
 for(const response of [{ok:false},{error:'failure'},{}])assert.throws(()=>run('Bevestig geslaagde import',[{json:response}],lookup),/niet bevestigd/);
 assert.equal(run('Bevestig geslaagde import',[{json:{ok:true,pending:true}}],lookup)[0].json.processing_key,'key');
 assert.equal(w.nodes.find(n=>n.name==='Nog niet verwerkt').parameters.operation,'rowNotExists');
 assert.equal(w.nodes.find(n=>n.name==='Registreer verwerkt').parameters.operation,'upsert');
});
test('archive failure stops and multiple attachments run serially',()=>{
 assert.throws(()=>run('Normalize Archived PDF',[{json:{ok:false}}]),/niet opgeslagen/);
 assert.equal(w.nodes.find(n=>n.name==='Verwerk bijlage').parameters.batchSize,1);
 assert.equal(w.connections['Registreer verwerkt'].main[0][0].node,'Verwerk bijlage');
});
