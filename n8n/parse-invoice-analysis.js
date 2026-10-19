// BTW-controle v1: onbekend is niet nul en niet 21%.
function normalizeInvoiceVat(ai) {
 const number=v=>v===null||v===undefined||v===''?null:(typeof v==='number'&&Number.isFinite(v)?v:null);
 const round=v=>Math.round((v+Number.EPSILON)*100)/100;
 const fail=message=>{throw new Error('BTW-controle: '+message+' Document niet als kosten opgeslagen; controleer de bronfactuur.');};
 let net=number(ai.subtotal_excl_btw??ai.amount_excl_btw),gross=number(ai.total_incl_btw??ai.amount_incl_btw),vat=number(ai.btw_amount);
 const rate=number(ai.btw_percentage);
 if(net===null&&gross!==null&&vat!==null)net=round(gross-vat);
 if(gross===null&&net!==null&&vat!==null)gross=round(net+vat);
 if(vat===null&&net!==null&&gross!==null)vat=round(gross-net);
 if(net===null||gross===null||vat===null)fail('Btw-uitsplitsing ontbreekt; inclusiefbedrag '+(gross??'onbekend')+' blijft inclusief.');
 if(Math.abs(round(net+vat)-gross)>0.02)fail('Exclusief + btw sluit niet aan op het factuurtotaal.');
 const lines=(Array.isArray(ai.line_items)?ai.line_items:[]).map(line=>{
  let lineNet=number(line.total_price),lineGross=number(line.total_incl_btw);
  const lineRate=number(line.btw_percentage)??rate;
  if(lineRate===null)fail('Btw-tarief ontbreekt bij '+line.description+'.');
  if(lineRate<0||lineRate>100)fail('Ongeldig btw-tarief.');
  if(lineGross!==null&&lineNet===lineGross&&lineRate>0)lineNet=round(lineGross/(1+lineRate/100));
  if(lineNet===null&&lineGross!==null)lineNet=round(lineGross/(1+lineRate/100));
  if(lineGross===null&&lineNet!==null)lineGross=round(lineNet*(1+lineRate/100));
  if(lineNet===null||lineGross===null)fail('Regelbedrag ontbreekt.');
  if(Math.abs(round(lineNet*(1+lineRate/100))-lineGross)>0.02)fail('Regelbedragen en btw spreken elkaar tegen bij '+line.description+'.');
  const qty=number(line.quantity);
  return {...line,total_price:lineNet,total_incl_btw:lineGross,btw_percentage:lineRate,unit_price:qty?lineNet/qty:lineNet};
 });
 if(lines.length){
  const sumNet=round(lines.reduce((n,l)=>n+l.total_price,0)),sumGross=round(lines.reduce((n,l)=>n+l.total_incl_btw,0));
  if(Math.abs(sumNet-net)>0.02||Math.abs(sumGross-gross)>0.02)fail('Regels sluiten niet aan op de factuurtotalen.');
 }
 const outputRate=rate??(lines.length?lines[0].btw_percentage:(net===gross?0:null));
 if(outputRate===null)fail('Geen btw-tarief beschikbaar.');
 return {...ai,line_items:lines,subtotal_excl_btw:net,total_incl_btw:gross,btw_amount:vat,btw_percentage:outputRate};
}
const input=$json??{};

function parseCandidate(value){
  if(value==null)return null;
  if(typeof value==='string'){
    const t=value.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
    if(!t)return null;
    try{return JSON.parse(t)}catch{}
    const a=t.indexOf('{'),b=t.lastIndexOf('}');
    if(a>=0&&b>a){try{return JSON.parse(t.slice(a,b+1))}catch{}}
    return null;
  }
  if(Array.isArray(value)){
    for(const x of value){const y=parseCandidate(x);if(y)return y}
    return null;
  }
  if(typeof value==='object'){
    const keys=['supplier_name','receipt_description','line_items','subtotal_excl_btw','total_incl_btw','payment_type','supplier_invoice_number'];
    if(keys.some(k=>Object.prototype.hasOwnProperty.call(value,k)))return value;
    for(const k of ['text','output','response','content']){
      if(value[k]!==undefined){const y=parseCandidate(value[k]);if(y)return y}
    }
  }
  return null;
}

