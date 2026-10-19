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
const {simplifyMaterialCategory}=load('src/lib/material-taxonomy.ts');
test('compacte categorieen ondersteunen oude werkpakketten zonder overige groepen te wijzigen',()=>{
 for(const name of ['Leidingwerk','Tuin','Schildermateriaal','Lijm, kit en PUR','Glas','Bescherming en afdekken','Betonpoer','Bevestiging','Gereedschap']) assert.equal(simplifyMaterialCategory(name),'Overig');
 for(const name of ['Gipsplaten','Gipsafwerking','Gips']) assert.equal(simplifyMaterialCategory(name),'Gips');
 for(const name of ['Hout','Plaatmateriaal','Deuren en kozijnen','Isolatie']) assert.equal(simplifyMaterialCategory(name),name);
});
const {resolveMaterialOpeningCategory}=load('src/lib/material-taxonomy.ts');
const catalog=[{categorie:'Deuren en kozijnen',sub_categorie:'Binnendeuren'},{categorie:'Gips',sub_categorie:'AK2'},{categorie:'Plaatmateriaal',sub_categorie:'OSB'},{categorie:'Hout',sub_categorie:'Vuren'},{categorie:'Overig',sub_categorie:null},{categorie:'Folie en tape',sub_categorie:'DPC'}];
test('onderdelen openen bestaande hoofdgroepen in plaats van oude categorieen',()=>{
 for(const hint of ['Binnendeuren','Binnendeur','Montage kozijnen','Deurbeslag','Hang- en sluitwerk'])assert.equal(resolveMaterialOpeningCategory(hint,catalog),'Deuren en kozijnen');
 assert.equal(resolveMaterialOpeningCategory('Gipsplaten',catalog),'Gips');
 assert.equal(resolveMaterialOpeningCategory('Constructieplaten',catalog),'Plaatmateriaal');
 assert.equal(resolveMaterialOpeningCategory('Vuren hout',catalog),'Hout');
 assert.equal(resolveMaterialOpeningCategory('Gipsafwerking',catalog),'Overig');
 assert.equal(resolveMaterialOpeningCategory('AK2',catalog),'Gips');
 assert.equal(resolveMaterialOpeningCategory('Folieën, Dpc',catalog),'Folie en tape');
});
test('onbekende en dubbelzinnige categorieen beginnen zonder materiaalresultaten',()=>{
 for(const hint of [undefined,'all','Afwerking','Onbekend',['Hout','Gips'],'Gips, onbekend'])assert.equal(resolveMaterialOpeningCategory(hint,catalog),'');
 assert.equal(resolveMaterialOpeningCategory('Gipsplaten',[]),'');
 assert.equal(resolveMaterialOpeningCategory('AK2',[...catalog,{categorie:'Plaatmateriaal',sub_categorie:'AK2'}]),'');
 assert.equal(resolveMaterialOpeningCategory('Nieuwe groep',[...catalog,{categorie:'Nieuwe groep'}]),'Nieuwe groep');
});
