const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

function harness() {
  const rows = new Map();
  const calls = [];
  const controls = { status: 201 };
  function ref(key) {
    return { collection: name => ({ doc: id => ref(key + '/' + name + '/' + id) }), id: key.split('/').at(-1),
      get: async () => snapshot(key),
      set: async (data, opts) => rows.set(key, opts?.merge ? { ...rows.get(key), ...data } : data),
      delete: async () => rows.delete(key),
      key,
    };
  }
  function snapshot(key) { return { collection: name => ({ doc: id => ref(key + '/' + name + '/' + id) }), id: key.split('/').at(-1), exists: rows.has(key), data: () => rows.get(key), ref: ref(key) }; }
  const firestore = {
    collection: name => ({ doc: id => ref(name + '/' + id), where: (field, _, value) => ({ get: async () => ({ docs: [...rows.keys()].filter(key => key.startsWith(name + '/') && rows.get(key)[field] === value).map(snapshot) }) }) }),
    runTransaction: async fn => fn({ get: r => r.get(), set: (r, data) => r.set(data), create: (r, data) => r.set(data), delete: r => r.delete() }),
  };
  const cache = {};
  const fakeWebpush = {
    generateVAPIDKeys: () => ({ publicKey: 'public-key', privateKey: 'private-key' }),
    sendNotification: async (subscription, payload, options) => {
      calls.push({ subscription, payload: JSON.parse(payload), options });
      assert.ok(Buffer.byteLength(payload) < 3993, 'payload past in Web Push');
      if (controls.status !== 201) throw { statusCode: controls.status };
    },
  };
  function load(file) {
    const absolute = path.resolve(file);
    if (cache[absolute]) return cache[absolute].exports;
    const module = { exports: {} }; cache[absolute] = module;
    const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Buffer, process, URL, console, require: name => {
      if (name === '@/firebase/admin') return { initFirebaseAdmin: () => ({ firestore, auth: { verifyIdToken: async token => { if (token !== 'valid') throw Error(); return { uid: 'owner' }; } } }) };
      if (name === 'web-push') return fakeWebpush;
      if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts');
      return require(name);
    } }, { filename: file });
    return module.exports;
  }
  return { load, rows, calls, controls };
}
const subscription = { endpoint: 'https://web.push.apple.com/example', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } };
const message = { title: 'Offerte maken', body: 'Klantbezoek afgerond', url: '/offertes/abc', eventId: 'visit:abc:2026-10-11' };
const request = (body, token = 'valid') => new Request('https://app.calvora.nl/api/push', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('valideert providerhosts en weigert SSRF, gebruikersgegevens en vreemde poorten', () => {
  const { isPushEndpoint, safePushPath, pushSubscriptionSchema } = harness().load('src/lib/push-validation.ts');
  assert.equal(pushSubscriptionSchema.safeParse(subscription).success, true);
  for (const endpoint of ['http://web.push.apple.com/a', 'https://127.0.0.1/a', 'https://web.push.apple.com.evil.test/a', 'https://user@web.push.apple.com/a', 'https://web.push.apple.com:8080/a']) assert.equal(isPushEndpoint(endpoint), false);
  for (const url of ['//evil.test', '/\\evil.test', 'javascript:alert(1)', 'https://evil.test']) assert.equal(safePushPath(url), '/dashboard');
  assert.equal(safePushPath('/offertes/abc?tab=overzicht'), '/offertes/abc?tab=overzicht');
});

test('registratie vereist login, bindt eigenaar aan token, deelt alleen publieke sleutel', async () => {
  const h = harness(); const route = h.load('src/app/api/push/subscription/route.ts');
  assert.equal((await route.POST(request(subscription, 'invalid'))).status, 401);
  assert.equal((await route.POST(request({ ...subscription, userId: 'other' }))).status, 200);
  assert.equal([...h.rows.values()].find(v => v.subscription).userId, 'owner');
  const config = await (await route.GET(request({}))).json();
  assert.equal(config.publicKey, 'public-key'); assert.equal(config.privateKey, undefined);
});

test('ander account kan een apparaat niet verwijderen', async () => {
  const h = harness(); const api = h.load('src/lib/push-server.ts');
  h.rows.set('push_subscriptions/' + api.pushId(subscription.endpoint), { userId: 'other', subscription });
  await h.load('src/app/api/push/subscription/route.ts').DELETE(request({ endpoint: subscription.endpoint }));
  assert.equal(h.rows.size, 1);
});

test('verstuurt alleen eigen apparaten; eventId voorkomt dubbele geaccepteerde verzending', async () => {
  const h = harness(); const api = h.load('src/lib/push-server.ts');
  h.rows.set('push_subscriptions/a', { userId: 'owner', subscription });
  h.rows.set('push_subscriptions/b', { userId: 'other', subscription: { ...subscription, endpoint: 'https://fcm.googleapis.com/other' } });
  assert.equal((await api.sendUserPush('owner', message)).accepted, 1);
  assert.equal((await api.sendUserPush('owner', message)).skipped, 1);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].payload.url, '/offertes/abc');
});

test('tijdelijke fouten blijven herkansbaar en verlopen abonnement wordt verwijderd', async () => {
  const h = harness(); const api = h.load('src/lib/push-server.ts');
  h.rows.set('push_subscriptions/a', { userId: 'owner', subscription });
  h.controls.status = 503;
  assert.equal((await api.sendUserPush('owner', message)).failed, 1);
  assert.equal(h.rows.has('push_subscriptions/a'), true);
  h.controls.status = 410;
  assert.equal((await api.sendUserPush('owner', message)).expired, 1);
  assert.equal(h.rows.has('push_subscriptions/a'), false);
});

