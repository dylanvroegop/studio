const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => mocks[name] || require(name), Date, Intl, Set, Map, WeakMap, process });
  return module.exports;
}
const gps = load('src/lib/gps-work-sessions.ts');
const api = load('src/lib/gps-purchase-link.ts', { './gps-work-sessions': gps });
const stamp = m => new Date(Date.parse('2026-10-05T08:00:00Z') + m * 60000).toISOString();
const site = { key: 'rafael', address: 'Klantstraat 1', latitude: 52, longitude: 5, quotes: [{ id: 'rafael', status: 'geaccepteerd' }] };
function fixture() {
  const points = Array.from({length: 51}, (_, m) => ({ id: String(m), recorded_at: stamp(m), latitude: m <= 20 ? 52 : m < 40 ? 52 + (m - 20) / 1000 : 52.02, longitude: 5, speed_kmh: m > 20 && m < 40 ? 30 : 0 }));
  return { points, sites: [site], suppliers: [{ name: 'Bouwmaat Alphen', address: 'Winkelstraat 1', latitude: 52.02, longitude: 5, startAt: stamp(40), endAt: stamp(50), minutes: 10 }] };
}
const receipt = () => ({ date: '2026-10-05', supplier_name: 'Bouwmaat Alphen', payment_type: 'bon', description: 'Aankoopbon hout', line_items: [{ description: 'Hout', category: 'materiaal', total_price: 20 }, {description: 'Boor', category:'gereedschap', total_price: 10}] });
test('klant -> winkel koppelt materiaal aan vorige klant en bewaart bewijs; gereedschap niet', () => {
  const evidence = api.matchGpsPurchase(receipt(), fixture());
  assert.equal(evidence.quoteId, 'rafael');
  const result = api.applyGpsPurchaseLink(receipt(), evidence);
  assert.equal(result.line_items[0].offerte_id, 'rafael');
  assert.equal(result.line_items[0].gps_link_evidence.supplierStartAt, stamp(40));
  assert.equal(result.line_items[1].offerte_id, undefined);
});
test('geen eerdere klant, fout filiaal, ontbrekende datum, verzamelfactuur, handmatige koppeling en referenties blijven ongemoeid', () => {
  for (const change of [{ date: '' }, {date:'2026-02-30'}, {date:'2026-10-04'}, {supplier_name:'Bouwmaat Almere'}, {offerte_id:'ander'}, {offerte_reference:'260123'}, {reference_candidates:[{value:'260123'}]}, {payment_type:'factuur',description:'Maandfactuur'}, {description:'online bestelling'}, {payment_type:'private'}]) {
    assert.equal(api.matchGpsPurchase({...receipt(),...change}, fixture()), null, JSON.stringify(change));
  }
  const context=fixture(); context.points=context.points.filter(p=>p.recorded_at>=stamp(25));
  assert.equal(api.matchGpsPurchase(receipt(),context),null);
});
test('meerdere offertes op locatie, GPS-gat en passerende klantlocatie geven geen koppeling', () => {
  let c=fixture();c.sites=[{...site,quotes:[...site.quotes,{id:'ander',status:'geaccepteerd'}]}];assert.equal(api.matchGpsPurchase(receipt(),c),null);
  c=fixture();c.points=c.points.filter(p=>p.recorded_at<=stamp(19)||p.recorded_at>=stamp(41));assert.equal(api.matchGpsPurchase(receipt(),c),null);
  c=fixture();c.points=c.points.map(p=>({...p,speed_kmh:40}));assert.equal(api.matchGpsPurchase(receipt(),c),null);
  c=fixture();c.sites=[site,{...site,key:'buur',longitude:5.0001}];assert.equal(api.matchGpsPurchase(receipt(),c),null);
});
test('winkel voor klant wordt niet achteraf aan de klant toegeschreven', () => {
  const c=fixture();c.suppliers=[{...c.suppliers[0],startAt:stamp(-30),endAt:stamp(-20)}];assert.equal(api.matchGpsPurchase(receipt(),c),null);
});
test('bestaande regelkoppeling verhindert automatische aanvulling van hele bon', () => {
  const p=receipt();p.line_items[1].offerte_id='ander';assert.equal(api.matchGpsPurchase(p,fixture()),null);
});
test('afwijkende klanten bij twee passende winkelbezoeken maken datum-only bon onzeker', () => {
  const c=fixture();const second=fixture();
  second.points=second.points.map(p=>({...p,recorded_at:new Date(Date.parse(p.recorded_at)+120*60000).toISOString(),latitude:p.latitude===52?52.04:p.latitude}));
  c.points.push(...second.points);c.sites.push({...site,key:'ander',latitude:52.04,quotes:[{id:'ander',status:'geaccepteerd'}]});
  c.suppliers.push({...c.suppliers[0],startAt:stamp(160),endAt:stamp(170)});
  assert.equal(api.matchGpsPurchase(receipt(),c),null);
});
test('server: gebruikersgrens, importbewijs en herhaalde verwerking zonder dubbele updates', async () => {
  const previousOwner=process.env.CALVORA_USER_ID; process.env.CALVORA_USER_ID='owner';
  try {
    let loads=0, updates=0;
    let row={...receipt(),id:'cost',category:'materiaal',status:'confirmed',user_id:'owner',updated_at:'v1',offerte_id:null,line_items:[receipt().line_items[0]]};
    const db={from:()=>{
      let patch=null;
      const chain={select:()=>patch?Promise.resolve(row.offerte_id?[]:{data:[{id:'cost'}]}):chain,
        eq:()=>chain,is:()=>chain,gte:()=>chain,lte:()=>chain,order:()=>chain,
        range:async()=>({data:row.offerte_id?[]:[row]}),
        update:value=>{patch=value;updates++;return chain;}};
      // Laat de conditional update één rij teruggeven, daarna verdwijnt die uit de ongekoppelde selectie.
      chain.select=()=>{if(!patch)return chain;row={...row,...patch};return Promise.resolve({data:[{id:'cost'}]});};
      return chain;
    }};
    const service=load('src/lib/gps-purchase-link-server.ts',{
      '@/firebase/admin':{initFirebaseAdmin:()=>({firestore:{}})},
      '@/lib/gps-work-session-server':{loadGpsPurchaseContext:async()=>{loads++;return fixture();}},
      '@/lib/purchase-delivery-address':load('src/lib/purchase-delivery-address.ts'), '@/lib/gps-purchase-link':api,'@/lib/supabase-admin':{supabaseAdmin:db}
    });
    assert.equal((await service.linkStoredGpsPurchases('other','2026-10-05','2026-10-05',false)).linked,0);
    assert.equal(loads,0);
    const forged=receipt();forged.line_items[0].gps_link_evidence={quoteId:'fake'};forged.offerte_id='manual';
    const untouched=await service.enrichPurchaseFromGps('owner',forged);
    assert.equal(untouched.offerte_id,'manual');assert.equal(untouched.line_items[0].gps_link_evidence,undefined);assert.equal(loads,0);
    const imported=await service.enrichPurchaseFromGps('owner',receipt());
    assert.equal(service.purchaseGpsEvidence(imported).quoteId,'rafael');
    const preview=await service.linkStoredGpsPurchases('owner','2026-10-05','2026-10-05',true);
    assert.equal(preview.matches.length,1);assert.equal(updates,0);
    assert.equal((await service.linkStoredGpsPurchases('owner','2026-10-05','2026-10-05',false)).linked,1);
    assert.equal((await service.linkStoredGpsPurchases('owner','2026-10-05','2026-10-05',false)).linked,0);
    assert.equal(updates,1);assert.equal(row.line_items[0].gps_link_evidence.quoteId,'rafael');
  } finally {if(previousOwner===undefined)delete process.env.CALVORA_USER_ID;else process.env.CALVORA_USER_ID=previousOwner;}
});

test('ochtend: winkel -> eerste klant koppelt aan komende klus, middag zonder eerdere klant niet', () => {
 const c=fixture();c.points=c.points.map(p=>({...p,latitude:52.02-(p.latitude-52)}));
 c.suppliers[0]={...c.suppliers[0],startAt:stamp(0),endAt:stamp(20),minutes:20};
 assert.equal(api.matchGpsPurchase(receipt(),c)?.method,'gps_next_client');
 const afternoon={...c,points:c.points.map(p=>({...p,recorded_at:new Date(Date.parse(p.recorded_at)+6*3600000).toISOString()})),suppliers:c.suppliers.map(v=>({...v,startAt:new Date(Date.parse(v.startAt)+6*3600000).toISOString(),endAt:new Date(Date.parse(v.endAt)+6*3600000).toISOString()}))};
 assert.equal(api.matchGpsPurchase(receipt(),afternoon),null);
});
