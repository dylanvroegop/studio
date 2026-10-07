const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const moduleObject = { exports: {} };
new Function('exports', 'module', ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/financial-export.ts'),'utf8'), {
  compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText)(moduleObject.exports,moduleObject);
const {financialCsv,financialDate,financialNumber,normalizeFinancialTransactions}=moduleObject.exports;
test('ontbrekende bedragen/datum blijven onbekend; nul blijft nul',()=>{
  assert.equal(financialNumber(null),null);assert.equal(financialNumber(''),null);assert.equal(financialNumber(0),0);assert.equal(financialDate(null),null);
});
test('CSV quotes, nieuwe regels en formule-injectie',()=>{
  const csv=financialCsv([{name:'=HYPERLINK("https://example.com")',amount:-15,note:'a,"b"\nc'}],['name','amount','note']);
  assert.match(csv,/'=HYPERLINK/);assert.match(csv,/"-15"/);assert.match(csv,/a,""b""\nc/);
});
const accounts=[{id:'a',name:'Zakelijk',account_type:'business',iban:'NL01TEST0001'},{id:'b',name:'Privé',account_type:'private',iban:'NL02TEST0002'}];
const tx={id:'t',bank_account_id:'a',external_transaction_id:'e',booking_date:'2026-10-01',amount:-100,currency:'EUR'};
test('eigen IBAN bepaalt interne transfer vóór inkomsten/kosten',()=>{
  const [row]=normalizeFinancialTransactions([{...tx,counterparty_iban:'NL02 TEST0002'}],accounts);assert.equal(row.classification,'internal');
});
test('privéonttrekking van zakelijk is geen privéconsumptie',()=>{
  assert.equal(normalizeFinancialTransactions([{...tx,category:'private'}],accounts)[0].classification,'owner_transfer');
});
test('stabiele sleutels zijn per rekening; overlap en conflict worden gemarkeerd',()=>{
 const rows=normalizeFinancialTransactions([tx,{...tx,id:'other'},{...tx,id:'conflict',amount:-101},{...tx,id:'b',bank_account_id:'b'}],accounts);
 assert.deepEqual(rows.map(x=>x.duplicate_status),['','duplicate','conflict','']);
});
test('vreemde rekening wordt afgewezen',()=>assert.throws(()=>normalizeFinancialTransactions([{...tx,bank_account_id:'foreign'}],accounts)));
test('import onthoudt correcties; regels wijzigen historie niet; dubbelen tellen een keer',async()=>{
 const {mergeTransactions}=await import('../outputs/financial-dashboard/import-core.mjs');
 const incoming={stable_key:'a:e',account_id:'a',amount:-100,currency:'EUR',counterparty:'Shop',category:'',classification:'business'};
 const first=mergeTransactions([],[incoming,incoming],[{counterparty:'Shop',category:'Materiaal'}]);assert.equal(first.length,1);assert.equal(first[0].category,'Materiaal');
 const next=mergeTransactions([{...first[0],category:'Gereedschap'}],[incoming],[{counterparty:'Shop',category:'Overig'}]);assert.equal(next[0].category,'Gereedschap');
 assert.throws(()=>mergeTransactions(next,[{...incoming,amount:-200}],[]),/Bronconflict/);
});

test('API exporteert alle pagina’s, beperkt bronnen tot eigenaar en bewaart ontbrekende btw',async()=>{
 const calls=[];
 const supabase={from(table){const filters={};let from=0,to=499;const q={
  select(){return q;},eq(k,v){filters[k]=v;return q;},in(k,v){filters[k]=v;return q;},order(){return q;},limit(){return q;},range(a,b){from=a;to=b;return q;},
  then(resolve){calls.push({table,filters:{...filters},from,to});
   const data=table==='bank_connections'?[{id:'c',user_id:'bank-owner',provider:'bunq',link_ref:'bunq:personal:bank-owner'}]:table==='bank_accounts'?[{id:'a',connection_id:'c',currency:'EUR'}]:table==='bank_transactions'?Array.from({length:501},(_,i)=>({...tx,id:`t${i}`,external_transaction_id:`e${i}`})).slice(from,to+1):[];
   return Promise.resolve({data,error:null}).then(resolve);
  }};return q;
 }};
 const firestore={collection(name){assert.equal(name,'invoices');return {where(field,op,uid){assert.deepEqual([field,op,uid],['userId','==','owner']);return {get:async()=>({docs:[{id:'i',data:()=>({status:'verzonden',totalsSnapshot:{totaalInclBtw:121}})}]})};}};}};
 const deps={
  'next/server':{NextResponse:{json:(data,options)=>Response.json(data,options)}},
  fflate:{zipSync(){throw new Error('JSON route verwacht');},strToU8(){}},
  '@/lib/bank-api-auth':{resolveBankIdentity:async()=>({firebaseUid:'owner',bankUserId:'bank-owner'}),noStoreHeaders:()=>({'Cache-Control':'no-store'})},
  '@/lib/demo-trial-server':{ensureDemoTrialActiveByUid:async()=>null},
  '@/lib/supabase-admin':{supabaseAdmin:supabase},'@/firebase/admin':{initFirebaseAdmin:()=>({firestore})},
  '@/lib/financial-export':moduleObject.exports,
 };
 const routeModule={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/app/api/bank/financial-export/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(name=>{if(!(name in deps))throw new Error(name);return deps[name];},routeModule,routeModule.exports);
 const response=await routeModule.exports.GET(new Request('http://localhost/api/bank/financial-export?format=json'));
 assert.equal(response.status,200);const body=await response.json();assert.equal(body.transactions.length,501);assert.equal(body.invoices[0].vat,null);assert.equal(body.coverageVerified,false);
 assert.equal(calls.find(x=>x.table==='bank_connections').filters.user_id,'bank-owner');
 assert.deepEqual(calls.find(x=>x.table==='bank_accounts').filters.connection_id,['c']);
 assert.equal(calls.find(x=>x.table==='project_costs').filters.user_id,'owner');
 assert.equal(calls.filter(x=>x.table==='bank_transactions').length,2);
 deps['@/lib/bank-api-auth'].resolveBankIdentity=async()=>{throw new Error('Unauthorized');};const before=calls.length;
 assert.equal((await routeModule.exports.GET(new Request('http://localhost/api/bank/financial-export'))).status,401);assert.equal(calls.length,before);
});
