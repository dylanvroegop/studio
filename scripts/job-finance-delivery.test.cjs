const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const { createJobFinanceWorkflow, reportMessages } = require('./job-finance-workflow.cjs');

function load(file, deps, env = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'process', code)(name => { assert.ok(name in deps, name); return deps[name]; }, module, module.exports, { env });
  return module.exports;
}
const delivery = load('src/lib/job-finance-delivery.ts', { crypto: require('node:crypto') });
function database() {
  const data = new Map([
    ['users/owner/jobFinanceReports/invoice', { messages: ['deel 1', 'deel 2'] }],
    ['invoices/invoice', { userId: 'owner', status: 'verzonden' }],
  ]);
  const ref = path => ({ path, doc: id => ref(`${path}/${id}`), collection: id => ref(`${path}/${id}`) });
  let queue = Promise.resolve();
  const db = { collection: name => ref(name), runTransaction: callback => {
    const run = queue.then(() => callback({
      get: async r => ({ exists: data.has(r.path), data: () => data.get(r.path) }),
      create: (r, value) => { assert.ok(!data.has(r.path)); data.set(r.path, value); },
      update: (r, value) => { data.set(r.path, { ...data.get(r.path), ...value }); },
    }));
    queue = run.catch(() => {}); return run;
  } };
  return { db, data };
}
test('concurrent/repeated claims yield exactly one sending reservation', async () => {
  const { db } = database();
  const results = await Promise.all([delivery.claimJobReportPart(db, 'owner', 'invoice', 0), delivery.claimJobReportPart(db, 'owner', 'invoice', 0)]);
  assert.equal(results.filter(row => row.claimed).length, 1);
  assert.equal(results.find(row => row.claimed).text, 'deel 1');
  assert.equal((await delivery.claimJobReportPart(db, 'owner', 'invoice', 0)).state, 'sending');
});
test('ack requires matching reservation; repeated ack is safe; other parts independent', async () => {
  const { db, data } = database();
  const claim = await delivery.claimJobReportPart(db, 'owner', 'invoice', 0);
  await assert.rejects(delivery.acknowledgeJobReportPart(db, 'owner', 'invoice', 0, 'wrong', 1));
  await delivery.acknowledgeJobReportPart(db, 'owner', 'invoice', 0, claim.token, 123);
  await delivery.acknowledgeJobReportPart(db, 'owner', 'invoice', 0, claim.token, 123);
  assert.equal(data.get('users/owner/jobFinanceReports/invoice/deliveries/0').state, 'sent');
  assert.equal((await delivery.claimJobReportPart(db, 'owner', 'invoice', 0)).claimed, false);
  assert.equal((await delivery.claimJobReportPart(db, 'owner', 'invoice', 1)).claimed, true);
});
test('cancelled or foreign invoice cannot be dispatched', async () => {
  for (const patch of [{ status: 'geannuleerd' }, { userId: 'other' }]) {
    const { db, data } = database();
    data.set('invoices/invoice', { ...data.get('invoices/invoice'), ...patch });
    assert.equal((await delivery.claimJobReportPart(db, 'owner', 'invoice', 0)).claimed, false);
  }
});
test('route rejects wrong secret and fixed owner cannot be overridden', async () => {
  const calls = [];
  const route = load('src/app/api/finance/job-report/route.ts', {
    crypto: require('node:crypto'), 'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/firebase/admin': { initFirebaseAdmin: () => { throw new Error('No write expected'); } },
    '@/lib/job-finance-report-server': { loadJobFinanceReports: async uid => { calls.push(uid); return []; } },
    '@/lib/job-finance-delivery': {},
  }, { N8N_HEADER_SECRET: 'secret', CALVORA_USER_ID: 'owner' });
  for (const method of ['GET', 'POST']) {
    const response = await route[method](new Request('http://local/report', { method }));
    assert.equal(response.status, 401);
  }
  const response = await route.GET(new Request('http://local/report', { headers: { 'x-offertehulp-secret': 'secret', 'x-offertehulp-user-id': 'other' } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(calls, ['owner']);
});
test('workflow sends parts sequentially, acknowledges after send, no retry on ambiguous claim/send', () => {
  const workflow = createJobFinanceWorkflow({ nodes: [{ type: 'n8n-nodes-base.httpRequest', parameters: {} }] });
  assert.equal(workflow.active, false);
  assert.equal(workflow.settings.timezone, 'Europe/Amsterdam');
  assert.equal(workflow.nodes[0].parameters.rule.interval[0].triggerAtHour, 8);
  assert.equal(workflow.nodes.find(node => node.name === 'Reserveer rapportdeel').retryOnFail, false);
  assert.equal(workflow.nodes.find(node => node.name === 'Stuur klusrapport').retryOnFail, false);
  assert.equal(workflow.connections['Eén rapportdeel tegelijk'].main[1][0].node, 'Reserveer rapportdeel');
  assert.equal(workflow.connections['Bevestig verzending'].main[0][0].node, 'Eén rapportdeel tegelijk');
  assert.deepEqual(reportMessages({ ok: true, version: 1, messages: [], uncertain: [] }), []);
  assert.throws(() => reportMessages({ ok: true, version: 1, messages: [], uncertain: [{}] }));
});
