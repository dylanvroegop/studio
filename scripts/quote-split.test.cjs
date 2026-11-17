const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) { return resolve.call(this, name.startsWith('@/') ? process.cwd() + '/src/' + name.slice(2) : name, ...args); };
const { planQuoteSplit, splitCents } = require('../src/lib/quote-split.ts');
const settings = { btwTarief:21, uurTariefExclBtw:50, extras:{ transport:{mode:'perKm',prijsPerKm:0.4}, winstMarge:{mode:'percentage',percentage:10,basis:'totaal'} } };
const data = { totaal_uren:50, grootmaterialen:[{product:'Wand',aantal:2,prijs_per_stuk:100},{product:'Plafond',aantal:4,prijs_per_stuk:100}],verbruiksartikelen:[{product:'Afvalkosten',aantal:1,prijs_per_stuk:30}],transport_berekening:{distanceKm:30.1},extras:settings.extras,instellingen:settings };
const row=(cat,i)=>({sourceCategory:cat,sourceIndex:i,item:{}});
const draft=()=>[{id:'a',title:'Wand',workDescription:'Wand met boog maken.',totalHours:20,marginAmount:162.52,selectedKlusIds:['wall'],materialRows:[row('groot',0),row('verbruik',0)]},{id:'b',title:'Plafond',workDescription:'Plafond maken.',totalHours:30,marginAmount:162.52,selectedKlusIds:['roof'],materialRows:[row('groot',1)]}];
const plan=(parts=draft())=>planQuoteSplit(data,settings,parts,['wall','roof'],10);
test('verdeelt oorspronkelijke uren, marge en transport zonder extra reisdagen te factureren',()=>{
 const p=plan();assert.equal(p.original.transportTotaal,120.4);assert.equal(Math.round(p.parts.reduce((s,p)=>s+p.totals.transportTotaal,0)*100),12040);assert.equal(p.parts.reduce((s,p)=>s+p.totals.winstMarge,0),325.04);assert.ok(Math.abs(p.totalInclBtw-p.original.totaalInclBtw)<0.011);
});
test('gebruikt opgeslagen producten; meegezonden prijs kan niets overschrijven',()=>{const d=draft();d[0].materialRows[0].item={aantal:999,prijs_per_stuk:1};assert.equal(plan(d).parts[0].data.grootmaterialen[0].aantal,2);});
test('ontbrekende en dubbele productregels worden geweigerd',()=>{const missing=draft();missing[0].materialRows.pop();assert.throws(()=>plan(missing),/alle productregels/);const dup=draft();dup[1].materialRows.push(row('groot',0));assert.throws(()=>plan(dup),/dubbel/);});
test('alle klussen precies een keer; verdwenen klus wordt geweigerd',()=>{for(const ids of [[],['wall'],['unknown']]){const d=draft();d[1].selectedKlusIds=ids;assert.throws(()=>plan(d),/klussen|klus/);}});
test('uren en marge mogen niet verdwijnen of verdubbelen',()=>{for(const patch of [{totalHours:50},{totalHours:NaN},{marginAmount:0},{marginAmount:-1}]){const d=draft();Object.assign(d[1],patch);assert.throws(()=>plan(d));}});
test('afronding verdeling bewaart alle centen',()=>assert.deepEqual(splitCents(406.61,[1,1]),[203.3,203.31]));
test('gemengde btw wordt expliciet geblokkeerd voordat uren tegen verkeerd tarief komen',()=>assert.throws(()=>planQuoteSplit(data,{...settings,arbeidBtwLaagUren:4},draft(),['wall','roof'],10),/laag btw/));

