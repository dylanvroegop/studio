const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const { bindSharedQuoteAmount, sharedAmountsForFiles, compareSharedQuoteAmount } = require('../src/lib/quote-shared-amount');

let stored = {};
let writes = [];
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === 'firebase/firestore') return {
    doc: (_db, _collection, id) => ({ id }), serverTimestamp: () => 'server-time',
    runTransaction: async (_db, callback) => {
      const pending = [];
      await callback({
        get: async ref => ({ id: ref.id, ref, exists: () => !!stored[ref.id], data: () => stored[ref.id] }),
        update: (ref, update) => pending.push({ id: ref.id, update }),
      });
      pending.forEach(({ id, update }) => Object.entries(update).forEach(([path, value]) => {
        const keys = path.split('.'); let target = stored[id];
        keys.slice(0, -1).forEach(key => { target = target[key] ||= {}; });
        target[keys.at(-1)] = value;
      }));
      writes.push(...pending);
    },
  };
  return originalLoad.call(this, name, ...args);
};
const { markQuoteSelectionAsSent } = require('../src/lib/quote-send-status');
Module._load = originalLoad;
const quote = id => ({ id, userId: 'owner', status: 'concept', amount: 999, klantinformatie: { voornaam: 'Test', achternaam: 'Klant' } });
const pdf = (id, amount) => bindSharedQuoteAmount(new File(['PDF'], `${id}.pdf`, { type: 'application/pdf' }), id, amount);
const options = (ids, snapshots) => ({ firestore: {}, userId: 'owner', currentQuote: quote('one'), selectedIds: ids, currentTotal: 999, sharedAmounts: snapshots });

test('bedrag is gekoppeld aan exacte PDF, selectie en retry houden hetzelfde bedrag en tijdstip', () => {
  const a = pdf('one', 957); const b = pdf('two', 123.45);
  const shared = sharedAmountsForFiles([a, b], ['one', 'two']);
  assert.deepEqual(shared.map(row => row.amountCents), [95700, 12345]);
  assert.deepEqual(sharedAmountsForFiles([a, b], ['one', 'two']), shared);
  assert.throws(() => sharedAmountsForFiles([a], ['two']), /selectie/);
  assert.throws(() => sharedAmountsForFiles([a, a], ['one', 'two']), /selectie/);
  assert.throws(() => sharedAmountsForFiles([new File(['old'], 'old.pdf')], ['one']), /opnieuw/);
  assert.throws(() => pdf('one', NaN), /ongeldig/);
});

test('delen slaat PDF-bedrag op ondanks gewijzigde actuele prijs; geaccepteerd blijft geaccepteerd', async () => {
  stored = { one: { ...quote('one'), status: 'geaccepteerd', amount: 984.94 } }; writes = [];
  const shared = sharedAmountsForFiles([pdf('one', 957)], ['one']);
  await markQuoteSelectionAsSent(options(['one'], shared));
  assert.equal(stored.one.status, 'geaccepteerd');
  assert.equal(stored.one.whatsappQuoteSnapshot.amountCents, 95700);
  assert.equal(stored.one.financieel.oorspronkelijkePrijsInclBtw, 957);
  assert.deepEqual(stored.one.whatsappQuoteSnapshotHistory[shared[0].id], shared[0]);
});

test('statusretry voor meerdere PDFs is idempotent en oudere retry vervangt nieuwere snapshot niet', async () => {
  stored = { one: quote('one'), two: quote('two') }; writes = [];
  const shared = sharedAmountsForFiles([pdf('one', 957), pdf('two', 100)], ['one', 'two']);
  await markQuoteSelectionAsSent(options(['one', 'two'], shared));
  await markQuoteSelectionAsSent(options(['one', 'two'], shared));
  assert.equal(stored.two.status, 'verzonden');
  assert.equal(Object.keys(stored.two.whatsappQuoteSnapshotHistory).length, 1);
  const newer = { ...shared[0], id: 'newer', amountCents: 98494, sharedAt: '2099-01-01T00:00:00.000Z' };
  await markQuoteSelectionAsSent(options(['one'], [newer]));
  await markQuoteSelectionAsSent(options(['one'], shared.slice(0, 1)));
  assert.equal(stored.one.whatsappQuoteSnapshot.id, 'newer');
  assert.equal(Object.keys(stored.one.whatsappQuoteSnapshotHistory).length, 2);
});

test('vreemde eigenaar of ontbrekende snapshot schrijft niets, ontbrekende historie wordt niet verzonnen', async () => {
  stored = { one: quote('one'), two: { ...quote('two'), userId: 'other' } }; writes = [];
  const shared = sharedAmountsForFiles([pdf('one', 957), pdf('two', 100)], ['one', 'two']);
  await assert.rejects(markQuoteSelectionAsSent(options(['one', 'two'], shared)), /selectie/);
  await assert.rejects(markQuoteSelectionAsSent(options(['one'], [])), /PDF-bedrag/);
  assert.equal(writes.length, 0);
  assert.equal(compareSharedQuoteAmount(undefined, 506.44, 478.50), null);
  assert.equal(compareSharedQuoteAmount(shared[0], 478.50, 478.50).differenceCents, 0);
  assert.equal(compareSharedQuoteAmount(shared[0], 506.44, 478.50).differenceCents, 2794);
});
