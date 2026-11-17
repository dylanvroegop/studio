const assert=require('node:assert/strict');
const {test}=require('node:test');
const Module=require('node:module');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'commonjs',moduleResolution:'node'}});
const resolve=Module._resolveFilename;
Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?process.cwd()+'/src/'+name.slice(2):name,...args);};
const {planQuoteSplit}=require('../src/lib/quote-split.ts');
const {splitJobArea,automaticSplitCostKey}=require('../src/lib/quote-split-scope.ts');
const {validateSplitAnalysis,analyzeQuoteSplit,buildSplitAnalysisPrompt,buildSplitAnalysisSchema,QUOTE_SPLIT_AI_MODEL}=require('../src/lib/quote-split-ai.ts');
const {quoteDrawingUrls,loadQuoteDrawingImages}=require('../src/lib/quote-drawing-attachments.ts');
const settings={btwTarief:21,uurTariefExclBtw:50,extras:{transport:{mode:'none'},winstMarge:{mode:'fixed',fixedAmount:100,percentage:0,basis:'totaal'}}};
const jobs={wall:{maatwerk:{meta:{type:'hsb-wand'},basis:[{lengte:4000,hoogte:2500}]},visualisatieSnapshots:[{url:'https://example.com/wall.png'}]},ceiling:{maatwerk:{meta:{type:'plafond'},basis:[{lengte:10000,breedte:5000}]},visualisatieUrl:'https://example.com/ceiling.png'}};
const source={totaal_uren:50,grootmaterialen:[{product:'Wandplaten',aantal:8,prijs_per_stuk:10},{product:'Plafondplaten',aantal:41,prijs_per_stuk:15}],verbruiksartikelen:[{product:'Afvalkosten',aantal:1,prijs_per_stuk:30},{product:'Naden schilderklaar',aantal:1,prijs_per_stuk:73.68,prijs_excl_btw:73.68}],instellingen:settings,extras:settings.extras,werkbeschrijving_structured:{afvalAfvoeren:true,nadenVullenInbegrepen:true,nadenVullenAfwerkingsniveau:'schilderklaar'}};
const drafts=()=>[{id:'a',title:'Wand',workDescription:'Wand met boog.',selectedKlusIds:['wall'],totalHours:20,marginAmount:40,materialRows:[{sourceCategory:'groot',sourceIndex:0,item:{}}]},{id:'b',title:'Plafond',workDescription:'Verlaagd plafond.',selectedKlusIds:['ceiling'],totalHours:30,marginAmount:60,materialRows:[{sourceCategory:'groot',sourceIndex:1,item:{}}]}];
const plan=(data=source,parts=drafts(),j=jobs)=>planQuoteSplit(data,settings,parts,Object.keys(j),10,j);
test('afval en naden automatisch naar m², met behoud van oorspronkelijke centen',()=>{const p=plan();assert.deepEqual(p.parts.map(p=>p.areaM2),[10,50]);assert.deepEqual(p.parts.map(p=>p.scopeCosts),[{afval:5,naden:12.28},{afval:25,naden:61.4}]);assert.equal(p.parts.reduce((n,p)=>n+p.data.verbruiksartikelen.length,0),4);assert.ok(Math.abs(p.differenceCents)<=1);});
test('herindelen klussen herverdeelt automatisch kosten; oppervlakten blijven corrigeerbaar',()=>{const d=drafts();[d[0].selectedKlusIds,d[1].selectedKlusIds]=[d[1].selectedKlusIds,d[0].selectedKlusIds];assert.deepEqual(plan(source,d).parts.map(p=>p.scopeCosts.afval),[25,5]);d[0].surfaceM2=10;assert.deepEqual(plan(source,d).parts.map(p=>p.scopeCosts.afval),[15,15]);});
test('uitgeschakelde opties behouden expliciete handmatige verdeling',()=>{const data=structuredClone(source);data.werkbeschrijving_structured.afvalAfvoeren=false;data.werkbeschrijving_structured.nadenVullenInbegrepen=false;assert.equal(automaticSplitCostKey(data.verbruiksartikelen[0],data),null);const d=drafts();d[0].materialRows.push(...[0,1].map(sourceIndex=>({sourceCategory:'verbruik',sourceIndex,item:{}})));assert.deepEqual(plan(data,d).parts.map(p=>p.data.verbruiksartikelen.length),[2,0]);});
test('ontbrekende m² leiden nooit tot een stil verzonnen verdeling',()=>{assert.throws(()=>plan(source,drafts(),{wall:{},ceiling:jobs.ceiling}),/m²/);});
test('oppervlakte volgt netto maten, aantallen, openingen en twee zichtzijden',()=>{assert.equal(splitJobArea({maatwerk:{meta:{type:'wand'},basis:[{lengte:4000,hoogte:2500,aantal:2,openings:[{breedte:1000,hoogte:2000}]}]},materialen:{materialen_lijst:{beplating_2:{}}}}),32);assert.equal(splitJobArea({maatwerk:{meta:{type:'plafond'},basis:[{netto_oppervlakte_m2:12.5}]}}),12.5);});
const input={source,settings,jobs,drafts:[{id:'a',title:'Wand'},{id:'b',title:'Plafond'}],notes:[],hoursPerDay:10};
const raw=()=>({parts:[{id:'a',title:'Wand met boog',hoursWeight:2,description:'Wand met boog maken.',jobIds:['wall'],materialAllocations:[{key:'groot-0',value:8}],noteSectionIds:[],maatwerkKeys:[],surfaceM2:999,reason:'Extra paswerk voor de boog.'},{id:'b',title:'Plafond',hoursWeight:3,description:'Plafond verlagen.',jobIds:['ceiling'],materialAllocations:[{key:'groot-1',value:41}],noteSectionIds:[],maatwerkKeys:[],surfaceM2:null,reason:'Grotere oppervlakte.'}],warnings:[]});
test('maatwerkregels krijgen expliciete toegestane sleutels die overeenkomen met de editor',()=>{
    const withNotes={...input,notes:[{id:'block-1',title:'Werk',notes:'Wand en plafond',maatwerkLines:[{id:'line-1',title:'Wand',length:'4000'},{id:'line-2',title:'Plafond',length:'10000'}]},{id:'block-2',title:'Aanvulling',notes:'',maatwerkLines:[{id:'line-1',title:'Tweede regel'}]}]};
    const prompt=JSON.parse(buildSplitAnalysisPrompt(withNotes));
    const keys=prompt.notes.flatMap(note=>note.maatwerkLines.map(line=>line.key));
    assert.deepEqual(keys,['block-1:line-1','block-1:line-2','block-2:line-1']);
    const props=buildSplitAnalysisSchema(withNotes).properties.parts.items.properties;
    assert.deepEqual(props.maatwerkKeys.items.enum,keys);
    const response=raw();response.parts[0].maatwerkKeys=[keys[0],keys[2]];response.parts[1].maatwerkKeys=[keys[1]];
    assert.deepEqual(validateSplitAnalysis(response,withNotes).maatwerkAssignments,{'block-1:line-1':'a','block-2:line-1':'a','block-1:line-2':'b'});
    response.parts[1].maatwerkKeys=[keys[0]];
    const ambiguous=validateSplitAnalysis(response,withNotes);
    assert.equal(ambiguous.maatwerkAssignments[keys[0]],undefined);
    assert.match(ambiguous.warnings.join(' '),/Maatwerkregel.*bestaande toewijzing is behouden/);
    response.parts[1].maatwerkKeys=['line-2'];
    assert.throws(()=>validateSplitAnalysis(response,withNotes),/maatwerkregel/);
});
test('gezamenlijk notitieblok blokkeert bruikbare uren en beschrijvingen niet',()=>{
    const withNotes={...input,notes:[{id:'shared',title:'Plafond en wand',notes:'Spotjes en boog.',maatwerkLines:[]}]};
    const response=raw();response.parts.forEach(part=>part.noteSectionIds=['shared']);
    const result=validateSplitAnalysis(response,withNotes);
    assert.deepEqual(result.noteAssignments,{});
    assert.match(result.warnings.join(' '),/Notitieblok.*Plafond en wand.*bestaande toewijzing is behouden/);
    assert.deepEqual(result.drafts.map(d=>d.totalHours),[20,30]);
    assert.ok(result.drafts.every(d=>d.workDescription));
    response.parts[1].noteSectionIds=['unknown'];
    assert.throws(()=>validateSplitAnalysis(response,withNotes),/onbekende notitie/);
});
test('zonder maatwerkregels kan het AI-schema geen verwijzingen verzinnen',()=>{
    const props=buildSplitAnalysisSchema(input).properties.parts.items.properties;
    assert.equal(props.maatwerkKeys.maxItems,0);assert.equal(props.noteSectionIds.maxItems,0);
    assert.deepEqual(props.materialAllocations.items.properties.key.enum,['groot-0','groot-1']);
});
test('AI vult uren en beschrijvingen in; gemeten m² hebben voorrang',()=>{const before=structuredClone(input);const result=validateSplitAnalysis(raw(),input);assert.deepEqual(result.drafts.map(d=>d.totalHours),[20,30]);assert.deepEqual(result.drafts.map(d=>d.marginAmount),[40,60]);assert.deepEqual(result.drafts.map(d=>d.surfaceM2),[null,null]);assert.equal(result.drafts[0].workDescription,'Wand met boog maken.');assert.deepEqual(input,before);});
test('onbekende/dubbele/verloren AI-producten of klus-IDs worden geweigerd',()=>{for(const change of [r=>r.parts[1].materialAllocations=[{key:'groot-0',value:8}],r=>r.parts[1].materialAllocations=[],r=>r.parts[1].jobIds=['unknown'],r=>r.parts[1].id='unknown',r=>r.parts[0].materialAllocations.push({key:'verbruik-0',value:1})]){const r=raw();change(r);assert.throws(()=>validateSplitAnalysis(r,input));}});
test('Astra-call gebruikt exact gevraagd model en gestructureerde output; weigering bewaart invoer',async()=>{const oldFetch=global.fetch,oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='synthetic-test';try{let sent;global.fetch=async(_,opts)=>{sent=JSON.parse(opts.body);return{ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(raw())}]}]})};};await analyzeQuoteSplit(input);assert.equal(sent.model,'gpt-6-astra');assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);assert.equal(QUOTE_SPLIT_AI_MODEL,'gpt-6-astra');global.fetch=async()=>({ok:true,json:async()=>({status:'incomplete'})});await assert.rejects(analyzeQuoteSplit(input),/niet afgerond/);}finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}});
test('elk deel houdt alleen zijn eigen calculatietekeningen; laadfout wordt niet verzwegen',async()=>{assert.deepEqual(quoteDrawingUrls({klussen:{wall:jobs.wall}}),['https://example.com/wall.png']);assert.deepEqual(quoteDrawingUrls({klussen:{ceiling:jobs.ceiling}}),['https://example.com/ceiling.png']);const oldFetch=global.fetch;try{global.fetch=async()=>({ok:false});await assert.rejects(loadQuoteDrawingImages({klussen:jobs}),/niet worden geladen/);}finally{global.fetch=oldFetch;}});