function route({ failInsert=false, failUpdate=false, failCommit=false, ambiguousCommit=false, concurrentEdit=false }={}) {
 let version=1,seq=0;const calls=[];
 const source={userId:'owner',offerteNummer:260519,updatedAt:{toMillis:()=>123},klussen:{wall:{maatwerk:{},visualisatieSnapshots:[{url:'https://example.com/wall.png'}]},roof:{maatwerk:{},visualisatieUrl:'https://example.com/ceiling.png'}},instellingen:settings,extras:settings.extras,notities:'Bewaren',financieel:{oorspronkelijkePrijsInclBtw:0}};
 source.financieel.oorspronkelijkePrijsInclBtw=plan().original.totaalInclBtw;
 const docs=new Map([['quotes/source',source],['users/owner',{settings:{planningSettings:{defaultWorkdayHours:10}}}]]);
 const calculations=[{id:'calc',quoteid:'source',gebruikerid:'owner',status:'completed',created_at:'2026-11-04',data_json:structuredClone(data)}];
 const snap=(path)=>{const v=version;return {id:path.split('/').at(-1),exists:docs.has(path),data:()=>docs.get(path),updateTime:{isEqual:other=>other?.v===v,v}};};
 const ref=path=>({path,id:path.split('/').at(-1),get:async()=>snap(path),collection:name=>col(path+'/'+name),update:async patch=>{docs.set(path,{...docs.get(path),...patch});if(path==='quotes/source')version++;},set:async value=>docs.set(path,value)});
 const col=path=>({doc:id=>ref(path+'/'+(id||'child'+(++seq))),get:async()=>({docs:[],size:0,empty:true})});
 const firestore={collection:col,runTransaction:async fn=>{const writes=[];const tx={get:async r=>snap(r.path),create:(r,d)=>writes.push([r.path,d]),set:(r,d,o)=>writes.push([r.path,o?.merge?{...docs.get(r.path),...d}:d]),update:(r,d)=>writes.push([r.path,{...docs.get(r.path),...d}])};const value=await fn(tx);const committing=writes.some(([p,d])=>p.includes('split_operations')&&d.state==='completed');if(committing&&failCommit)throw Error('firestore failure');for(const [p,d]of writes){docs.set(p,d);if(p==='quotes/source')version++;}if(committing&&ambiguousCommit)throw Error('response lost');return value;}};
 function query(){let op='select',payload,filters=[];const q={select:()=>q,order:()=>q,eq:(k,v)=>{filters.push(r=>k==='data_json'?JSON.stringify(r[k])===v:r[k]===v);return q;},in:(k,vs)=>{filters.push(r=>vs.includes(r[k]));return q;},insert:v=>{op='insert';payload=v;return q;},update:v=>{op='update';payload=v;return q;},delete:()=>{op='delete';return q;},maybeSingle:()=>{q.single=true;return q;},then:(yes,no)=>Promise.resolve().then(()=>{calls.push({op,payload});if(op==='insert'){if(failInsert)return{error:{message:'insert failure'}};calculations.push(...payload.map((r,i)=>({...r,id:'new'+i})));if(concurrentEdit)calculations[0].data_json={...calculations[0].data_json,totaal_uren:51};return{data:null};}const matches=calculations.filter(r=>filters.every(f=>f(r)));if(op==='update'){if(failUpdate&&!payload.data_json?.originalRollback)return{error:{message:'update failure'}};for(const r of matches){if(Object.hasOwn(payload,'status'))throw Error('status trigger must not run');Object.assign(r,structuredClone(payload));}}if(op==='delete'){for(const r of matches)calculations.splice(calculations.indexOf(r),1);}return{data:q.single?matches[0]||null:matches.map(r=>({...r})),error:null};}).then(yes,no)};return q;}
 const ts=require('typescript');const mod={exports:{}};const overrides={
  'next/server':{NextResponse:{json:(body,opt)=>({body,status:opt?.status||200})}},
  'firebase-admin/firestore':{FieldValue:{serverTimestamp:()=> 'server-time',delete:()=>undefined}},
  '@/firebase/admin':{initFirebaseAdmin:()=>({firestore,auth:{verifyIdToken:async()=>({uid:'owner'})}})},
  '@/lib/supabase-admin':{supabaseAdmin:{from:query,rpc:async(name,args)=>{
   assert.equal(name,'compare_and_swap_quote_calculation');
   calls.push({op:'rpc',name,args});
   if(failUpdate)return{error:{message:'update failure'}};
   const matches=calculations.filter(r=>r.id===args.p_id&&r.gebruikerid===args.p_user_id&&require('node:util').isDeepStrictEqual(r.data_json,args.p_expected));
   for(const r of matches)r.data_json=structuredClone(args.p_replacement);
   return{data:matches.map(r=>({id:r.id,data_json:r.data_json})),error:null};
  }}},
  '@/lib/demo-trial-server':{ensureDemoTrialActiveByUid:async()=>null},
 };
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/app/api/quotes/split/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(n=>overrides[n]||require(n),mod,mod.exports);
 const body={quoteId:'source',requestId:'12345678-1234-1234-1234-123456789012',calculationId:'calc',sourceDataJson:structuredClone(data),quoteRevision:123,splits:draft(),noteSections:[]};
 const post=patch=>mod.exports.POST(new Request('http://localhost/api/quotes/split',{method:'POST',headers:{authorization:'Bearer valid'},body:JSON.stringify({...body,...patch})}));return{post,docs,calculations,calls,body};
}
test('route splitst zonder status-trigger en bewaart volledige herstelkopie',async()=>{const r=route();const result=await r.post();assert.equal(result.status,200);assert.equal(r.calculations[0].data_json.totaal_uren,20);assert.equal(r.calculations[1].data_json.totaal_uren,30);assert.equal(r.docs.get('quotes/source').splitChildren.length,1);assert.equal([...r.docs.values()].some(d=>d.calculationsJson&&d.sourceQuote),true);assert.equal(r.docs.get('quotes/child1').financieel,undefined);});
test('verouderde bron en ongeldige tweede deelofferte doen geen schrijfacties',async()=>{for(const patch of [{quoteRevision:122},{sourceDataJson:{}},{splits:draft().map((d,i)=>i?{...d,totalHours:0}:d)}]){const r=route();const result=await r.post(patch);assert.ok(result.status>=400);assert.equal(r.calculations.length,1);assert.equal(r.calls.some(c=>c.op!=='select'),false);assert.equal(r.docs.has('quotes/child1'),false);}});
test('mislukte Supabase insert houdt oorspronkelijke offerte intact',async()=>{const r=route({failInsert:true});const result=await r.post();assert.equal(result.status,500);assert.equal(r.calculations.length,1);assert.equal(r.calculations[0].data_json.totaal_uren,50);assert.equal(r.docs.get('quotes/source').splitInProgress,undefined);});
test('mislukte Firestore commit herstelt calculatie en ruimt onafgemaakte kinderen op',async()=>{const r=route({failCommit:true});const result=await r.post();assert.equal(result.status,500);assert.deepEqual(r.calculations[0].data_json,data);assert.equal(r.calculations.length,1);assert.equal(r.docs.has('quotes/child1'),false);});
test('verloren commitantwoord wordt herkend als succes zonder rollback',async()=>{const r=route({ambiguousCommit:true});assert.equal((await r.post()).status,200);assert.equal(r.calculations[0].data_json.totaal_uren,20);});
test('zelfde request na succes maakt geen extra offerte',async()=>{const r=route();const first=await r.post();const second=await r.post();assert.deepEqual(second.body,first.body);assert.equal(r.calculations.length,2);});

