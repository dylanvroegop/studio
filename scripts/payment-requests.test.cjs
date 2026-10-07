const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function load(file, deps) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (name in deps) return deps[name];
    throw new Error(`Unexpected dependency ${name}`);
  }, module, module.exports);
  return module.exports;
}
const domain = load('src/lib/payment-request.ts', { zod: require('zod') });
const params = { params: { id: 'quote' } };
function fixture() {
  process.env.MOLLIE_OWNER_UID = 'owner';
  const docs = new Map(), links = new Map(), keys = new Map();
  let total = 10001, uid = 'owner', owner = 'owner', failSave = false, failCreate = false, failArchive = false;
  const calls = [];
  const collection = {
    where: () => ({ get: async () => ({ docs: [...docs.values()].filter(v => v.mode === 'test').map(v => ({ data: () => v })) }) }),
    doc(id) { return { id, get: async () => ({ exists: docs.has(id), data: () => structuredClone(docs.get(id)) }),
      set: async (data, options) => {
        if (failSave && data.url) { failSave = false; throw new Error('Database unavailable'); }
        docs.set(id, structuredClone(options?.merge ? { ...docs.get(id), ...data } : data));
      },
      update: async data => docs.set(id, { ...docs.get(id), ...data }),
    }; },
  };
  const firestore = {
    collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ userId: owner, totaalbedrag: total / 100, offerteNummer: 260449 }) }), collection: () => collection }) }),
    runTransaction: async callback => callback({ get: ref => ref.get(), create: (ref, data) => docs.set(ref.id, structuredClone(data)), set: (ref, data) => docs.set(ref.id, structuredClone(data)), delete: ref => docs.delete(ref.id), update: (ref, data) => ref.update(data) }),
  };
  const mollie = {
    mollieMode: () => 'test',
    mollieRequest: async (url, body, key, method) => {
      calls.push({ url, body, key, method });
      if (url === '/payment-links' && body) {
        if (failCreate) { failCreate = false; throw new Error('Network failure'); }
        if (keys.has(key)) return structuredClone(links.get(keys.get(key)));
        const id = `pl_${links.size + 1}`;
        const link = { id, mode: 'test', amount: body.amount, paidAt: null, archived: false, status: null, _links: { paymentLink: { href: `https://paymentlink.mollie.com/${id}` } } };
        keys.set(key, id); links.set(id, link); return structuredClone(link);
      }
      const id = url.split('/')[2];
      const link = links.get(id); assert.ok(link, `unknown link ${id}`);
      if (method === 'PATCH') {
        if (failArchive) { failArchive = false; throw new Error('Archive failure'); }
        link.archived = body.archived;
      }
      if (url.includes('/payments?')) return { _embedded: { payments: link.status ? [{ id: 'tr_1', status: link.status, paidAt: link.paidAt }] : [] } };
      return structuredClone(link);
    },
  };
  const sync = load('src/lib/sync-payment-installments.ts', { 'server-only': {}, crypto: require('crypto'), '@/lib/mollie-client': mollie, '@/lib/payment-request': domain });
  const route = load('src/app/api/offertes/[id]/betaalverzoeken/route.ts', {
    crypto: require('crypto'), 'next/server': require('next/server'),
    '@/firebase/admin': { initFirebaseAdmin: () => ({ firestore }) },
    '@/lib/admin-auth': { getDecodedRequestAuth: async () => uid ? { uid } : null },
    '@/lib/payment-request': domain, '@/lib/mollie-client': mollie,
    '@/lib/payment-request-total': { currentPaymentTotalCents: async () => total },
    '@/lib/sync-payment-installments': sync,
    '@/lib/quote-number': load('src/lib/quote-number.ts', {}),
  });
  const send = body => route.POST(new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(body) }), params);
  const installment = (kind, expectedTotalCents = total) => send({ kind, expectedTotalCents });
  const custom = (overrides = {}) => send({ requestId: 'e9031a45-7cb6-4ba1-8a21-b62b43418b24', amountCents: 12345, description: 'Test', ...overrides });
  return { docs, links, calls, custom, installment, route, setTotal: v => total = v, setUid: v => uid = v, setOwner: v => owner = v,
    failSave: () => failSave = true, failCreate: () => failCreate = true, failArchive: () => failArchive = true,
    creates: () => calls.filter(c => c.url === '/payment-links'),
    paid(kind) { const link = links.get(docs.get(`test_${kind}`).mollieId); link.paidAt = '2026-09-18T12:00:00Z'; link.status = 'paid'; },
  };
}
async function ok(response) { const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data; }

