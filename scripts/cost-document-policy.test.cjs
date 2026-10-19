const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'commonjs',moduleResolution:'node'}});
const {costDocumentError,costDocumentKeys}=require('../src/lib/cost-document-policy');
const invoice={document_type:'invoice',supplier_name:'Wear2Work',supplier_invoice_number:'26755790',amount_excl_btw:298.94,btw_amount:62.77,amount_incl_btw:361.71};
test('bestelbevestiging is nooit boekbaar, ook met geldige BTW',()=>{
 assert.ok(costDocumentError({...invoice,document_type:'order_confirmation'}));
 assert.equal(costDocumentError(invoice),null);
});
test('onbekende BTW en opgehoogd bruto bedrag worden geweigerd',()=>{
 assert.ok(costDocumentError({...invoice,btw_amount:null}));
 assert.ok(costDocumentError({...invoice,amount_incl_btw:437.67}));
});
test('dezelfde factuur heeft dezelfde sleutel over mailboxen en bestandsnamen',()=>{
 assert.deepEqual(costDocumentKeys('u',invoice),costDocumentKeys('u',{...invoice,supplier_name:' WEAR2WORK ',source_email:'other',source_filename:'different.pdf'}));
 assert.notDeepEqual(costDocumentKeys('u',invoice),costDocumentKeys('v',invoice));
});
test('hetzelfde bronbestand wordt herkend ook zonder factuurnummer',()=>{
 assert.deepEqual(costDocumentKeys('u',{receipt_files:[{sha256:'abc'}]}),costDocumentKeys('u',{source_filename:'other.pdf',receipt_files:[{sha256:'abc'}]}));
});
test('harde n8n-poort weigert een positief AI-oordeel voor een order',()=>{
 const parse=new Function('$json',fs.readFileSync('n8n/parse-document-classification.js','utf8'));
 assert.equal(parse({is_cost_document:true,document_type:'order_confirmation'})[0].json.classification.is_cost_document,false);
 assert.equal(parse({is_cost_document:true,document_type:'invoice'})[0].json.classification.is_cost_document,true);
});
