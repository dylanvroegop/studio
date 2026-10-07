import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import Module from 'node:module';
import type { MeetingReport } from '../lib/client-meetings';

type Data = Record<string, unknown>;
interface Reference { path: string }
const documents = new Map<string, Data>();
const reference = (name: string): Reference => ({ path: name });
const firestore = {
  collection: (name: string) => ({ doc: (id: string) => reference(`${name}/${id}`) }),
  runTransaction: async <T>(callback: (tx: {
    get: (ref: Reference) => Promise<{ data: () => Data | undefined }>;
    update: (ref: Reference, data: Data) => void;
    create: (ref: Reference, data: Data) => void;
    set: (ref: Reference, data: Data, options?: { merge: boolean }) => void;
  }) => Promise<T>): Promise<T> => {
    const writes: Array<() => void> = [];
    const result = await callback({
      get: async (ref) => ({ data: () => documents.get(ref.path) }),
      update: (ref, value) => { writes.push(() => documents.set(ref.path, { ...documents.get(ref.path), ...value })); },
      create: (ref, value) => { writes.push(() => { assert.equal(documents.has(ref.path), false); documents.set(ref.path, value); }); },
      set: (ref, value, options) => { writes.push(() => documents.set(ref.path, options?.merge ? { ...documents.get(ref.path), ...value } : value)); },
    });
    writes.forEach((write) => write());
    return result;
  },
};

// Alleen de route krijgt een in-memory database; er wordt geen echte klant of offerte geschreven.
const loader = Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = loader._load;
loader._load = function(request, parent, isMain) {
  if (request === '@/firebase/admin') return { initFirebaseAdmin: () => ({ firestore }) };
  if (request === '@/lib/client-meetings-server') {
    const real = originalLoad.call(this, path.resolve(__dirname, '../lib/client-meetings-server'), parent, isMain) as Record<string, unknown>;
    return { ...real, meetingCollection: () => firestore.collection('client_meetings'),
      authenticateMeetingRequest: async (req: Request) => {
        if (req.headers.get('authorization') !== 'Bearer test-user') {
          const ErrorClass = real.MeetingError as new (status: number, message: string) => Error;
          throw new ErrorClass(401, 'Niet ingelogd.');
        }
        return 'user';
      } };
  }
  return originalLoad.call(this, request.startsWith('@/') ? path.resolve(__dirname, '..', request.slice(2)) : request, parent, isMain);
};
// De tijdelijke modulemock moet actief zijn voordat deze route wordt geladen.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { POST } = require('../app/api/client-meetings/[meetingId]/quote/route') as {
  POST: (request: Request, context: { params: { meetingId: string } }) => Promise<Response>;
};
loader._load = originalLoad;

const id = '6d7dfb5e-0a9b-4ed9-8de8-fb207d428b95';
const report: MeetingReport = { projectName: 'Keukenfronten', description: 'Misschien ook nieuwe kasten.', items: [{
  id: 'scope', section: 'scope', title: 'Fronten vervangen', detail: 'Scharnieren hergebruiken.',
  status: 'confirmed', basis: 'spoken', priority: 'normal', reviewed: true,
  evidence: [{ segmentId: 'c0-s0', quote: 'Scharnieren hergebruiken.' }], measurement: null,
}] };
function setup(overrides: Data = {}): void {
  documents.clear();
  documents.set(`client_meetings/${id}`, { userId: 'user', clientId: 'client', status: 'ready', revision: 1,
    expiresAt: Date.now() + 100000, report, ...overrides });
  documents.set('clients/client', { userId: 'user', voornaam: 'Test', achternaam: 'Klant' });
  documents.set('users/user', { instellingen: { standaardUurtarief: 75 } });
  documents.set('counters/quoteNumber_user', { next: 260500 });
}
function call(revision = 1, auth = 'Bearer test-user'): Promise<Response> {
  return POST(new Request('https://local.test', { method: 'POST', headers: { authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ revision }) }), { params: { meetingId: id } });
}

test('offerte-route schrijft een concept met bestaande voorkeuren en reserveert slechts eenmaal', async () => {
  setup();
  const first = await call();
  assert.equal(first.status, 200);
  const firstResult = await first.json();
  const second = await call();
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), firstResult);
  const draft = documents.get(`quotes/${firstResult.quoteId}`)!;
  assert.equal(draft.status, 'concept');
  assert.equal(draft.offerteNummer, 260500);
  assert.equal((draft.instellingen as Data).uurTariefExclBtw, 75);
  assert.match(String(draft.notities), /Scharnieren hergebruiken/);
  assert.doesNotMatch(String(draft.notities), /nieuwe kasten/);
  assert.equal(documents.get('counters/quoteNumber_user')?.next, 260501);
});

test('offerte-route bewaart bestaande notities en voorkomt dubbele toevoeging', async () => {
  setup({ quoteId: 'existing' });
  documents.set('quotes/existing', { userId: 'user', clientId: 'client', status: 'concept', notities: '### Bestaand\nEigen notities.' });
  assert.equal((await call()).status, 200);
  assert.equal((await call()).status, 200);
  const notes = String(documents.get('quotes/existing')?.notities);
  assert.match(notes, /^### Bestaand\nEigen notities/);
  assert.equal(notes.split('Scharnieren hergebruiken.').length, 2);
  assert.equal(documents.get('counters/quoteNumber_user')?.next, 260500);
});

test('offerte-route weigert vreemde eigenaar, stale review en al verzonden offerte zonder writes', async () => {
  setup({ userId: 'other' }); assert.equal((await call()).status, 404);
  setup(); assert.equal((await call(0)).status, 409);
  setup(); assert.equal((await call(1, '')).status, 401);
  setup({ quoteId: 'sent' });
  documents.set('quotes/sent', { userId: 'user', clientId: 'client', status: 'verzonden', notities: 'Bewaren.' });
  assert.equal((await call()).status, 409);
  assert.equal(documents.get('quotes/sent')?.notities, 'Bewaren.');
  assert.equal(documents.get('counters/quoteNumber_user')?.next, 260500);
});

test('offerte-route weigert verwijderd gesprek en onjuiste klantkoppeling', async () => {
  setup({ deletedAt: Date.now() }); assert.equal((await call()).status, 404);
  setup({ quoteId: 'wrong' });
  documents.set('quotes/wrong', { userId: 'user', clientId: 'other-client', status: 'concept' });
  assert.equal((await call()).status, 409);
  assert.equal(documents.get(`client_meetings/${id}`)?.generatedQuoteId, undefined);
});