test('mislukte primaire update verwijdert ongepubliceerde kinderen',async()=>{const r=route({failUpdate:true});assert.equal((await r.post()).status,500);assert.deepEqual(r.calculations[0].data_json,data);assert.equal(r.calculations.length,1);assert.equal(r.docs.get('quotes/source').splitInProgress,undefined);});
test('beschrijving vereist; onbekende bronbeschrijving wordt niet stil vervangen',()=>{const d=draft();delete d[0].workDescription;assert.throws(()=>plan(d),/werkbeschrijving/);d[0].workJobIndex=3;assert.throws(()=>plan(d),/bestaat niet meer/);});

test('gelijktijdige bewerking wordt niet overschreven door split of herstel',async()=>{const r=route({concurrentEdit:true});const result=await r.post();assert.equal(result.status,500);assert.equal(r.calculations[0].data_json.totaal_uren,51);assert.equal(r.calculations.length,1);assert.equal(r.docs.has('quotes/child1'),false);assert.ok(r.docs.get('quotes/source').splitInProgress);assert.match(result.body.message,/herstel/);});
test('prijsafspraak wordt niet stil gekopieerd naar een deelbedrag',async()=>{const r=route();r.docs.get('quotes/source').financieel.afgesprokenPrijsInclBtw=plan().original.totaalInclBtw;assert.equal((await r.post()).status,400);assert.equal(r.calls.some(c=>c.op!=='select'),false);});
test('deelbeschrijving en versie komen overeen met gekozen deel',async()=>{const r=route();await r.post();assert.equal(r.calculations[0].data_json.werkbeschrijving_structured.summary,'Wand met boog maken.');assert.equal(r.calculations[1].data_json.werkbeschrijving_structured.summary,'Plafond maken.');assert.equal(r.docs.get('quotes/source').splitPrimary.operationId,r.calculations[0].data_json.splitCostAllocation.operationId);assert.equal(r.docs.get('quotes/child1').splitSource.operationId,r.calculations[1].data_json.splitCostAllocation.operationId);});