function normalizeOfferteReference(value){
  if(value==null)return null;
  const text=String(value).trim();
  if(!text)return null;
  const labelled=text.match(/(?:referentie|memo|project(?:nummer)?|offerte(?:nummer)?)\s*[:#-]?\s*(\d{5,8})\b/i);
  if(labelled)return labelled[1];
  const standalone=text.match(/^#?\s*(\d{5,8})\s*$/);
  return standalone?standalone[1]:null;
}

function resolveOfferteReference(ai){
  const direct=normalizeOfferteReference(ai.offerte_reference);
  if(direct)return direct;

  const candidates=Array.isArray(ai.reference_candidates)?ai.reference_candidates:[];
  for(const candidate of candidates){
    if(!candidate||typeof candidate!=='object')continue;
    const label=String(candidate.label??'').trim();
    if(!/(referentie|memo|project|offerte)/i.test(label))continue;

    const value=normalizeOfferteReference(candidate.value);
    if(value)return value;

    const context=normalizeOfferteReference(label+' '+String(candidate.context??''));
    if(context)return context;
  }
  return null;
}

const classification=$('Parse Document Classification').item.json.classification;
if(!classification?.is_cost_document || !['invoice','receipt','credit_note'].includes(classification.document_type)) throw new Error('Geen boekbaar aankoopdocument. Alleen archiveren.');
const extracted=parseCandidate(input);
if(extracted?.document_type && !['invoice','receipt','credit_note'].includes(extracted.document_type)) throw new Error('Documentclassificaties spreken elkaar tegen. Controleer het bronbestand.');
const ai=extracted ? normalizeInvoiceVat(extracted) : null;
if(!ai)throw new Error('Analyze Invoice PDF gaf geen bruikbare JSON-factuurdata terug.');

const source=(()=>{try{return $('Select Invoice PDF').item.json||{}}catch{return {}}})();
const items=Array.isArray(ai.line_items)?ai.line_items:[];
const supplier=String(ai.supplier_name??'Onbekende leverancier');
const isBouwmaat=/bouwmaat/i.test(supplier);
const invoiceNumber=ai.supplier_invoice_number??ai.invoice_number??ai.factuur_nummer??null;
const pt=['bon','factuur','private'].includes(String(ai.payment_type||'').toLowerCase())?String(ai.payment_type).toLowerCase():'unknown';
const ps=['paid','openstaand','private'].includes(String(ai.payment_status||'').toLowerCase())?String(ai.payment_status).toLowerCase():'unknown';
const group=ai.reconciliation_group_id||(isBouwmaat&&invoiceNumber?'bouwmaat:'+String(invoiceNumber):null);
const offerteReference=resolveOfferteReference(ai);

return[{json:{data:{
  document_type:classification.document_type,
  supplier_name:supplier,
  description:ai.receipt_description??ai.description??'',
  line_items:items,
  amount_excl_btw:ai.subtotal_excl_btw,
  amount_incl_btw:ai.total_incl_btw,
  btw_percentage:ai.btw_percentage,
  btw_amount:ai.btw_amount,
  date:ai.date??null,
  offerte_reference:offerteReference,
  reference_candidates:Array.isArray(ai.reference_candidates)?ai.reference_candidates:[],
  offerte_id:ai.offerte_id??null,
  suggested_category:items[0]?.category??'overig',
  manual_amount_override:false,
  payment_type:pt,
  payment_status:ps,
  due_date:ai.due_date||null,
  supplier_invoice_number:invoiceNumber?String(invoiceNumber):null,
  reconciliation_group_id:group,
  source_email:source.source_email??null,
  source_filename:source.source_filename??source.attachmentFileName??null
}}}];