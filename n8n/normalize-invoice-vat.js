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
