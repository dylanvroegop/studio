const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
function load(name, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)((key) => {
    if (key in dependencies) return dependencies[key];
    throw new Error(`Onverwachte dependency: ${key}`);
  }, module, module.exports);
  return module.exports;
}
const billing = load('src/lib/invoice-billing.ts');
const { buildInvoiceStartRows } = load('src/lib/invoice-start.ts', { '@/lib/invoice-billing': billing });
const quote = (extra = {}) => ({ id: 'q1', status: 'geaccepteerd', amount: 10000, klantinformatie: { voornaam: 'Jan', achternaam: 'Jansen' }, ...extra });
const invoice = (extra = {}) => ({ id: 'i1', quoteId: 'q1', invoiceType: 'voorschot', status: 'verzonden', totalsSnapshot: { totaalInclBtw: 5000 }, paymentSummary: { paidAmount: 2000 }, ...extra });

test('volgende actie gebruikt werkelijk gefactureerd voorschot na prijswijziging', () => {
  const [row] = buildInvoiceStartRows([quote({ amount: 12000 })], [invoice()]);
  assert.equal(row.action, 'Eindfactuur');
  assert.equal(row.amount, 7000);
  assert.equal(row.issuedAdvance, 5000);
  assert.equal(row.receivedAdvance, 2000);
});

test('concept voorschot wordt hervat zonder het als gefactureerd te tellen', () => {
  const [row] = buildInvoiceStartRows([quote()], [invoice({ status: 'concept' })]);
  assert.equal(row.href, '/facturen/i1?share=1');
  assert.equal(row.issuedAdvance, 0);
  assert.equal(row.action, 'Concept voorschot');
});

test('bestaande eindfactuur voorkomt opnieuw aanmaken, concept blijft klaarstaan', () => {
  const [issued] = buildInvoiceStartRows([quote()], [invoice({ invoiceType: 'eind' })]);
  assert.equal(issued.ready, false);
  assert.equal(issued.href, '/facturen/i1');
  const [draft] = buildInvoiceStartRows([quote()], [invoice({ invoiceType: 'eind', status: 'concept' })]);
  assert.equal(draft.ready, true);
  assert.equal(draft.href, '/facturen/i1?share=1');
});

test('nulpercentage en expliciet uitgeschakeld voorschot blijven eindfacturen', () => {
  assert.equal(buildInvoiceStartRows([quote()], [], 0)[0].action, 'Eindfactuur');
  assert.equal(buildInvoiceStartRows([quote({ facturatie: { voorschotIngeschakeld: false } })], [])[0].action, 'Eindfactuur');
  assert.equal(buildInvoiceStartRows([quote({ financieel: { afgesprokenPrijsInclBtw: 8000 } })], [], 25)[0].amount, 2000);
});

test('archief/testklussen verdwijnen, afgewezen offerte wordt niet als te factureren voorgesteld', () => {
  assert.equal(buildInvoiceStartRows([quote({ archived: true }), quote({ isCalculationTest: true })], []).length, 0);
  assert.equal(buildInvoiceStartRows([quote({ status: 'afgewezen' })], [])[0].ready, false);
});

test('meerdere concepten en teveel gefactureerd vragen controle', () => {
  assert.equal(buildInvoiceStartRows([quote()], [invoice({ status: 'concept' }), invoice({ id: 'i2', status: 'concept' })])[0].action, 'Facturen controleren');
  assert.equal(buildInvoiceStartRows([quote({ amount: 3000 })], [invoice()])[0].action, 'Facturen controleren');
});

test('gecombineerde eindfactuur wordt ook gevonden voor tweede offerte', () => {
  const [row] = buildInvoiceStartRows([quote({ id: 'q2' })], [invoice({ invoiceType: 'eind', combinedQuoteIds: ['q1', 'q2'] })]);
  assert.equal(row.href, '/facturen/i1');
  assert.equal(row.ready, false);
});

test('start-API weigert ontbreken van login voordat data wordt geladen', async () => {
  let databaseRead = false;
  const route = load('src/app/api/facturen/start/route.ts', {
    'next/server': { NextResponse: { json: (data, options) => ({ data, ...options }) } },
    '@/firebase/admin': { initFirebaseAdmin: () => { databaseRead = true; throw new Error('niet toegestaan'); } },
    '@/lib/bank-api-auth': { resolveUid: async () => { throw new Error('Unauthorized'); }, noStoreHeaders: () => ({ 'Cache-Control': 'no-store' }) },
    '@/lib/invoice-start': { buildInvoiceStartRows },
  });
  assert.equal((await route.GET({})).status, 401);
  assert.equal(databaseRead, false);
});

test('aparte meerwerkfactuur sluit facturatie van de oorspronkelijke klus niet af', () => {
  const [row] = buildInvoiceStartRows([quote()], [invoice({ invoiceType: 'eind', combinedContext: { type: 'meerwerkbon_combined', meerwerkbonId: 'm1', quoteIds: ['q1'] } })]);
  assert.equal(row.ready, true);
  assert.match(row.href, /^\/facturen\/nieuw\?/);
});

test('afgeronde klussen met meerdere eindfacturen worden niet opnieuw als te factureren getoond', () => {
  const [row] = buildInvoiceStartRows([quote()], [invoice({ invoiceType: 'eind' }), invoice({ id: 'i2', invoiceType: 'eind', status: 'betaald' })]);
  assert.equal(row.ready, false);
  assert.equal(row.href, '/facturen?quoteId=q1');
});
