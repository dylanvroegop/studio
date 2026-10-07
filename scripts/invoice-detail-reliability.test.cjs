const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function load(filename, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', filename), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)((name) => {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  }, module, module.exports);
  return module.exports;
}

const { hasCompleteInvoiceSourceSnapshot, hasFrozenInvoiceSnapshot } = load('src/lib/invoice-detail-snapshot.ts');
test('alleen complete brongegevens slaan de oude offerte/klantverrijking over', () => {
  const invoice = { invoiceSnapshotVersion: 1, calculationSnapshot: { totals: { total: 100 } }, sourceQuote: { offerteNummer: 123, klantSnapshot: { klanttype: 'particulier' } } };
  assert.equal(hasCompleteInvoiceSourceSnapshot(invoice), true);
  assert.equal(hasFrozenInvoiceSnapshot(invoice), true);
  assert.equal(hasFrozenInvoiceSnapshot({ ...invoice, invoiceSnapshotVersion: undefined }), false, 'oude ruwe snapshots hebben nog actuele offerte-instellingen nodig');
  assert.equal(hasCompleteInvoiceSourceSnapshot({ ...invoice, calculationSnapshot: {} }), false);
  assert.equal(hasCompleteInvoiceSourceSnapshot({ ...invoice, sourceQuote: { ...invoice.sourceQuote, offerteNummer: undefined } }), false);
  const business = { ...invoice, sourceQuote: { offerteNummer: 123, klantSnapshot: { klanttype: 'zakelijk', kvkNummer: '12345678' } } };
  assert.equal(hasCompleteInvoiceSourceSnapshot(business), false, 'ontbrekend btw-nummer moet nog kunnen worden verrijkt');
  assert.equal(hasCompleteInvoiceSourceSnapshot({ ...business, calculationSnapshot: { klantinformatie: { btwNummer: 'NL123B01' } } }), true);
  assert.equal(hasCompleteInvoiceSourceSnapshot({ ...invoice, sourceQuote: { offerteNummer: 123, klantSnapshot: {} } }), false);
});

const overrideValues = { originalTotalInclBtw: 1000, voorschotAftrekInclBtw: 500, voorschotPaidAmount: 500, finalTotalInclBtw: 500, reason: 'Correctie' };
function overrideHarness(attempts) {
  const writes = [];
  const helper = load('src/lib/invoice-amount-override.ts', {
    'firebase/firestore': {
      doc: (_db, collection, id) => `${collection}/${id}`,
      serverTimestamp: () => 'now',
      deleteField: () => 'delete',
      runTransaction: async (_db, callback) => {
        for (const current of attempts) {
          await callback({
            get: async () => ({ exists: () => current !== null, data: () => current }),
            update: (reference, data) => writes.push({ reference, data }),
          });
        }
      },
    },
  });
  return { ...helper, writes };
}

test('een bankbetaling tussen tonen, opslaan en transactieherhaling blijft behouden', async () => {
  const unpaid = { userId: 'owner', status: 'verzonden', paymentSummary: { paidAmount: 0, openAmount: 1000 } };
  const bankPaid = { ...unpaid, status: 'gedeeltelijk_betaald', paymentSummary: { paidAmount: 300, openAmount: 700, lastPaymentAt: 'bank-date' }, financialAdjustments: { voorschotFactuur: { id: 'advance', status: 'betaald' } } };
  const harness = overrideHarness([unpaid, bankPaid]);
  await harness.saveInvoiceAmountOverride({}, 'invoice-1', 'owner', overrideValues);
  assert.equal(harness.writes.length, 2, 'simuleer conflict en nieuwe actuele snapshot');
  assert.equal(harness.writes[0].data['paymentSummary.openAmount'], 500);
  const committed = harness.writes[1];
  assert.equal(committed.reference, 'invoices/invoice-1');
  assert.equal(committed.data['paymentSummary.openAmount'], 200);
  assert.equal(committed.data.status, 'gedeeltelijk_betaald');
  assert.equal(committed.data['financialAdjustments.voorschotFactuur'].id, 'advance');
  assert.equal(committed.data['financialAdjustments.voorschotFactuur'].status, 'betaald');
  assert.equal('paymentSummary' in committed.data, false);
  assert.equal('paymentSummary.paidAmount' in committed.data, false);
  assert.equal('paymentSummary.lastPaymentAt' in committed.data, false);
  assert.equal('totalsSnapshot' in committed.data, false);
});

test('bedragcorrecties houden betaalstatus actueel zonder annulering op te heffen', async () => {
  const paid = { userId: 'owner', status: 'betaald', paidAt: 'paid-date', paymentSummary: { paidAmount: 300 } };
  const increased = overrideHarness([paid]);
  await increased.saveInvoiceAmountOverride({}, 'invoice', 'owner', overrideValues);
  assert.equal(increased.writes[0].data.status, 'gedeeltelijk_betaald');
  assert.equal(increased.writes[0].data.paidAt, 'delete');
  const reduced = overrideHarness([{ ...paid, status: 'gedeeltelijk_betaald' }]);
  await reduced.saveInvoiceAmountOverride({}, 'invoice', 'owner', { ...overrideValues, finalTotalInclBtw: 300 });
  assert.equal(reduced.writes[0].data.status, 'betaald');
  assert.equal(reduced.writes[0].data['paymentSummary.openAmount'], 0);
  const cancelled = overrideHarness([{ ...paid, status: 'geannuleerd' }]);
  await cancelled.saveInvoiceAmountOverride({}, 'invoice', 'owner', overrideValues);
  assert.equal(cancelled.writes[0].data.status, 'geannuleerd');
});

test('ontbrekende factuur, andere eigenaar en ongeldige bedragen schrijven niets', async () => {
  for (const invoice of [null, { userId: 'other' }]) {
    const harness = overrideHarness([invoice]);
    await assert.rejects(harness.saveInvoiceAmountOverride({}, 'invoice', 'owner', overrideValues), /niet gevonden/);
    assert.deepEqual(harness.writes, []);
  }
  const invalid = overrideHarness([]);
  await assert.rejects(invalid.saveInvoiceAmountOverride({}, 'invoice', 'owner', { ...overrideValues, finalTotalInclBtw: NaN }), /Ongeldig/);
});
