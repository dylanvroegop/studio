require('dotenv').config({path:'.env.local',quiet:true});
const fs=require('fs'),assert=require('node:assert/strict');const s=require('@supabase/supabase-js').createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const uid='C29EkAPLJzQSQgv7nwm6Uwj6agv2',plan=require('./plan.json'),snapshot=require('./sources.json');
(async()=>{
 const {data:current,error}=await s.from('main_material_list').select('*').eq('gebruikerid',uid).eq('is_active',true).limit(1000);if(error)throw error;
 const patches=new Map();for(const p of plan.updates)patches.set(p.row_id,{...patches.get(p.row_id),...p});
 for(const [id,patch] of patches){const before=snapshot.materials.find(m=>m.row_id===id),now=current.find(m=>m.row_id===id);assert(now,'Materiaal intussen verdwenen: '+id);for(const key of Object.keys(patch))assert.deepEqual(now[key],before[key],'Materiaal intussen gewijzigd: '+key+' '+id);}
 for(const m of plan.inserts){assert.equal(m.gebruikerid,uid);assert(Number(m.prijs_excl_btw)>0);assert(m.ai_extra_data.purchase_research.evidence.length);assert(!current.some(c=>c.row_id===m.row_id),'Import is al toegepast');}
 fs.writeFileSync(__dirname+'/before-apply.json',JSON.stringify(current,null,2));
 const log={startedAt:new Date().toISOString(),inserted:[],updated:[]};const save=()=>fs.writeFileSync(__dirname+'/applied.json',JSON.stringify(log,null,2));save();
 const result=await s.from('main_material_list').insert(plan.inserts).select('row_id');if(result.error)throw result.error;log.inserted=result.data.map(r=>r.row_id);save();
 for(const [id,{row_id,...patch}] of patches){const result=await s.from('main_material_list').update(patch).eq('gebruikerid',uid).eq('row_id',id).select('row_id');if(result.error)throw result.error;assert.equal(result.data.length,1);log.updated.push(id);save();}
 const check=await s.from('main_material_list').select('*').eq('gebruikerid',uid).eq('is_active',true).limit(1000);if(check.error)throw check.error;
 for(const m of plan.inserts){const saved=check.data.find(r=>r.row_id===m.row_id);assert(saved);assert.equal(saved.prijs_excl_btw,m.prijs_excl_btw);assert.equal(saved.eenheid,m.eenheid);}
 for(const before of current){const saved=check.data.find(r=>r.row_id===before.row_id);assert(saved);assert.equal(saved.prijs_excl_btw,before.prijs_excl_btw);}
 log.finishedAt=new Date().toISOString();log.activeCount=check.data.length;save();console.log(JSON.stringify({added:log.inserted.length,organized:log.updated.length,active:log.activeCount}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
