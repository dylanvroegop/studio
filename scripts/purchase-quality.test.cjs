const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(file,mocks={}) {const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>mocks[n]||require(n),m,m.exports);return m.exports;}
const {matchDeliveryAddress}=load('src/lib/purchase-delivery-address.ts');
const {classifyProduct}=load('src/lib/purchase-product-category.ts');
const costs=load('src/lib/project-costs.ts');
const {gpsHealth}=load('src/lib/gps-health.ts');
const merel={id:'merel',status:'geaccepteerd',klantinformatie:{postcode:'3817 BW',plaats:'Amersfoort',straat:'Bisschopsweg',huisnummer:'68'}};
test('afwijkend afleveradres uit screenshot koppelt aan Merel, ook zonder GPS',()=>{
 assert.equal(matchDeliveryAddress({label:'Afwijkend afleveradres',postcode:'3817BW',city:'Amersfoort',street:'Bisschopsweg',house_number:'68'},[merel])?.id,'merel');
 assert.equal(matchDeliveryAddress({label:'Afleveradres',postcode:'3817BW',city:'Amersfoort'},[merel])?.id,'merel');
});
test('postcode is niet voldoende bij twee mogelijke klussen; factuuradres en eigen bedrijfsadres tellen niet',()=>{
 const a={label:'Afleveradres',postcode:'3817BW'};
 assert.equal(matchDeliveryAddress(a,[merel,{...merel,id:'other'}]),null);
 assert.equal(matchDeliveryAddress({...a,label:'Factuuradres'},[merel]),null);
 assert.equal(matchDeliveryAddress({...a,house_number:'70'},[merel]),null);
 assert.equal(matchDeliveryAddress(a,[{...merel,archived:true}]),null);
 assert.equal(matchDeliveryAddress(a,[{...merel,klantinformatie:{...merel.klantinformatie,afwijkendProjectadres:true,projectPostcode:'9999AA'}}]),null);
});
test('100% korting blijft nul; screenshotregels tellen exact tot 1116,65 excl.',()=>{
 const rows=[372.42,80.12,451.92,105.93,65.97,21.39,18.90].map(n=>costs.normalizeProjectCostLineItem({quantity:1,unit_price:n,total_price:n}));
 const free=costs.normalizeProjectCostLineItem({description:'Grootgoed bezorging',quantity:1,unit_price:100,total_price:0,total_incl_btw:0});
 assert.equal(free.total_price,0);assert.equal(free.total_incl_btw,0);
 assert.equal(costs.sumProjectCostLineItems([...rows,free]),1116.65);
 assert.equal(costs.normalizeProjectCostLineItem({quantity:2,unit_price:5}).total_price,10);
 assert.equal(costs.normalizeProjectCostLineItem({quantity:2,unit_price:5,total_price:-10}).total_price,-10);
});
const cases=[
 ['Zaagblad voor MDF en vuren','gereedschap'],
 ['Kitpistool voor montagekit','gereedschap'],
 ['Keralit Dakrandpaneel Monumentengroen Classic 200x6000mm','materiaal'],
 ['Grootgoed bezorging','materiaal'],['Tijdelijke toeslag transportkosten','materiaal'],
 ['DeWALT Doorslijpschijf RVS 125x22,2x1,2mm 10st','materiaal'],
 ['Stanley Nieten 1-TRA205T Type A 8 mm 1000st','materiaal'],
 ['Milwaukee Oordoppen Bluetooth L4RLEPB-301 USB','gereedschap'],
 ['Stanley Fatmax Cantilever Gereedschapswagen','gereedschap'],
 ['Makita Blaas- En Zuigmachine DAS180Z LXT 18V','gereedschap'],
 ['Bouwmaat Uitvulplaat Grijs 7mm 48st','materiaal'],
 ['Berker Contactdoos Opbouw 2-Voudig Randaarde Polarwit 1st','materiaal'],
 ['Wago Verbindingsklem 3-voudig','materiaal'],['Refil Stofmasker 631 FFP2 NR D','materiaal'],
 ['Bounty','overig'],['Diesel','brandstof'],['Koffie','overig'],['Bouw- en Sloopafval','afval'],
 ['Bouwmaat Reinigingsdoekjes 80st','gereedschap'],['Svedex Match Do Dorpelset Alpine Wit 70mm 93cm','materiaal']
];
for(const [name,expected] of cases)test('product: '+name,()=>assert.equal(classifyProduct(name,'overig').category,expected));
test('eigen correctie wint, onbekende artikelcode wordt niet als zeker materiaal ingevuld',()=>{
 assert.equal(classifyProduct('Stanley Nieten','materiaal','gereedschap').category,'gereedschap');
 assert.equal(classifyProduct('AB290RVS (1871090)','materiaal').source,'needs_review');
 assert.equal(classifyProduct('AB290RVS (1871090)','materiaal',undefined,true).source,'needs_review');
 assert.equal(classifyProduct('Bekend volgens herlezing','overig',undefined,true).source,'ai_review');
});
test('GPS melding bij 20 minuten geen fix, ongeldige/future fix is onbekend, herstel is ok',()=>{
 const now=Date.parse('2026-10-11T10:00:00Z');
 assert.equal(gpsHealth('2026-10-11T09:39:00Z',now).state,'stale');
 assert.equal(gpsHealth('2026-10-11T09:59:00Z',now).state,'ok');
 assert.equal(gpsHealth(null,now).state,'unknown');
 assert.equal(gpsHealth('2026-10-12T10:00:00Z',now).state,'unknown');
});
test('categoriecorrectie wordt per gebruiker/product opgeslagen en wint bij volgende import', async()=>{
 const saved=new Map();
 const firestore={collection:()=>({doc:uid=>({collection:()=>({doc:id=>({key:uid+'/'+id,set:async value=>saved.set(uid+'/'+id,value)})})})}),getAll:async(...refs)=>refs.map(ref=>({exists:saved.has(ref.key),data:()=>saved.get(ref.key)}))};
 const service=load('src/lib/purchase-product-category-server.ts',{
  '@/firebase/admin':{initFirebaseAdmin:()=>({firestore})},
  '@/lib/purchase-product-category':load('src/lib/purchase-product-category.ts'),
  '@/lib/project-costs':costs
 });
 const before=[costs.normalizeProjectCostLineItem({description:'Stanley Nieten',category:'materiaal',total_price:5})];
 await service.rememberCategoryCorrections('owner',before,[{...before[0],category:'gereedschap'}]);
 assert.equal((await service.classifyPurchaseLines('owner',before)).lines[0].category,'gereedschap');
 assert.equal((await service.classifyPurchaseLines('other-owner',before)).lines[0].category,'materiaal');
 assert.equal(saved.size,1);
});
