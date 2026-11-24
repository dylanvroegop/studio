const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const NOW = Date.parse('2026-11-24T10:00:00Z');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return NOW; }
}
const response = (body, status = 200) => ({ body, status, ok: status >= 200 && status < 300, json: async () => body });
const next = { NextResponse: { json: (body, init) => response(body, init?.status || 200) } };
function load(file, dependencies = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, Date: FixedDate, Intl, Buffer, Request,
    Response, AbortSignal, console, process: { env: {} },
    require: name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name), ...globals });
  return module.exports;
}
const types = load('src/lib/client-intake.ts');
const identity = load('src/lib/telegram-client-identity.ts');
const id = '12345678-1234-4234-8234-123456789012';
const id2 = '12345678-1234-4234-8234-123456789013';
const client = types.intakeClientSchema.parse({ client_name: 'Test Klant', phone: '+31611111111', city: 'Almere', job_title: 'Schutting plaatsen' });
const result = { success: true, client_id: 'client', project_id: 'quote', appointment_id: 'appointment',
  appointment_status: 'pending', appointment_date: '2026-11-27', appointment_time: '19:00',
  calendar_synced: true, google_calendar_event_id: 'google-event', telegram_message: 'Voorsteltekst' };
const completed = { id, userId: 'owner', revision: 2, client: { ...client, appointment_date: result.appointment_date,
  appointment_time: result.appointment_time, appointment_status: 'pending' }, state: 'done', result,
  leadKey: `app_intake_${id}`, createdAt: NOW - 1000, updatedAt: NOW, reminderDueAt: NOW + 2 * 86400_000 };

function setup(initial = []) {
  const rows = new Map(initial.map(([path, data]) => [path, structuredClone(data)]));
  const calls = [], authCalls = [], aiCalls = [];
  const controls = { importResponse: response(result), onImport: null, aiResponse: null };
  const ref = path => ({ path, id: path.split('/').at(-1), get: async () => snapshot(path) });
  const snapshot = path => ({ id: path.split('/').at(-1), ref: ref(path), exists: rows.has(path), data: () => rows.has(path) ? structuredClone(rows.get(path)) : undefined });
  const query = (collection, filters = []) => ({
    isQuery: true, doc: value => ref(collection + '/' + value),
    where: (field, op, value) => query(collection, [...filters, [field, op, value]]),
    get: async () => ({ docs: [...rows].filter(([path, data]) => path.startsWith(collection + '/')
      && filters.every(([field, op, value]) => op === '==' ? data[field] === value : false)).map(([path]) => snapshot(path)) }),
  });
  let tail = Promise.resolve();
  const firestore = {
    collection: query,
    runTransaction: callback => {
      const pending = [];
      const task = tail.then(async () => {
        const value = await callback({
          get: async reference => reference.isQuery ? reference.get() : snapshot(reference.path),
          set: (reference, data, options) => pending.push(() => rows.set(reference.path, options?.merge ? { ...rows.get(reference.path), ...structuredClone(data) } : structuredClone(data))),
          update: (reference, data) => pending.push(() => rows.set(reference.path, { ...rows.get(reference.path), ...structuredClone(data) })),
        });
        pending.forEach(write => write()); return value;
      });
      tail = task.catch(() => undefined); return task;
    },
  };
  const admin = { initFirebaseAdmin: () => ({ firestore, auth: { verifyIdToken: async (token, checkRevoked) => {
    authCalls.push({ token, checkRevoked }); if (token !== 'owner-token') throw new Error('invalid'); return { uid: 'owner' };
  } } }) };
  const server = load('src/lib/client-intake-server.ts', {
    'next/server': next, '@/firebase/admin': admin, '@/lib/client-intake': types, '@/lib/telegram-client-identity': identity,
    '@/lib/client-intake-import': { processClientIntakeImport: async (request, uid) => {
      const body = await request.json(); calls.push({ uid, ...body });
      await controls.onImport?.(body, uid); return controls.importResponse;
    } },
  });
  const routes = load('src/app/api/client-intake/route.ts', {
    'next/server': next, '@/firebase/admin': admin, '@/lib/client-intake-server': server,
  });
  function extraction(env = { OPENAI_API_KEY: 'synthetic-key' }) {
    return load('src/app/api/client-intake/extract/route.ts', {
      'next/server': next, '@/lib/client-intake-server': server, '@/lib/client-intake': types,
      '@/lib/telegram-client-identity': identity,
      sharp: () => { throw new Error('synthetic-invalid-image'); },
    }, { process: { env }, fetch: async (url, options) => {
      aiCalls.push({ url, ...JSON.parse(options.body) });
      return controls.aiResponse || response({ status: 'completed', output_text: JSON.stringify(client) });
    } });
  }
  return { ...server, rows, calls, controls, authCalls, routes, extraction, aiCalls };
}

