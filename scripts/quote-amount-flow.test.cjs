const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const checks = require('../src/lib/quote-shared-amount');
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function functionSource(file, name) {
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(ast) === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, `${name} bestaat`);
  return (ts.isVariableDeclaration(found) ? 'const ' : '') + found.getText(ast) + ';';
}

function invoiceFlow(overrides = {}) {
  const state = {
    canCreate: true, creatingRef: { current: false }, user: { uid: 'owner' }, firestore: {}, existingId: null,
    quote: { whatsappQuoteSnapshot: { id: 'pdf', quoteId: 'quote', amountCents: 95700, currency: 'EUR', fileName: 'test.pdf', sharedAt: '2026-11-03T10:00:00Z' } },
    selectedType: 'eind', newAmount: 506.44, billing: { billedAdvanceAmount: 478.50 }, quoteId: 'quote', settings: {},
    total: 984.94, advancePercentage: 50, manualFinalAmount: null, reason: '', quoteSignature: 'signature', invoices: [],
    ...checks, invoiceBillingSignature: () => 'billing',
    setAmountWarning: warning => { state.warning = warning; },
    setCreating: () => {}, setLoadError: () => {}, toast: () => {},
    createInvoiceFromQuote: async (_db, params) => { state.created.push(params); return 'new-invoice'; },
    router: { push: url => { state.url = url; } }, created: [], ...overrides,
  };
  state.handle = new Function('state', `with (state) { ${compile(functionSource('src/app/facturen/nieuw/page.tsx', 'handleCreate'))}; return handleCreate; }`)(state);
  return state;
}

test('eindfactuur toont eerst waarschuwing, ja verstuurt exact akkoord en behoudt delen-keuze', async () => {
  const flow = invoiceFlow();
  await flow.handle(true);
  assert.equal(flow.created.length, 0);
  assert.equal(flow.warning.comparison.differenceCents, 2794);
  assert.equal(flow.warning.share, true);
  const confirmation = flow.warning.comparison;
  await flow.handle(true, confirmation);
  assert.deepEqual(flow.created[0].sharedQuoteAmountConfirmation, confirmation);
  assert.equal(flow.url, '/facturen/new-invoice?share=1');
});

test('aanpassen naar oude totaal behoeft geen akkoord; gewijzigd verschil kan geen oud akkoord gebruiken', async () => {
  const flow = invoiceFlow();
  await flow.handle(false);
  const old = flow.warning.comparison;
  flow.newAmount = 500;
  await flow.handle(false, old);
  assert.equal(flow.created.length, 0);
  assert.equal(flow.warning.comparison.invoiceTotalCents, 97850);
  flow.newAmount = 478.50; flow.manualFinalAmount = '478.50'; flow.reason = 'Volgens gedeelde offerte';
  await flow.handle(false);
  assert.equal(flow.created.length, 1);
  assert.equal(flow.created[0].totalsInclBtw, 478.50);
  assert.equal(flow.url, '/facturen/new-invoice');
});

function shareFlow({ fail, downloadOnly = false } = {}) {
  const files = [checks.bindSharedQuoteAmount(new File(['pdf'], 'test.pdf'), 'one', 957)];
  const state = {
    files, selectedIds: ['one'], blocked: false, busyRef: { current: false }, isDesktop: false,
    compact: false, canShare: true, shareFailed: false, whatsappUrl: '', message: 'test',
    setWorking: () => {}, setShareFailed: () => {}, setStatusFailed: () => {}, setNotice: () => {},
    markSent: async (ids, actualFiles) => { state.marked = checks.sharedAmountsForFiles(actualFiles, ids); },
    navigator: { share: () => fail ? Promise.reject(new DOMException('stop', fail)) : Promise.resolve() },
    prepareQuotePdfDownload: async () => ({ blob: new Blob(['pdf']), fileName: 'test.pdf' }), downloadInvoiceFile: () => {},
    openWhatsApp: () => { throw new Error('unexpected WhatsApp tab'); },
  };
  const declarations = ['updateSentStatus', 'share', 'download'].map(name => functionSource('src/components/quote/QuoteShareActions.tsx', name)).join('\n');
  state.run = new Function('state', `with (state) { ${compile(declarations)}; return ${downloadOnly ? 'download' : 'share'}; }`)(state);
  return state;
}

test('alleen geslaagde deeloverdracht geeft echte PDF mee voor snapshot; annuleren en download-only niet', async () => {
  const shared = shareFlow(); shared.run(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(shared.marked[0].amountCents, 95700);
  for (const options of [{ fail: 'AbortError' }, { fail: 'NotAllowedError' }, { downloadOnly: true }]) {
    const flow = shareFlow(options); await flow.run(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(flow.marked, undefined);
  }
});
