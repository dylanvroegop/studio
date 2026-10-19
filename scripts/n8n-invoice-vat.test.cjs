const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const normalize = new Function(fs.readFileSync('n8n/normalize-invoice-vat.js','utf8')+';return normalizeInvoiceVat;')();
const parser = new Function('$json', '$', fs.readFileSync('n8n/parse-invoice-analysis.js','utf8'));
const line = (net,gross,rate=21)=>({description:'Test',quantity:1,total_price:net,total_incl_btw:gross,btw_percentage:rate});
test('Wear2Work null wordt niet 21 procent of nul euro',()=>{
 const input={supplier_name:'Wear2Work',subtotal_excl_btw:null,total_incl_btw:361.71,btw_percentage:null,btw_amount:null,line_items:[line(180.70,180.70,null)]};
 assert.throws(()=>parser({output:input},()=>({item:{json:{classification:{is_cost_document:true,document_type:'invoice'}}}})),/uitsplitsing ontbreekt/);
 assert.equal(input.btw_percentage,null);
});
test('Heimwerkertools bruto regels worden correct netto met aansluiting op factuur',()=>{
 const out=normalize({subtotal_excl_btw:145.45,total_incl_btw:175.99,btw_amount:30.54,btw_percentage:21,line_items:[line(166,166),line(9.99,9.99)]});
 assert.deepEqual(out.line_items.map(l=>l.total_price),[137.19,8.26]);
 assert.equal(out.total_incl_btw,175.99);
});
test('gemengde tarieven inclusief expliciet nul blijven behouden',()=>{
 const out=normalize({subtotal_excl_btw:110,total_incl_btw:131,btw_amount:21,btw_percentage:null,line_items:[line(100,121),line(10,10,0)]});
 assert.deepEqual(out.line_items.map(l=>l.btw_percentage),[21,0]);
});
test('creditnota behoudt negatieve bedragen',()=>{
 assert.equal(normalize({subtotal_excl_btw:-100,total_incl_btw:-121,btw_amount:-21,btw_percentage:21,line_items:[line(-100,-121)]}).total_incl_btw,-121);
});
test('afwijking wordt niet in een categorie verstopt',()=>{
 assert.throws(()=>normalize({subtotal_excl_btw:100,total_incl_btw:121,btw_amount:21,btw_percentage:21,line_items:[line(90,108.9)]}),/sluiten niet aan/);
});
