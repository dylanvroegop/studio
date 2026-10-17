const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, dependencies, env = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'process', code)(name => {
    assert.ok(name in dependencies, name); return dependencies[name];
  }, module, module.exports, { env });
  return module.exports;
}
function harness() {
  const deliveries = new Map();
  const state = { enabled: true, userId: 'owner', pending: false, fallback: false, filters: [], failure: false };
  const snapshot = (id, data) => ({ id, exists: !!data, data: () => data });
  const quote = () => snapshot('q1', { userId: state.userId, status: 'geaccepteerd' });
  const chain = (parts) => ({
    collection: name => chain([...parts, name]), doc: name => chain([...parts, name]),
    where: () => chain(parts), key: parts.join('/'),
    get: async () => parts[0] === 'quotes' ? (parts.length > 1 ? quote() : { docs: [quote()] })
      : { docs: [] },
  });
  let serial = Promise.resolve();
  const firestore = { collection: name => chain([name]), runTransaction: fn => {
    const result = serial.then(() => fn({ get: async ref => snapshot(ref.key, deliveries.get(ref.key)),
      create: (ref, data) => { assert.equal(deliveries.has(ref.key), false); deliveries.set(ref.key, data); },
      update: (ref, data) => deliveries.set(ref.key, { ...deliveries.get(ref.key), ...data }),
    })); serial = result.catch(() => {}); return result;
  } };
  const supabase = { from: () => {
    const filters = [];
    const q = { select: () => q, order: () => q, limit: () => q,
      eq: (key, value) => { filters.push([key, value]); state.filters.push([key, value]); return q; },
      maybeSingle: async () => {
        if (state.failure) return { error: new Error('offline') };
        if (state.pending && !filters.some(([k]) => k === 'status')) return { data: { status: 'pending', data_json: null } };
        if (state.pending) state.fallback = true;
        return { data: { status: 'completed', data_json: [{ werkbeschrijving_structured: { steigerInbegrepen: state.enabled } }] } };
      },
    }; return q;
  } };
  const server = load('src/lib/scaffold-reminder-server.ts', {
    crypto: require('node:crypto'), '@/firebase/admin': { initFirebaseAdmin: () => ({ firestore }) },
    '@/lib/supabase-admin': { supabaseAdmin: supabase },
    '@/lib/quote-calculations': { toStructuredWorkDescription: root => root.werkbeschrijving_structured },
    '@/lib/scaffold-reminder': { scaffoldReminders: quotes => quotes.map(q => ({ quoteId: q.id, startDay: '2026-10-25', dueDay: '2026-10-11', text: 'Test' })) },
  });
  return { server, state, deliveries };
}
test('opgeslagen schakelaar, eigenaar en calculatiefallback worden gecontroleerd', async () => {
  const { server, state } = harness();
  assert.equal((await server.loadScaffoldReminders('owner')).length, 1);
  assert.ok(state.filters.some(([k,v]) => k === 'gebruikerid' && v === 'owner'));
  state.enabled = false;
  assert.equal((await server.loadScaffoldReminders('owner')).length, 0);
  state.enabled = true; state.pending = true;
  assert.equal((await server.loadScaffoldReminders('owner')).length, 1);
  assert.equal(state.fallback, true);
  state.userId = 'other';
  assert.equal((await server.loadScaffoldReminders('owner', 'q1')).length, 0);
});
test('dubbele en gelijktijdige uitvoeringen reserveren hoogstens één keer', async () => {
  const { server, deliveries } = harness();
  const claims = await Promise.all(Array.from({length: 5}, () => server.claimScaffoldReminder('owner', 'q1', '2026-10-25')));
  assert.equal(claims.filter(x => x.claimed).length, 1);
  assert.equal(deliveries.size, 1);
  const claim = claims.find(x => x.claimed);
  await assert.rejects(server.acknowledgeScaffoldReminder('owner','q1','2026-10-25','wrong',12));
  await server.acknowledgeScaffoldReminder('owner','q1','2026-10-25',claim.token,12);
  await server.acknowledgeScaffoldReminder('owner','q1','2026-10-25',claim.token,12);
  assert.equal([...deliveries.values()][0].state, 'sent');
  assert.equal((await server.claimScaffoldReminder('owner','q1','2026-10-25')).claimed, false);
});
test('uitzetten of verplaatsen na ophalen blokkeert de claim; bronfouten sturen niets', async () => {
  const { server, state, deliveries } = harness();
  state.enabled = false;
  assert.equal((await server.claimScaffoldReminder('owner','q1','2026-10-25')).claimed, false);
  state.enabled = true;
  assert.equal((await server.claimScaffoldReminder('owner','q1','2026-10-24')).claimed, false);
  state.failure = true;
  await assert.rejects(server.claimScaffoldReminder('owner','q1','2026-10-25'));
  assert.equal(deliveries.size, 0);
});
test('API weigert ongeldige autorisatie, eigenaaroverride en ongeldige input', async () => {
  let calls = 0;
  const route = load('src/app/api/offertes/scaffold-reminder/route.ts', {
    crypto: require('node:crypto'), 'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/firebase/admin': { initFirebaseAdmin: () => { throw new Error('Niet verwacht'); } },
    '@/lib/scaffold-reminder-server': { claimScaffoldReminder: async (uid) => { calls++; assert.equal(uid,'owner'); return { claimed:false }; } },
  }, { N8N_HEADER_SECRET: 'secret', CALVORA_USER_ID: 'owner' });
  const req = (body, secret = 'secret') => new Request('https://test/api', { method: 'POST', headers: { 'x-offertehulp-secret': secret, 'x-offertehulp-user-id':'other' }, body: JSON.stringify(body) });
  const valid = { action:'claim', quoteId:'q1', startDay:'2026-10-25' };
  assert.equal((await route.POST(req(valid,'wrong'))).status,401);
  assert.equal((await route.GET(new Request('https://test/api'))).status,401);
  assert.equal((await route.POST(req({...valid,quoteId:'../x'}))).status,400);
  assert.equal((await route.POST(req({...valid,action:'sent', token:'test',messageId:0}))).status,400);
  assert.equal(calls,0);
  assert.equal((await route.POST(req(valid))).status,200);
  assert.equal(calls,1);
});
