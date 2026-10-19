const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');

function route(owner = 'owner') {
    let historyReads = 0;
    const stored = { savedAt: '2026-10-19T18:00:00.000Z', materialsJson: JSON.stringify({ grootmaterialen: [{ product: 'Gips', aantal: 25, prijs_per_stuk: 5.27 }], verbruiksartikelen: [{ product: 'Kleinmateriaal', aantal: 1, prijs_per_stuk: 125 }] }) };
    const firestore = { collection: () => ({ doc: () => ({
        get: async () => ({ exists: true, data: () => ({ userId: owner }) }),
        collection: () => ({ orderBy: () => ({ get: async () => {
            historyReads++;
            return { docs: [{ id: 'snapshot', data: () => stored }] };
        } }) }),
    }) }) };
    const requireMock = name => {
        if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
        if (name === '@/firebase/admin') return { initFirebaseAdmin: () => ({ firestore, auth: { verifyIdToken: async token => { if (token !== 'valid') throw Error(); return { uid: 'owner' }; } } }) };
        throw Error(name);
    };
    const mod = { exports: {} };
    new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('src/app/api/quotes/material-history/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(requireMock, mod, mod.exports);
    return { post: mod.exports.POST, reads: () => historyReads };
}
const request = (token = 'valid', quoteId = 'quote') => new Request('http://localhost/api/quotes/material-history', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify({ quoteId }) });
test('historie geeft bewaarde groot- en kleinmaterialen terug', async () => {
    const api = route();
    const result = await api.post(request());
    assert.equal(result.status, 200);
    assert.equal(result.body.rows[0].data.grootmaterialen[0].aantal, 25);
    assert.equal(result.body.rows[0].data.verbruiksartikelen[0].prijs_per_stuk, 125);
});
test('andere gebruiker kan historie niet lezen', async () => {
    const api = route('someone-else');
    assert.equal((await api.post(request())).status, 404);
    assert.equal(api.reads(), 0);
});
test('ongeldige authenticatie en offertepad worden afgewezen', async () => {
    const api = route();
    assert.equal((await api.post(request(''))).status, 401);
    assert.equal((await api.post(request('invalid'))).status, 401);
    assert.equal((await api.post(request('valid', 'quote/nested'))).status, 400);
    assert.equal(api.reads(), 0);
});

function deleteRoute(owner = 'owner') {
    const writes = [];
    const historyRef = { kind: 'history' };
    const quoteRef = { kind: 'quote', collection: () => ({ doc: () => historyRef }) };
    const mocks = {
        'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
        '@/firebase/admin': { initFirebaseAdmin: () => ({
            auth: { verifyIdToken: async () => ({ uid: 'owner' }) },
            firestore: {
                collection: () => ({ doc: () => quoteRef }),
                runTransaction: callback => callback({
                    get: async ref => ({ exists: true, data: () => ref === quoteRef ? { userId: owner } : { materialsJson: '{}' } }),
                    update: (ref, value) => writes.push({ ref, value }),
                }),
            },
        }) },
    };
    const mod = { exports: {} };
    new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('src/app/api/quotes/material-history/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(name => mocks[name], mod, mod.exports);
    return { remove: mod.exports.DELETE, writes, historyRef };
}
const deleteRequest = (historyId = 'snapshot') => new Request('http://localhost/api/quotes/material-history', { method: 'DELETE', headers: { Authorization: 'Bearer valid' }, body: JSON.stringify({ quoteId: 'quote', historyId }) });
test('verwijderen raakt alleen de historische stand', async () => {
    const api = deleteRoute();
    assert.equal((await api.remove(deleteRequest())).status, 200);
    assert.equal(api.writes.length, 1);
    assert.equal(api.writes[0].ref, api.historyRef);
    assert.deepEqual(Object.keys(api.writes[0].value), ['deletedAt']);
});
test('andere eigenaar en ongeldig historiepad mogen geen stand verwijderen', async () => {
    const api = deleteRoute('other');
    assert.equal((await api.remove(deleteRequest())).status, 404);
    assert.equal((await api.remove(deleteRequest('nested/path'))).status, 400);
    assert.equal(api.writes.length, 0);
});
