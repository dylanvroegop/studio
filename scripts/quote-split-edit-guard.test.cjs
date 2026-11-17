const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
function route({locked=false,operationId=null}={}) {
 let writes=0, saved;
 const current={quoteid:'q',data_json:{totaal_uren:20,...(operationId?{splitCostAllocation:{operationId}}:{})}};
 const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:current})};
 const mock={
  'next/server':{NextResponse:{json:(body,opt)=>({body,status:opt?.status||200})}},
  '@/firebase/admin':{initFirebaseAdmin:()=>({auth:{verifyIdToken:async()=>({uid:'u'})},firestore:{collection:()=>({doc:()=>({get:async()=>({data:()=>({splitInProgress:locked})})})})}})},
  '@/lib/supabase-admin':{supabaseAdmin:{from:()=>q,rpc:async(_,args)=>{writes++;saved=args.patch;return{data:[{}]};}}},
  '@/lib/demo-trial-server':{ensureDemoTrialActiveByUid:async()=>null},
  '@/lib/quote-data-patch':{createQuoteDataPatch:()=>{throw Error('unexpected full update');}},
 };
 const mod={exports:{}};
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/app/api/quotes/update-data-json/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(name=>mock[name],mod,mod.exports);
 return {post:split_operation_id=>mod.exports.POST(new Request('http://localhost/api/quotes/update-data-json',{method:'POST',headers:{authorization:'Bearer valid'},body:JSON.stringify({calculation_id:'c',split_operation_id,data_json_patch:{totaal_uren:22,splitCostAllocation:{operationId:'forged'}}})})),writes:()=>writes,saved:()=>saved};
}
test('oude tab en lopende splitsing blokkeren editor-save zonder mutatie',async()=>{
 for (const options of [{locked:true},{operationId:'new-split'}]) {const r=route(options);assert.equal((await r.post(null)).status,409);assert.equal(r.writes(),0);}
});
test('ververste deelofferte blijft bewerkbaar; herstelmarkering kan niet overschreven worden',async()=>{
 const r=route({operationId:'new-split'});assert.equal((await r.post('new-split')).status,200);assert.deepEqual(r.saved(),{totaal_uren:22});assert.equal(r.writes(),1);
});
test('gewone offerte zonder splitsing blijft bewerkbaar',async()=>{const r=route();assert.equal((await r.post(null)).status,200);});