test('beide deeloffertes behouden hun eigen calculatietekening en nemen deze op in de PDF',async()=>{const r=route();assert.equal((await r.post()).status,200);const {quoteDrawingUrls}=require('../src/lib/quote-drawing-attachments.ts');assert.deepEqual(quoteDrawingUrls(r.docs.get('quotes/source')),['https://example.com/wall.png']);assert.deepEqual(quoteDrawingUrls(r.docs.get('quotes/child1')),['https://example.com/ceiling.png']);assert.equal(r.docs.get('quotes/source').splitIncludeDrawings,true);assert.equal(r.docs.get('quotes/child1').splitIncludeDrawings,true);});

test('30/10 balken behouden 40 stuks en de oorspronkelijke 198 euro',()=>{
 const source=structuredClone(data);source.grootmaterialen[0]={product:'Vuren',aantal:40,eenheid:'stuk',prijs_per_stuk:4.95};
 const d=draft();d[0].materialRows[0].allocation=30;d[1].materialRows.push({...row('groot',0),allocation:10});
 const fixed={...settings,extras:{...settings.extras,winstMarge:{mode:'fixed',fixedAmount:325.04}}};
 const p=planQuoteSplit(source,fixed,d,['wall','roof'],10);
 assert.deepEqual(p.parts.map(p=>p.data.grootmaterialen.find(m=>m.product==='Vuren').aantal),[30,10]);
 assert.equal(p.parts.reduce((n,p)=>n+p.data.grootmaterialen.filter(m=>m.product==='Vuren').reduce((n,m)=>n+m.aantal*m.prijs_per_stuk,0),0),198);
 for(const value of [11,9,-1,NaN,Infinity]){d[1].materialRows[1].allocation=value;assert.throws(()=>planQuoteSplit(source,fixed,d,['wall','roof'],10),/Vuren/);}
});
test('klein materiaal wordt in centen verdeeld en niet als fysieke stuks',()=>{
 const source=structuredClone(data);source.verbruiksartikelen[0]={product:'Klein materiaal (schatting)',aantal:1,prijs_per_stuk:225,prijs_excl_btw:225};
 const fixed={...settings,extras:{...settings.extras,winstMarge:{mode:'fixed',fixedAmount:325.04}}};
 const d=draft();d[0].materialRows[1].allocation=175.01;d[1].materialRows.push({...row('verbruik',0),allocation:49.99});
 const p=planQuoteSplit(source,fixed,d,['wall','roof'],10);
 assert.deepEqual(p.parts.map(p=>p.data.verbruiksartikelen[0].prijs_per_stuk),[175.01,49.99]);
 assert.deepEqual(p.parts.map(p=>p.data.verbruiksartikelen[0].aantal),[1,1]);
 assert.deepEqual(p.parts.map(p=>require('../src/lib/quote-calculations.ts').normalizeDataJson(p.data).verbruiksartikelen[0].prijs_per_stuk),[175.01,49.99]);
 d[1].materialRows[1].allocation=49.991;assert.throws(()=>planQuoteSplit(source,fixed,d,['wall','roof'],10),/twee decimalen/);
});
test('route bewaart verdeelde aantallen in beide calculaties',async()=>{
 const r=route();const d=draft();d[0].materialRows[0].allocation=1.5;d[1].materialRows.push({...row('groot',0),allocation:0.5});
 assert.equal((await r.post({splits:d})).status,200);
 assert.equal(r.calculations[0].data_json.grootmaterialen[0].aantal,1.5);
 assert.equal(r.calculations[1].data_json.grootmaterialen[1].aantal,0.5);
});

test('teruggedraaide poging geeft expliciet toestemming voor retry zonder invoerverlies',async()=>{
 const r=route({failInsert:true});const first=await r.post();assert.equal(first.body.retryable,true);assert.equal(first.body.stage,'nieuwe calculaties opslaan');
 const retry=await r.post();assert.equal(retry.status,409);assert.equal(retry.body.retryable,true);
});
test('calculatie gaat bij schrijven en herstel via RPC-body, nooit als URL-filter',async()=>{
 const r=route({failCommit:true});await r.post();const calls=r.calls.filter(c=>c.op==='rpc');assert.equal(calls.length,2);
 assert.deepEqual(calls[0].args.p_expected,data);assert.deepEqual(calls[1].args.p_replacement,data);
 assert.doesNotMatch(fs.readFileSync('src/app/api/quotes/split/route.ts','utf8'),/\.eq\('data_json'/);
});
