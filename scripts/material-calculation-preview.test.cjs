const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
function load(path, imports = {}) {
    const mod = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    new Function('require', 'module', 'exports', code)(name => {
        if (name in imports) return imports[name];
        throw new Error(`Unexpected import ${name}`);
    }, mod, mod.exports);
    return mod.exports;
}
const { linkedMaterialPurchases, finitePreviewNumber } = load('src/lib/material-calculation-preview.ts');
const line = (overrides = {}) => ({ description: 'Plaat', quantity: 3, unit: 'stuk', total_price: 30, ...overrides });
const cost = (overrides = {}) => ({ id: 'c', offerte_id: 'q', category: 'materiaal', supplier_name: 'Leverancier', supplier_invoice_number: 'F1', date: '2026-10-27', amount_excl_btw: 80, line_items: [line()], ...overrides });
test('regels van andere offertes en categorieen worden uitgesloten', () => {
    const rows = linkedMaterialPurchases([cost({ line_items: [line(), line({ offerte_id: 'other' }), line({ category: 'gereedschap' })] }), cost({ id: 'other', offerte_id: 'other' })], 'q');
    assert.equal(rows.length, 1); assert.equal(rows[0].amount, 30);
});
test('expliciete regelkoppeling gaat voor factuur en retouren blijven negatief', () => {
    const rows = linkedMaterialPurchases([cost({ offerte_id: 'other', line_items: [line({ offerte_id: 'q', quantity: -1, total_price: -10 })] })], 'q');
    assert.equal(rows[0].quantity, -1); assert.equal(rows[0].amount, -10);
});
test('ontbrekende aantallen en onbekende btw worden niet nul', () => {
    assert.equal(finitePreviewNumber(null), null); assert.equal(finitePreviewNumber(''), null);
    assert.equal(finitePreviewNumber(0), 0);
    const [row] = linkedMaterialPurchases([cost({ line_items: [], vat_known: false })], 'q');
    assert.equal(row.quantity, null); assert.equal(row.amount, null);
});
test('lege geimporteerde factuurregels blokkeren de vergelijking niet', () => {
    const rows = linkedMaterialPurchases([cost({ line_items: [null, line(), null] })], 'q');
    assert.equal(rows.length, 1); assert.equal(rows[0].amount, 30);
});
function setup({ owner = 'u', failure = false } = {}) {
    const calls = [];
    const forbidden = () => { calls.push('write'); throw new Error('Write forbidden'); };
    const quote = { userId: owner, klussen: [{ maatwerk: { basis: [] }, materialen: { materialen_lijst: { a: { material: { materiaalnaam: 'Plaat', prijs_per_stuk: 10 } } } } }] };
    const db = { collection: name => ({ doc: () => ({ get: async () => ({ exists: name === 'quotes', data: () => quote }), update: forbidden, set: forbidden, collection: () => ({ get: async () => ({ docs: [] }), add: forbidden }) }) }) };
    const firestore = Object.assign(() => db, { Timestamp: { now: () => ({ toMillis: () => 1 }) }, FieldValue: { serverTimestamp: forbidden } });
    const admin = { apps: [{}], app: () => ({}), firestore, auth: () => ({ verifyIdToken: async () => ({ uid: 'u' }) }) };
    const route = load('src/app/api/offerte/generate/route.ts', {
        'next/server': { NextResponse: { json: (data, init) => ({ data, status: init?.status || 200 }) } },
        'firebase-admin': admin,
        '@/lib/utils': { removeEmptyFields: x => x, parsePriceToNumber: Number },
        '@/lib/quote-calculations': {}, '@/lib/job-registry': { JOB_REGISTRY: {} },
        '@/lib/klus-regels-static': { getMaterialRule: () => null }, '@/lib/manual-quote-data': {},
        '@/lib/supabase-admin': { supabaseAdmin: { from: forbidden } },
        '@/lib/simple-material-calculation': { prepareSimpleCalculation: x => x },
        '@/lib/demo-trial-server': { ensureDemoTrialActiveByUid: async () => null },
        '@/lib/calculation-quota': { reserveCalculationQuotaJobs: forbidden, commitCalculationQuotaReservation: forbidden, releaseCalculationQuotaReservation: forbidden },
        '@/lib/material-calculation-preview-server': { runMaterialCalculationPreview: async () => { calls.push('preview'); if (failure) throw new Error('Model failed'); return { materials: [] }; } },
    });
    return { route, calls };
}
for (const failure of [false, true]) test(`preview ${failure ? 'failure' : 'success'} writes no status, history, quota or calculation`, async () => {
    const { route, calls } = setup({ failure });
    const result = await route.POST(new Request('http://localhost/api/offerte/generate', { method: 'POST', headers: { authorization: 'Bearer test' }, body: JSON.stringify({ quoteId: 'q', previewOnly: true }) }));
    assert.equal(result.status, failure ? 500 : 200); assert.deepEqual(calls, ['preview']);
});
test('andermans offerte wordt niet berekend', async () => {
    const { route, calls } = setup({ owner: 'other' });
    const result = await route.POST(new Request('http://localhost', { method: 'POST', headers: { authorization: 'Bearer test' }, body: JSON.stringify({ quoteId: 'q', previewOnly: true }) }));
    assert.equal(result.status, 403); assert.deepEqual(calls, []);
});