test('lopende of mislukte tekeningen blokkeren de PDF met een herstelbare melding',async()=>{
    for(const status of ['pending','processing','error'])await assert.rejects(loadQuoteDrawingImages({klussen:{wall:{...jobs.wall,visualisatieStatus:status}}}),/calculatietekening/);
});

test('AI-fout vermeldt ontbrekend veld of afgebroken antwoord in plaats van alleen mislukt',async()=>{
    const oldFetch=global.fetch,oldKey=process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY='synthetic-test';
    try{
        const incomplete=raw();delete incomplete.parts[0].description;
        for(const [payload,expected] of [
            [{status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(incomplete)}]}]},/parts\.0\.description/],
            [{status:'incomplete',incomplete_details:{reason:'max_output_tokens'}},/maximale antwoordlengte/],
            [{status:'completed',output:[]},/geen verdelingsvoorstel/],
        ]){
            global.fetch=async()=>({ok:true,json:async()=>payload});
            await assert.rejects(analyzeQuoteSplit(input),expected);
        }
    }finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});

test('officiële PDF van beide delen bevat tekeningen ondanks oude uitgeschakelde PDF-optie',()=>{
    const {buildOfficialQuotePdfData}=require('../src/lib/quote-pdf-data.ts');
    const {normalizeDataJson}=require('../src/lib/quote-calculations.ts');
    const normalizedData=normalizeDataJson(source);
    for(const drawing of ['wall','ceiling']){
        const result=buildOfficialQuotePdfData({quote:{splitIncludeDrawings:true},quoteSettings:settings,normalizedData,workDescriptionStructured:normalizedData.werkbeschrijving_structured,materials:{groot:[],verbruik:[]},pdfSettings:{showTekeningen:false},capturedDrawings:[drawing]});
        assert.equal(result.settings.showTekeningen,true);
        assert.deepEqual(result.drawingImages,[drawing]);
    }
});