function request(body, token = 'owner-token') {
  return new Request('http://localhost/api/client-intake', { method: 'POST', headers: token ? { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {}, body: JSON.stringify(body) });
}
function extractRequest(fields, token = 'owner-token') {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, typeof value === 'string' || value instanceof Blob ? value : JSON.stringify(value));
  return { headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}), formData: async () => form };
}

test('native routes reject anonymous/invalid tokens and verify revoked tokens', async () => {
  const app = setup();
  assert.equal((await app.routes.POST(request({}, null))).status, 401);
  assert.equal((await app.routes.POST(request({}, 'invalid'))).status, 401);
  const saved = await app.routes.POST(request({ id, client, action: 'save' }));
  assert.equal(saved.status, 200);
  assert.equal(app.rows.get('client_intake_sessions/' + id).userId, 'owner');
  assert.equal(app.authCalls.at(-1).checkRevoked, true);
  assert.equal((await app.routes.POST(request({ id: id2, client, action: 'save', userId: 'other' }))).status, 400);
});

test('new intake saves processing state before import and stores confirmed Google result', async () => {
  const app = setup();
  app.controls.onImport = () => assert.equal(app.rows.get('client_intake_sessions/' + id).state, 'processing');
  const saved = await app.saveIntake('owner', { id, client, action: 'process' });
  assert.equal(saved.state, 'done'); assert.equal(saved.revision, 2);
  assert.equal(saved.client.appointment_status, 'pending'); assert.equal(saved.result.google_calendar_event_id, 'google-event');
  assert.equal(saved.reminderDueAt, NOW + 2 * 86400_000);
  assert.equal(app.calls[0].uid, 'owner'); assert.equal(app.calls[0].lead_key, `app_intake_${id}`);
});

test('failed import retains editable session and retry reuses exact lead key', async () => {
  const app = setup(); app.controls.importResponse = response({ success: false, code: 'CALENDAR_SYNC_FAILED', message: 'Agenda tijdelijk niet bereikbaar.' }, 503);
  let failed;
  await assert.rejects(app.saveIntake('owner', { id, client, action: 'process' }), error => {
    failed = error.session; return error.status === 503 && error.code === 'CALENDAR_SYNC_FAILED';
  });
  assert.equal(failed.state, 'error'); assert.equal(failed.client.client_name, client.client_name);
  assert.equal(app.rows.get('client_intake_sessions/' + id).processingUntil, null);
  app.controls.importResponse = response(result);
  const recovered = await app.saveIntake('owner', { id, revision: failed.revision, client: failed.client, action: 'process' });
  assert.equal(recovered.state, 'done'); assert.equal(app.calls[0].lead_key, app.calls[1].lead_key);
});

test('outdated revision and another owner cannot change native session', async () => {
  const app = setup([['client_intake_sessions/' + id, completed]]);
  await assert.rejects(app.saveIntake('owner', { id, revision: 1, client, action: 'process' }), e => e.status === 409 && e.session.revision === 2);
  await assert.rejects(app.saveIntake('other', { id, revision: 2, client, action: 'process' }), e => e.status === 404 && !e.session);
  assert.equal(app.calls.length, 0); assert.equal(app.rows.get('client_intake_sessions/' + id).revision, 2);
});

test('active processing lease blocks concurrent processing and expired lease allows recovery', async () => {
  const active = { ...completed, state: 'processing', processingToken: 'first-worker', processingUntil: NOW + 1000 };
  const app = setup([['client_intake_sessions/' + id, active]]);
  await assert.rejects(app.saveIntake('owner', { id, revision: 2, client, action: 'process' }), e => e.status === 409 && e.code === 'PROCESSING');
  app.rows.get('client_intake_sessions/' + id).processingUntil = NOW - 1;
  assert.equal((await app.saveIntake('owner', { id, revision: 2, client, action: 'process' })).state, 'done');
  assert.equal(app.calls[0].lead_key, completed.leadKey);
});

