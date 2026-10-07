const fs = require('node:fs');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const ts = require('typescript');

const NOW = '2026-10-06T10:00:00.000Z';
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return new Date(NOW).getTime(); }
  static [Symbol.hasInstance](value) { return value instanceof Date; }
}
function loadTs(file, overrides = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, Buffer, Intl, Date: FixedDate,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : require(name),
    process: { env: { N8N_HEADER_SECRET: 'synthetic-test-secret', CALVORA_USER_ID: 'owner' } },
    console: { info() {}, error() {} },
  }, { filename: file });
  return module.exports;
}
const suggestions = loadTs('src/lib/appointment-suggestions.ts');
const identity = loadTs('src/lib/telegram-client-identity.ts');
const calendarHelper = loadTs('src/lib/telegram-appointment-calendar.ts');
const client = { client_name: 'Test Klant', city: 'Almere', phone: '+31611111111', email: 'test@example.com' };
const storedClient = { userId: 'owner', voornaam: 'Test', achternaam: 'Klant', plaats: client.city, telefoonnummer: client.phone, emailadres: client.email };
const project = { userId: 'owner', clientId: 'client', klantinformatie: storedClient, titel: 'Bestaande omschrijving', archived: false };
const entry = (start, end, city = '') => ({ startDate: new Date(start), endDate: new Date(end), city });
const pending = { userId: 'owner', quoteId: 'existing', source: 'telegram_werkspot', leadKey: 'test-session', status: 'pending', ...entry('2026-10-09T17:00Z', '2026-10-09T18:00Z') };
const cached = {
  client_id: 'client', project_id: 'existing', appointment_id: 'appointment', appointment_status: 'pending',
  appointment_date: '2026-10-09', appointment_time: '19:00',
  suggested_appointment_date: '2026-10-09', suggested_appointment_time: '19:00',
  suggested_appointment_options: [{ date: '2026-10-09', time: '19:00' }, { date: '2026-10-10', time: '19:00' }],
  telegram_message: 'Ik kan op één van deze twee momenten langskomen.',
};
const importId = lead => createHash('sha256').update('owner:' + lead).digest('hex');
function merge(left, right) {
  const result = { ...left };
  for (const [key, value] of Object.entries(right)) result[key] = value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)
    ? merge(left?.[key] || {}, value) : value;
  return result;
}
function makeRoute({ duplicate, appointment, busy = [], workDays, clients = { client: storedClient }, existingProject = project, googleEvents = [], extraRows = [], appointmentSuggestions = suggestions } = {}) {
  const writes = [];
  const reads = [];
  const calendarCalls = [];
  const controls = {};
  const rows = new Map([
    ...Object.entries(clients).map(([id, data]) => ['clients/' + id, data]),
    ...(existingProject ? [['quotes/existing', existingProject]] : []),
    ['users/owner', { integrations: { googleCalendar: { connected: true, refreshToken: 'test' } }, settings: { planningSettings: { workDays } } }],
    ...busy.map((data, i) => ['planning_entries/busy-' + i, { ...data, userId: 'owner' }]),
    ...(appointment ? [['planning_entries/appointment', appointment]] : []),
    ...(duplicate ? [['telegram_lead_imports/' + importId('test-session'), { ...duplicate, userId: 'owner' }]] : []),
    ...extraRows,
  ]);
  const events = new Map(googleEvents.map(event => [event.id, event]));
  const versions = new Map();
  let seq = 0;
  let transactionRetries = 0;
  let transactionCalls = 0;
  const snapshot = (ref, data) => ({ ref, id: ref.id, exists: Boolean(data), data: () => data });
  const get = (ref, tracked) => {
    reads.push(ref.path);
    if (ref.query) return { docs: [...rows].filter(([path, data]) => path.startsWith(ref.collection + '/') && data[ref.field] === ref.value)
      .map(([path, data]) => { tracked?.set(path, versions.get(path) || 0); return snapshot(reference(path), data); }) };
    tracked?.set(ref.path, versions.get(ref.path) || 0);
    return snapshot(ref, rows.get(ref.path));
  };
  const reference = path => ({ path, id: path.split('/')[1], get: async () => get(reference(path)) });
  const firestore = {
    collection: name => ({
      doc: id => reference(name + '/' + (id || 'new-' + ++seq)),
      where: (field, op, value) => { const ref = { query: true, collection: name, path: name + '/query', field, value }; return { ...ref, get: async () => get(ref) }; },
    }),
    async runTransaction(callback) {
      transactionCalls += 1;
      if (controls.beforeTransaction) await controls.beforeTransaction(transactionCalls, rows);
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const tracked = new Map();
        const pendingWrites = [];
        const result = await callback({
          get: async ref => get(ref, tracked), getAll: async (...refs) => refs.map(ref => get(ref, tracked)),
          set: (ref, data, options) => pendingWrites.push({ path: ref.path, data, options }),
        });
        if ([...tracked].some(([path, version]) => (versions.get(path) || 0) !== version)) { transactionRetries += 1; continue; }
        for (const write of pendingWrites) {
          writes.push(write);
          rows.set(write.path, write.options?.merge ? merge(rows.get(write.path), write.data) : write.data);
          versions.set(write.path, (versions.get(write.path) || 0) + 1);
        }
        return result;
      }
      throw new Error('transaction retry limit');
    },
  };
  const calendar = { events: {
    async get({ eventId }) {
      calendarCalls.push({ action: 'get', eventId });
      if (controls.failNextGetCode) { const code = controls.failNextGetCode; controls.failNextGetCode = null; throw { code }; }
      if (!events.has(eventId)) throw { code: 404 };
      return { data: events.get(eventId) };
    },
    async list(args) {
      calendarCalls.push({ action: 'list', ...args });
      if (controls.failList) throw new Error('Calendar unavailable');
      const values = [...events.values()].filter(event => {
        if (!args.showDeleted && event.status === 'cancelled') return false;
        if (args.q && !String(event.description || '').includes(args.q)) return false;
        const start = new Date(event.start?.dateTime || event.start?.date || 0);
        const end = new Date(event.end?.dateTime || event.end?.date || 0);
        return (!args.timeMin || end > new Date(args.timeMin)) && (!args.timeMax || start < new Date(args.timeMax));
      });
      const offset = Number(args.pageToken || 0);
      const size = controls.pageSize || 2500;
      return { data: { items: values.slice(offset, offset + size), nextPageToken: offset + size < values.length ? String(offset + size) : undefined } };
    },
    async insert({ requestBody }) {
      calendarCalls.push({ action: 'insert', eventId: requestBody.id });
      if (controls.beforeInsert) await controls.beforeInsert();
      if (events.has(requestBody.id)) throw { code: 409 };
      if (controls.failInsertBefore) throw new Error('Calendar unavailable');
      events.set(requestBody.id, { ...requestBody });
      if (controls.failNextInsertAfter) { controls.failNextInsertAfter = false; throw new Error('Timeout after Google stored the event'); }
      return { data: events.get(requestBody.id) };
    },
    async patch({ eventId, requestBody }, options) {
      calendarCalls.push({ action: 'patch', eventId, options });
      if (!events.has(eventId)) throw { code: 404 };
      if (controls.deleteBeforePatch) { events.get(eventId).status = 'cancelled'; controls.deleteBeforePatch = false; throw { code: 410 }; }
      if (controls.failPatchCode) throw { code: controls.failPatchCode };
      if (events.get(eventId).status === 'cancelled') throw { code: 410 };
      events.set(eventId, merge(events.get(eventId), requestBody));
      return { data: events.get(eventId) };
    },
  } };
  const route = loadTs('src/app/api/telegram-leads/import/route.ts', {
    '@/firebase/admin': { initFirebaseAdmin: () => ({ firestore, auth: { getUser: async () => ({}) } }) },
    '@/lib/telegram-client-identity': identity,
    '@/lib/appointment-suggestions': appointmentSuggestions,
    '@/lib/integrations/google-calendar': { getCalendarClient: async () => ({ calendar, credentials: {} }) },
    '@/lib/telegram-appointment-calendar': calendarHelper,
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => new Date(NOW) }, Timestamp: { fromDate: date => date } },
  });
  return { writes, reads, rows, events, calendar, calendarCalls, controls, retries: () => transactionRetries,
    post: (incoming = client, leadKey = 'test-session') => route.POST({
      headers: new Headers({ 'x-offertehulp-secret': 'synthetic-test-secret' }),
      json: async () => ({ lead_key: leadKey, client: incoming }),
    }) };
}
module.exports = { loadTs, suggestions, identity, calendarHelper, client, storedClient, project, entry, pending, cached, makeRoute, importId };