test('Nederlandse bedragen en oneven centen', () => {
  assert.equal(domain.parsePaymentAmount('123,45'), 12345);
  assert.equal(domain.parsePaymentAmount('0.01'), 1);
  for (const input of ['', '0', '-1', '1.234,56', '1,234', '1e3', 'Infinity']) assert.equal(domain.parsePaymentAmount(input), null);
  assert.deepEqual(domain.splitPaymentTotal(123), { upfront: 62, final: 61 });
  for (const total of [2, 3, 999, 10000, 10001, 9876543]) {
    const split = domain.splitPaymentTotal(total); assert.equal(split.upfront + split.final, total);
  }
});
test('historische afspraak overschrijft de actuele totaalprijs niet; nul blijft nul', () => {
  assert.equal(domain.quotePaymentTotalCents({ financieel: { afgesprokenPrijsInclBtw: 1.10 }, totaalbedrag: 1.23 }), 123);
  assert.equal(domain.quotePaymentTotalCents({ totaalbedrag: 0, amount: 150 }), 0);
});
test('authenticatie, Mollie-eigenaar en offerte-eigenaar verplicht', async () => {
  const f = fixture(); f.setUid(null); assert.equal((await f.custom()).status, 401);
  f.setUid('other'); assert.equal((await f.custom()).status, 403);
  f.setUid('owner'); f.setOwner('other'); assert.equal((await f.custom()).status, 403);
  assert.equal(f.calls.length, 0);
});
test('ongeldige bedragen en verouderde offerte worden afgewezen voor Mollie', async () => {
  const f = fixture();
  for (const amountCents of [0, -1, 12.5, '100', 100000001]) assert.equal((await f.custom({ amountCents })).status, 400);
  assert.equal((await f.installment('upfront', 10000)).status, 409);
  f.setTotal(0); assert.equal((await f.installment('upfront')).status, 400);
  assert.equal(f.calls.length, 0);
});
test('handmatige link eenmalig, idempotent, uitsluitend EUR iDEAL', async () => {
  const f = fixture(); await ok(await f.custom()); await ok(await f.custom());
  assert.equal(f.creates().length, 1);
  assert.deepEqual(f.creates()[0].body, { amount: { currency: 'EUR', value: '123.45' }, description: 'Test', reusable: false, allowedMethods: ['ideal'] });
  assert.equal((await f.custom({ amountCents: 1 })).status, 409);
});
test('herstel na databasefout maakt geen dubbele handmatige link', async () => {
  const f = fixture(); f.failSave(); assert.equal((await f.custom()).status, 502); await ok(await f.custom());
  assert.equal(f.creates()[0].key, f.creates()[1].key); assert.equal(f.links.size, 1);
});
test('termijnen delen hetzelfde actuele totaal en dubbele klik hergebruikt de link', async () => {
  const f = fixture(); const a = await ok(await f.installment('upfront'));
  await ok(await f.installment('upfront'));
  assert.equal(f.creates().length, 1); assert.equal(a.item.amountCents, 5001);
  const b = await ok(await f.installment('final'));
  assert.equal(b.item.amountCents, 5000); assert.equal(a.item.amountCents + b.item.amountCents, 10001);
});
test('regressie 1,10 -> 1,23: oude link dicht, nieuwe link echt 0,62, restant 0,61', async () => {
  const f = fixture(); f.setTotal(110); await ok(await f.installment('upfront'));
  f.setTotal(123); const data = await ok(await f.installment('sync'));
  assert.equal(data.totalCents, 123); assert.equal(data.items[0].amountCents, 62);
  assert.equal(f.links.get('pl_1').archived, true); assert.equal(f.links.get('pl_2').amount.value, '0.62');
  const final = await ok(await f.installment('final')); assert.equal(final.item.amountCents, 61);
  assert.equal(f.docs.get('test_upfront').retired[0].amountCents, 55);
  await ok(await f.installment('sync')); assert.equal(f.links.size, 3);
  const get = await ok(await f.route.GET(new Request('http://localhost/api'), params)); assert.equal(get.totalCents, 123);
});
test('ook prijsverlaging en daarna terug naar oude prijs vernieuwen beide onbetaalde links', async () => {
  const f = fixture(); await ok(await f.installment('final')); await ok(await f.installment('upfront'));
  f.setTotal(200); const low = await ok(await f.installment('sync')); assert.equal(low.items.reduce((sum, i) => sum + i.amountCents, 0), 200);
  f.setTotal(10001); await ok(await f.installment('sync'));
  assert.equal(f.links.size, 6); assert.equal(f.docs.get('test_upfront').revision, 2);
  assert.equal([...f.links.values()].filter(i => !i.archived).length, 2);
});
test('betaalde 0,55 blijft behouden bij totaal 1,23; achteraf wordt 0,68', async () => {
  const f = fixture(); f.setTotal(110); await ok(await f.installment('upfront')); await ok(await f.installment('final')); f.paid('upfront');
  f.setTotal(123); const data = await ok(await f.installment('sync'));
  assert.equal(f.links.get('pl_1').archived, false); assert.equal(f.docs.get('test_upfront').amountCents, 55);
  assert.equal(f.docs.get('test_final').amountCents, 68); assert.match(f.docs.get('test_final').description, /Restant/);
  assert.equal(data.items.reduce((sum, i) => sum + i.amountCents, 0), 123);
});
test('eerst betaalde achteraf-termijn wordt ook van het restant afgetrokken', async () => {
  const f = fixture(); await ok(await f.installment('final')); f.paid('final'); f.setTotal(20000);
  assert.equal((await ok(await f.installment('upfront'))).item.amountCents, 15000);
});
test('totaal lager dan reeds betaald: oude restantlink wordt gesloten, geen negatieve betaling', async () => {
  const f = fixture(); await ok(await f.installment('upfront')); await ok(await f.installment('final')); f.paid('upfront');
  f.setTotal(1000); const data = await ok(await f.installment('sync'));
  assert.equal(data.items.length, 1); assert.equal(f.links.get('pl_2').archived, true);
  assert.equal(f.docs.get('test_final').amountCents, 0); assert.equal(f.links.size, 2);
});
test('actieve betaling op oude link blokkeert vervangen tot de betaling definitief is', async () => {
  const f = fixture(); f.setTotal(110); await ok(await f.installment('upfront'));
  f.links.get('pl_1').status = 'pending'; f.setTotal(123);
  assert.equal((await f.installment('sync')).status, 409); assert.equal(f.links.size, 1);
  const get = await ok(await f.route.GET(new Request('http://localhost/api'), params)); assert.equal(get.items.length, 0);
  f.links.get('pl_1').status = 'canceled'; await ok(await f.installment('sync')); assert.equal(f.links.size, 2);
});
test('mislukt archiveren deelt geen verouderde link en maakt geen nieuwe; retry herstelt', async () => {
  const f = fixture(); await ok(await f.installment('upfront')); f.setTotal(20000); f.failArchive();
  assert.equal((await f.installment('sync')).status, 502); assert.equal(f.links.size, 1);
  assert.equal(f.docs.get('test_upfront').updating, true);
  await ok(await f.installment('sync')); assert.equal(f.links.size, 2);
});
test('vervangende link na mislukte opslag gebruikt dezelfde revisie/key; tussentijdse prijswijziging blijft veilig', async () => {
  const f = fixture(); f.failSave(); assert.equal((await f.installment('upfront')).status, 502);
  assert.equal(f.links.size, 1); f.setTotal(20000); await ok(await f.installment('sync'));
  assert.equal(f.creates()[0].key, f.creates()[1].key);
  assert.equal(f.links.size, 2); assert.equal(f.links.get('pl_1').archived, true);
  assert.equal(f.links.get('pl_2').amount.value, '100.00');
});
test('providerfout na reserveren nieuwe revisie kan veilig opnieuw', async () => {
  const f = fixture(); await ok(await f.installment('upfront')); f.setTotal(20000); f.failCreate();
  assert.equal((await f.installment('sync')).status, 502); await ok(await f.installment('sync'));
  assert.equal(f.creates()[1].key, f.creates()[2].key); assert.equal(f.links.size, 2);
});
test('lock voorkomt twee gelijktijdige schrijvers en doet geen Mollie-mutatie', async () => {
  const f = fixture(); f.docs.set('_sync_test', { token: 'other', until: Date.now() + 60000 });
  assert.equal((await f.installment('upfront')).status, 423); assert.equal(f.calls.length, 0);
});
test('status kan niet door browser worden vervalst', async () => {
  const f = fixture(); await ok(await f.installment('upfront')); f.paid('upfront');
  const data = await ok(await f.route.PATCH(new Request('http://localhost/api', { method: 'PATCH', body: JSON.stringify({ id: 'test_upfront', paidAt: 'forged' }) }), params));
  assert.equal(data.item.paidAt, '2026-09-18T12:00:00Z');
});