test('lopende verzending is geen afleverbewijs; testmelding blijft op aangewezen eigen apparaat', async () => {
  const h = harness(); const api = h.load('src/lib/push-server.ts');
  h.rows.set('push_subscriptions/a', { userId: 'owner', subscription });
  h.rows.set('push_deliveries/' + api.pushId(`owner:${message.eventId}:a`), { state: 'sending', startedAt: Date.now() });
  assert.equal((await api.sendUserPush('owner', message)).failed, 1);
  assert.equal(h.calls.length, 0);
  assert.equal((await api.sendUserPush('owner', { ...message, eventId: 'test' }, 'https://fcm.googleapis.com/another')).devices, 0);
});

test('automatisering weigert bearer en kiest uitsluitend vaste eigenaar uit omgeving', async () => {
  const h = harness(); const route = h.load('src/app/api/push/send/route.ts');
  const savedSecret = process.env.N8N_HEADER_SECRET, savedUid = process.env.CALVORA_USER_ID;
  process.env.N8N_HEADER_SECRET = 'test-secret'; process.env.CALVORA_USER_ID = 'owner';
  try {
    assert.equal((await route.POST(request(message))).status, 401);
    const req = new Request('https://app.calvora.nl/api/push/send', { method: 'POST', headers: { 'x-offertehulp-secret': 'test-secret', 'x-offertehulp-user-id': 'other' }, body: JSON.stringify({ ...message, userId: 'other' }) });
    assert.equal((await route.POST(req)).status, 409); // Geen apparaten is geen succes.
  } finally {
    if (savedSecret === undefined) delete process.env.N8N_HEADER_SECRET; else process.env.N8N_HEADER_SECRET = savedSecret;
    if (savedUid === undefined) delete process.env.CALVORA_USER_ID; else process.env.CALVORA_USER_ID = savedUid;
  }
});

test('unicode-payload blijft binnen limiet en inhoud blijft intact', async () => {
  const h = harness(); const api = h.load('src/lib/push-server.ts');
  h.rows.set('push_subscriptions/a', { userId: 'owner', subscription });
  const body = '漢'.repeat(800);
  await api.sendUserPush('owner', { ...message, title: '漢'.repeat(100), body, url: '/' + 'a'.repeat(999) });
  assert.equal(h.calls[0].payload.body, body);
});

test('service worker toont push en opent uitsluitend eigen oorsprong, zonder fetch-cache', async () => {
  const handlers = {}, shown = [], opened = [];
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), { URL, self: {
    location: { origin: 'https://app.calvora.nl' },
    addEventListener: (name, fn) => { handlers[name] = fn; },
    registration: { showNotification: async (...args) => shown.push(args) },
    clients: { matchAll: async () => [], openWindow: async url => opened.push(url) },
  } });
  let pending;
  handlers.push({ data: { json: () => ({ title: 'Test', body: 'Bericht', url: 'https://evil.test' }) }, waitUntil: value => { pending = value; } });
  await pending;
  assert.equal(shown[0][1].data.url, 'https://app.calvora.nl/dashboard');
  handlers.notificationclick({ notification: { close() {}, data: { url: '/offertes/abc' } }, waitUntil: value => { pending = value; } });
  await pending;
  assert.equal(opened[0], 'https://app.calvora.nl/offertes/abc');
  assert.equal(handlers.fetch, undefined);
});

test('uitloggen schakelt provider uit, ook als serveropruiming tijdelijk mislukt', async () => {
  const code = ts.transpileModule(fs.readFileSync('src/lib/push-client.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} }; const actions = [];
  vm.runInNewContext(code, {
    module, exports: module.exports, Event, Notification: {},
    window: { isSecureContext: true, PushManager: {}, Notification: {}, dispatchEvent: () => actions.push('changed') },
    navigator: { serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => ({ endpoint: subscription.endpoint, unsubscribe: async () => { actions.push('unsubscribe'); return true; } }) } }) } },
    localStorage: { removeItem: () => actions.push('remove-owner') },
    fetch: async () => { actions.push('delete-server'); throw new Error('offline'); },
  });
  await module.exports.disableDevicePush({ getIdToken: async () => 'token' });
  assert.deepEqual(actions, ['unsubscribe', 'delete-server', 'remove-owner', 'changed']);
});


test('lange meldingen blijven volledig in de inbox en retries maken geen duplicaat', async () => {
  const h = harness(); const api = h.load('src/lib/push-inbox.ts');
  h.rows.set('push_subscriptions/a', { userId: 'owner', subscription });
  const full = 'Volledig afspraakvoorstel. '.repeat(100);
  const first = await api.deliverAppMessage('owner', { ...message, body: full });
  const second = await api.deliverAppMessage('owner', { ...message, body: 'Een retry mag de tekst niet vervangen.' });
  assert.equal(first.accepted, 1); assert.equal(second.skipped, 1);
  const saved = [...h.rows.entries()].filter(([key]) => key.startsWith('push_inbox/'));
  assert.equal(saved.length, 1); assert.equal(saved[0][1].body, full.trim());
  assert.equal(h.calls[0].payload.url, '/meldingen?id=' + first.notificationId);
  assert.ok(h.calls[0].payload.body.length <= 260);
});

test('inboxdetail is uitsluitend bereikbaar door de eigenaar', async () => {
  const h = harness(); const api = h.load('src/lib/push-inbox.ts');
  const saved = await api.deliverAppMessage('other', message);
  const route = h.load('src/app/api/push/inbox/route.ts');
  const response = await route.GET(new Request('https://app.calvora.nl/api/push/inbox?id=' + saved.notificationId, {headers:{authorization:'Bearer valid'}}));
  assert.equal(response.status, 404);
});
