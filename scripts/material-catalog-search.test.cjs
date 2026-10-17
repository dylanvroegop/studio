const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
function load(file) { const m={exports:{}}; new Function('module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports);return m.exports; }
const {matchesMaterialSearch,materialCategoryPath,materialPriceSourceLabel}=load('src/lib/material-catalog-search.ts');
const {normalizeTaxonomyLabel}=load('src/lib/material-taxonomy.ts');
const material={materiaalnaam:'Knauf Gipsplaat A AK 260x60cm 12,5mm',categorie:'Gipsplaten',sub_categorie:'AK2',leverancier:'Bouwmaat'};
test('zoeken combineert hoofdgroep, subtype, maat en leverancier in elke volgorde',()=>{
 assert.equal(matchesMaterialSearch(material,'ak2 gipsplaten 12.5 Bouwmaat'),true);
 assert.equal(matchesMaterialSearch(material,'260 × 60'),true);
 assert.equal(matchesMaterialSearch(material,'gipsplaten rk'),false);
 assert.equal(materialCategoryPath(material),'Gipsplaten → AK2');
});
test('historische factuurdatum wordt niet als bron van een gewijzigde prijs getoond',()=>{
 const source={price_date:'2026-09-09',unit_price_excl:5.27};
 assert.equal(materialPriceSourceLabel(source,5.27),'Factuur 09-09-2026');
 assert.equal(materialPriceSourceLabel(source,6.50),'Prijsdatum onbekend');
 assert.equal(materialPriceSourceLabel(undefined,5.27),'Prijsdatum onbekend');
});
test('materiaalafkortingen blijven herkenbaar',()=>{for(const label of ['ak2','ak4','rk','mdf','osb','pir'])assert.equal(normalizeTaxonomyLabel(label),label.toUpperCase());});
