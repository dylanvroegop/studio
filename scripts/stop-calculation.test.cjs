const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
function setup(overrides = {}) {
    const writes = [];
    const quote = { userId: 'owner', status: 'in_behandeling', calculationStartedAt: { toMillis: () => 100 }, ...overrides };
    const mod = { exports: {} };
    const mocks = {
        'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
        'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => 'server-time' } },
        '@/firebase/admin': { initFirebaseAdmin: () => ({
            auth: { verifyIdToken: async token => { if (token !== 'valid') throw Error(); return { uid: 'owner' }; } },
            firestore: { collection: () => ({ doc: () => 'quote-ref' }), runTransaction: async callback => callback({
                get: async () => ({ exists: true, data: () => quote }),
                update: (ref, data) => writes.push(data),
            }) },
        }) },
    };
    new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('src/app/api/quotes/stop-calculation/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(name => mocks[name], mod, mod.exports);
    return { post: mod.exports.POST, writes };
}
const request = (startedAt = 100, token = 'valid') => new Request('http://localhost/stop', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ quoteId: 'quote', startedAt }) });
test('stopt wachtstatus zonder materialen of historie te wijzigen', async () => {
    const api = setup();
    assert.equal((await api.post(request())).status, 200);
    assert.equal(api.writes[0].status, 'fout');
    assert.deepEqual(Object.keys(api.writes[0]).sort(), ['calculationError', 'status', 'updatedAt']);
});
test('oud tabblad kan nieuwe run of afgeronde offerte niet stoppen', async () => {
    const api = setup();
    assert.equal((await api.post(request(90))).status, 409);
    assert.equal(api.writes.length, 0);
    const completed = setup({ status: 'concept' });
    assert.equal((await completed.post(request())).status, 409);
    assert.equal(completed.writes.length, 0);
});
test('weigert andere eigenaar en ongeldig token', async () => {
    const api = setup({ userId: 'other' });
    assert.equal((await api.post(request())).status, 404);
    assert.equal((await api.post(request(100, 'invalid'))).status, 401);
    assert.equal(api.writes.length, 0);
});