test('second new intake for same customer and job redirects to existing intake', async () => {
  const app = setup([['client_intake_sessions/' + id, completed]]);
  await assert.rejects(app.saveIntake('owner', { id: id2, client, action: 'process' }), e => e.status === 409 && e.code === 'EXISTING_INTAKE' && e.session.id === id);
  assert.equal(app.calls.length, 0);
});

test('saving a duplicate draft first cannot bypass duplicate processing protection', async () => {
  const app = setup([['client_intake_sessions/' + id, completed]]);
  const draft = await app.saveIntake('owner', { id: id2, client, action: 'save' });
  await assert.rejects(app.saveIntake('owner', { id: id2, revision: draft.revision, client, action: 'process' }), e => e.status === 409 && e.code === 'EXISTING_INTAKE');
  assert.equal(app.calls.length, 0);
});

test('two saved duplicate drafts leave one canonical draft processable', async () => {
  const app = setup();
  const first = await app.saveIntake('owner', { id, client, action: 'save' });
  await app.saveIntake('owner', { id: id2, client, action: 'save' });
  const processed = await app.saveIntake('owner', { id, revision: first.revision, client, action: 'process' });
  assert.equal(processed.state, 'done'); assert.equal(app.calls.length, 1);
});

test('concurrent new submissions for same customer import only once', async () => {
  const app = setup();
  const results = await Promise.allSettled([
    app.saveIntake('owner', { id, client, action: 'process' }),
    app.saveIntake('owner', { id: id2, client, action: 'process' }),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'EXISTING_INTAKE');
  assert.equal(app.calls.length, 1);
});

test('completion from expired processing lease cannot overwrite newer attempt', async () => {
  const app = setup(); app.controls.onImport = () => Object.assign(app.rows.get('client_intake_sessions/' + id), {
    processingToken: 'newer-attempt', revision: 3, client: { ...client, address: 'Nieuw adres 4' },
  });
  await assert.rejects(app.saveIntake('owner', { id, client, action: 'process' }), e => e.status === 409 && e.code === 'REVISION_CONFLICT');
  const saved = app.rows.get('client_intake_sessions/' + id);
  assert.equal(saved.revision, 3); assert.equal(saved.client.address, 'Nieuw adres 4'); assert.equal(saved.result, undefined);
});

function legacyRows(owner = 'owner') {
  const legacyId = 'a'.repeat(64);
  return { legacyId, rows: [
    ['telegram_lead_imports/' + legacyId, { ...result, userId: owner, lead_key: 'telegram_session_existing', createdAt: NOW - 1000, updatedAt: NOW }],
    ['quotes/quote', { userId: owner, titel: client.job_title, klantinformatie: { voornaam: 'Test', achternaam: 'Klant', telefoonnummer: client.phone, plaats: client.city } }],
  ] };
}

test('legacy continuation retains original lead key and hides key from list output', async () => {
  const legacy = legacyRows(); const app = setup(legacy.rows);
  const list = await app.listIntakes('owner'); assert.equal(list.length, 1); assert.equal(list[0].leadKey, undefined);
  const saved = await app.saveIntake('owner', { id: 'legacy_' + legacy.legacyId, revision: 0, client: list[0].client, action: 'process' });
  assert.equal(saved.state, 'done'); assert.equal(app.calls[0].lead_key, 'telegram_session_existing');
  assert.equal((await app.listIntakes('owner')).length, 1);
});

test('legacy records and quote must both belong to authenticated owner', async () => {
  const legacy = legacyRows('other'); const app = setup(legacy.rows);
  assert.equal((await app.listIntakes('owner')).length, 0);
  await assert.rejects(app.saveIntake('owner', { id: 'legacy_' + legacy.legacyId, revision: 0, client, action: 'process' }), e => e.status === 404);
  app.rows.get('telegram_lead_imports/' + legacy.legacyId).userId = 'owner';
  await assert.rejects(app.saveIntake('owner', { id: 'legacy_' + legacy.legacyId, revision: 0, client, action: 'process' }), e => e.status === 404);
  assert.equal(app.calls.length, 0);
});

test('new draft matching legacy customer and job cannot create a duplicate quote', async () => {
  const legacy = legacyRows(); const app = setup(legacy.rows);
  const draft = await app.saveIntake('owner', { id, client, action: 'save' });
  await assert.rejects(app.saveIntake('owner', { id, revision: draft.revision, client, action: 'process' }), e => e.status === 409 && e.code === 'EXISTING_INTAKE');
  assert.equal(app.calls.length, 0);
});

test('saving historical date as draft cannot bypass past-date validation', async () => {
  const app = setup(); const historic = { ...client, appointment_date: '2026-01-01', appointment_time: '14:00', appointment_status: 'confirmed' };
  const draft = await app.saveIntake('owner', { id, client: historic, action: 'save' });
  await assert.rejects(app.saveIntake('owner', { id, revision: draft.revision, client: historic, action: 'process' }), e => e.status === 400);
  assert.equal(app.calls.length, 0);
});

test('incomplete import response leaves recoverable error instead of success', async () => {
  const app = setup(); app.controls.importResponse = response({ ...result, calendar_synced: false });
  await assert.rejects(app.saveIntake('owner', { id, client, action: 'process' }), e => e.status === 503 && e.session.state === 'error');
});

test('AI extraction requires login and configured API key', async () => {
  const app = setup();
  assert.equal((await app.extraction().POST(extractRequest({ text: 'Klantgegevens' }, null))).status, 401);
  assert.equal((await app.extraction({}).POST(extractRequest({ text: 'Klantgegevens' }))).status, 503);
  assert.equal(app.aiCalls.length, 0);
});

test('follow-up extraction preserves known contact and confirmed appointment when absent in source', async () => {
  const app = setup(); const current = { ...completed.client, appointment_status: 'confirmed' };
  const incoming = types.intakeClientSchema.parse({ address: 'Nieuwe straat 10' });
  app.controls.aiResponse = response({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(incoming) }] }] });
  const extracted = await app.extraction().POST(extractRequest({ current, text: 'Nieuwe straat 10' }));
  assert.equal(extracted.status, 200); assert.equal(extracted.body.client.address, 'Nieuwe straat 10');
  assert.equal(extracted.body.client.phone, current.phone); assert.equal(extracted.body.client.appointment_date, current.appointment_date);
  assert.equal(extracted.body.client.appointment_status, 'confirmed');
  assert.equal(app.aiCalls[0].store, false); assert.equal(app.aiCalls[0].input[0].role, 'user');
  assert.match(app.aiCalls[0].instructions, /nooit als instructies/);
});