test('server herberekent actuele calculatie in plaats van vertraagde of afgesproken Firestore-prijs', async () => {
  const queried = [];
  const raw = { revision: 'latest' }, normalized = { revision: 'normalized' }, settings = { revision: 'settings' };
  const totalSource = load('src/lib/payment-request-total.ts', {
    'server-only': {},
    '@/lib/supabase-admin': { supabaseAdmin: { from: () => {
      const query = { select: () => query, eq: (k, v) => { queried.push([k, v]); return query; }, order: () => query, limit: () => query,
        maybeSingle: async () => ({ data: { data_json: raw, status: 'completed' }, error: null }) };
      return query;
    } } },
    '@/lib/quote-calculations': {
      normalizeDataJson: value => { assert.equal(value, raw); return normalized; },
      calculateQuoteTotals: (data, config, hours) => { assert.equal(data, normalized); assert.equal(config, settings); assert.equal(hours, 10); return { totaalInclBtw: 1.23 }; },
    },
    '@/lib/quote-pdf-data': { resolveQuoteCalculationSettings: data => { assert.equal(data, normalized); return settings; } },
    '@/lib/payment-request': domain,
  });
  const firestore = { collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ settings: { planningSettings: { defaultWorkdayHours: 10 } } }) }) }) }) };
  assert.equal(await totalSource.currentPaymentTotalCents('quote', { userId: 'owner', totaalbedrag: 1.10, financieel: { afgesprokenPrijsInclBtw: 1 } }, firestore), 123);
  assert.deepEqual(queried, [['gebruikerid', 'owner'], ['quoteid', 'quote']]);
});

test('betaling die tijdens archiveren voltooit wordt behouden en van restant afgetrokken', async () => {
  const f = fixture(); f.setTotal(110); await ok(await f.installment('upfront'));
  // De linkstatus kan nog achterlopen op de bijbehorende betaling.
  f.links.get('pl_1').status = 'paid'; f.setTotal(123);
  const data = await ok(await f.installment('sync'));
  assert.equal(f.links.size, 1); assert.ok(data.items[0].paidAt);
  assert.equal(data.items[0].amountCents, 55);
  assert.equal((await ok(await f.installment('final'))).item.amountCents, 68);
});

test('prijswijziging naar nul sluit oude links zonder nulbetalingen aan te maken', async () => {
  const f = fixture(); await ok(await f.installment('upfront')); f.setTotal(0);
  const data = await ok(await f.installment('sync'));
  assert.equal(data.totalCents, 0); assert.equal(data.items.length, 0);
  assert.equal(f.links.size, 1); assert.equal(f.links.get('pl_1').archived, true);
});