test('AI verdeelt gedeelde balken en klein materiaal zonder prijs of hoeveelheid te veranderen',()=>{
 const shared=structuredClone(source);
 shared.grootmaterialen.push({product:'Vuren C24',aantal:40,prijs_per_stuk:4.95});
 shared.verbruiksartikelen.push({product:'Klein materiaal (schatting)',aantal:1,prijs_per_stuk:225,prijs_excl_btw:225});
 const r=raw();r.parts[0].materialAllocations.push({key:'groot-2',value:10},{key:'verbruik-2',value:50});r.parts[1].materialAllocations.push({key:'groot-2',value:30},{key:'verbruik-2',value:175});
 const result=validateSplitAnalysis(r,{...input,source:shared});
 assert.deepEqual(result.materialAssignments['groot-2'],{a:10,b:30});
 assert.deepEqual(result.materialAssignments['verbruik-2'],{a:50,b:175});
 const prompt=JSON.parse(buildSplitAnalysisPrompt({...input,source:shared}));
 assert.equal(prompt.materials.find(m=>m.key==='verbruik-2').allocationTotal,225);
 assert.equal(prompt.materials.find(m=>m.key==='verbruik-2').allocationUnit,'EUR excl. btw');
 r.parts[1].materialAllocations[1].value=31;
 assert.throws(()=>validateSplitAnalysis(r,{...input,source:shared}),/Vuren/);
});
