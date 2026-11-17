const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) { return resolve.call(this, name.startsWith('@/') ? process.cwd() + '/src/' + name.slice(2) : name, ...args); };

function route({ owner='owner', locked=false, status='completed', aiError=false }={}) {
    const source={totaal_uren:50,grootmaterialen:[],verbruiksartikelen:[]};
    const body={quoteId:'source',calculationId:'calc',sourceDataJson:source,drafts:[{id:'a',title:'Wand'},{id:'b',title:'Plafond'}],notes:[]};
    let aiCalls=0;
    const writes=[];
    const noWrite=()=>{writes.push(true);throw Error('Analyse mag niets opslaan');};
    const firestore={collection:name=>({doc:()=>({get:async()=>({data:()=>name==='quotes'?{userId:owner,splitInProgress:locked,klussen:{wall:{},ceiling:{}}}:{settings:{planningSettings:{defaultWorkdayHours:10}}}}),set:noWrite,update:noWrite,delete:noWrite,create:noWrite})}),runTransaction:noWrite,batch:noWrite};
    const query={select:()=>query,eq:()=>query,order:()=>query,limit:async()=>({data:[{id:'calc',status,data_json:source}]}),insert:noWrite,update:noWrite,upsert:noWrite,delete:noWrite};
    const overrides={
        'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},
        '@/firebase/admin':{initFirebaseAdmin:()=>({firestore,auth:{verifyIdToken:async token=>{if(token!=='valid')throw Error('bad token');return{uid:'owner'};}}})},
        '@/lib/supabase-admin':{supabaseAdmin:{from:()=>query}},
        '@/lib/demo-trial-server':{ensureDemoTrialActiveByUid:async()=>null},
        '@/lib/quote-split-ai':{analyzeQuoteSplit:async input=>{aiCalls++;assert.equal(input.hoursPerDay,10);assert.ok(input.settings.extras);if(aiError)throw Error('AI tijdelijk niet bereikbaar');return{model:'gpt-6-astra',drafts:input.drafts};}},
    };
    const ts=require('typescript'),mod={exports:{}};
    new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/app/api/quotes/split/analyze/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(name=>overrides[name]||require(name),mod,mod.exports);
    return {writes,aiCalls:()=>aiCalls,post:(patch={},token='valid')=>mod.exports.POST(new Request('http://localhost/api/quotes/split/analyze',{method:'POST',headers:token?{authorization:`Bearer ${token}`}:{},body:JSON.stringify({...body,...patch})}))};
}
test('analyse weigert ontbrekende/ongeldige login en andere eigenaar vóór een AI-aanvraag',async()=>{
    for(const token of [null,'invalid']){const r=route();assert.equal((await r.post({},token)).status,401);assert.equal(r.aiCalls(),0);assert.deepEqual(r.writes,[]);}
    const r=route({owner:'other'});assert.equal((await r.post()).status,403);assert.equal(r.aiCalls(),0);assert.deepEqual(r.writes,[]);
});
test('gewijzigde of lopende bron wordt niet geanalyseerd',async()=>{
    for(const [options,patch] of [[{locked:true},{}],[{status:'processing'},{}],[{},{calculationId:'old'}],[{},{sourceDataJson:{totaal_uren:49}}]]){
        const r=route(options);assert.equal((await r.post(patch)).status,409);assert.equal(r.aiCalls(),0);assert.deepEqual(r.writes,[]);
    }
});
test('succes en AI-fout schrijven geen offerte, calculatie, historie of nummer',async()=>{
    for(const aiError of [false,true]){const r=route({aiError});const response=await r.post();assert.equal(response.status,aiError?502:200);assert.equal(r.aiCalls(),1);assert.deepEqual(r.writes,[]);if(!aiError)assert.equal(response.body.model,'gpt-6-astra');else{assert.equal(response.body.message,'AI tijdelijk niet bereikbaar');assert.equal(response.body.stage,'AI-verdeling maken en controleren');}}
});
test('ongeldige invoer benoemt het concrete veld en de stap',async()=>{
    const r=route();const response=await r.post({drafts:[]});
    assert.equal(response.status,400);assert.match(response.body.message,/drafts/);
    assert.equal(response.body.stage,'invoer controleren');assert.equal(r.aiCalls(),0);assert.deepEqual(r.writes,[]);
});