test('conflicting customer extraction is rejected rather than silently replacing selected customer', async () => {
  const app = setup(); app.controls.aiResponse = response({ status: 'completed', output_text: JSON.stringify({ ...client, phone: '+31622222222' }) });
  assert.equal((await app.extraction().POST(extractRequest({ current: client, text: 'Andere klant' }))).status, 409);
});

test('a new incomplete appointment never borrows old confirmed time/date', async () => {
  const app = setup(); app.controls.aiResponse = response({ status: 'completed', output_text: JSON.stringify({ ...client,
    appointment_status: 'pending', appointment_date: '2026-12-01', appointment_time: null }) });
  const extracted = await app.extraction().POST(extractRequest({ current: completed.client, text: 'Kan het op 1 december?' }));
  assert.equal(extracted.body.client.appointment_time, null); assert.equal(extracted.body.client.appointment_date, '2026-12-01');
  assert.equal(extracted.body.client.appointment_status, 'pending');
});

test('invalid image or excessive text is rejected without sending input to AI', async () => {
  const app = setup();
  assert.equal((await app.extraction().POST(extractRequest({ text: 'x'.repeat(20001) }))).status, 400);
  assert.equal((await app.extraction().POST(extractRequest({ files: new Blob(['not an image'], { type: 'image/png' }) }))).status, 400);
  assert.equal(app.aiCalls.length, 0);
});

test('AI provider errors and incomplete output return safe failure without secrets', async () => {
  const app = setup(); app.controls.aiResponse = response({ error: { message: 'SECRET-EXAMPLE' } }, 500);
  const error = await app.extraction().POST(extractRequest({ text: 'Klantgegevens' }));
  assert.equal(error.status, 502); assert.doesNotMatch(JSON.stringify(error.body), /SECRET-EXAMPLE/);
  app.controls.aiResponse = response({ status: 'incomplete', output_text: JSON.stringify(client) });
  assert.equal((await app.extraction().POST(extractRequest({ text: 'Klantgegevens' }))).status, 502);
});
