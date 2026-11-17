const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function harness(initial, retryWith) {
  let invoice = structuredClone(initial);
  const writes = [];
  const update = (reference, values) => {
    assert.equal(reference, 'invoices/invoice-1');
    writes.push(values);
    for (const [key, value] of Object.entries(values)) {
      const parts = key.split('.');
      const field = parts.pop();
      const parent = parts.reduce((obj, part) => obj[part] ??= {}, invoice);
      if (value === 'DELETE') delete parent[field];
      else parent[field] = value;
    }
  };
  const transaction = { get: async () => ({ exists: () => !!invoice, data: () => invoice }), update };
  const firestore = {
    doc: (_db, collection, id) => `${collection}/${id}`,
    Timestamp: { now: () => ({ seconds: 100 }) },
    deleteField: () => 'DELETE', serverTimestamp: () => 'NOW',
    runTransaction: async (_db, callback) => {
      if (retryWith) {
        await callback({ ...transaction, update: () => {} });
        invoice = structuredClone(retryWith);
        retryWith = null;
      }
      await callback(transaction);
    },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/invoice-extra-work.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    assert.equal(name, 'firebase/firestore');
    return firestore;
  }, module, module.exports);
  return { add: (input, owner = 'owner') => module.exports.addInvoiceExtraWork({}, 'invoice-1', owner, input),
    invoice: () => invoice, writes };
}

const invoice = {
  userId: 'owner', status: 'verzonden',
  totalsSnapshot: { totaalInclBtw: 1477.26 },
  financialAdjustments: { originalTotalInclBtw: 2954.52, voorschotAftrekInclBtw: 1477.26 },
  paymentSummary: { paidAmount: 200, openAmount: 1277.26, lastPaymentAt: 'BANK-DATE' },
};
const input = { id: 'extra-1', amountInclBtw: 150, description: '  Mondeling: extra plint  ', vatRate: 21 };

test('meerwerk verhoogt totaal en openstaand; voorschot en ontvangen geld blijven behouden', async () => {
  const h = harness(invoice);
  await h.add(input);
  assert.equal(h.invoice().totalsSnapshot.totaalInclBtw, 1627.26);
  assert.deepEqual(h.invoice().paymentSummary, { paidAmount: 200, openAmount: 1427.26, lastPaymentAt: 'BANK-DATE' });
  assert.deepEqual(h.invoice().financialAdjustments, invoice.financialAdjustments);
  assert.equal(h.invoice().status, 'gedeeltelijk_betaald');
  assert.equal(h.invoice().extraWork[0].description, 'Mondeling: extra plint');
  assert.equal(h.invoice().extraWork[0].amountExclBtw, 123.97);
  assert.equal(h.invoice().extraWork[0].vatAmount, 26.03);
  assert.equal('totaalExclBtw' in h.invoice().totalsSnapshot, false, 'geen onvolledig subtotaal aan oude facturen toevoegen');
  assert.equal('paymentSummary.paidAmount' in h.writes[0], false);
});

test('meerdere bedragen worden opgeteld, dezelfde bewaaractie wordt niet dubbel geboekt', async () => {
  const h = harness(invoice);
  await h.add(input);
  await h.add(input);
  await h.add({ ...input, id: 'extra-2', amountInclBtw: 10.01 });
  assert.equal(h.writes.length, 2);
  assert.equal(h.invoice().totalsSnapshot.totaalInclBtw, 1637.27);
  assert.equal(h.invoice().extraWork.length, 2);
  assert.equal(h.invoice().paymentSummary.openAmount, 1437.27);
});

test('gelijktijdige bankbetaling en ander meerwerk blijven bij transactieherhaling behouden', async () => {
  const concurrent = { ...invoice, status: 'betaald', paidAt: 'PAID',
    totalsSnapshot: { totaalInclBtw: 1527.26 },
    extraWork: [{ id: 'other', amountInclBtw: 50 }],
    paymentSummary: { paidAmount: 1527.26, openAmount: 0, lastPaymentAt: 'LATEST' } };
  const h = harness(invoice, concurrent);
  await h.add(input);
  assert.equal(h.invoice().totalsSnapshot.totaalInclBtw, 1677.26);
  assert.equal(h.invoice().extraWork.length, 2);
  assert.deepEqual(h.invoice().paymentSummary, { paidAmount: 1527.26, openAmount: 150, lastPaymentAt: 'LATEST' });
  assert.equal(h.invoice().status, 'gedeeltelijk_betaald');
  assert.equal('paidAt' in h.invoice(), false);
});

test('bekende BTW-bedragen worden aangevuld en overbetaling blijft beschikbaar', async () => {
  const h = harness({ ...invoice, status: 'betaald', paidAt: 'PAID',
    totalsSnapshot: { totaalInclBtw: 121, totaalExclBtw: 100, btw: 21 },
    paymentSummary: { paidAmount: 400, openAmount: 0 } });
  await h.add({ ...input, amountInclBtw: 109, vatRate: 9 });
  assert.deepEqual(h.invoice().totalsSnapshot, { totaalInclBtw: 230, totaalExclBtw: 200, btw: 30 });
  assert.equal(h.invoice().status, 'betaald');
  assert.equal(h.invoice().paidAt, 'PAID');
  assert.equal(h.invoice().paymentSummary.openAmount, 0);
  await h.add({ ...input, id: 'zero-vat', amountInclBtw: 10, vatRate: 0 });
  assert.equal(h.invoice().totalsSnapshot.btw, 30);
});

test('concepten blijven concept; annulering, verkeerde eigenaar en ongeldige invoer schrijven niets', async () => {
  const draft = harness({ ...invoice, status: 'concept', paymentSummary: { paidAmount: 0, openAmount: 1477.26 } });
  await draft.add(input);
  assert.equal(draft.invoice().status, 'concept');
  for (const current of [null, { ...invoice, userId: 'other' }, { ...invoice, status: 'geannuleerd' }]) {
    const h = harness(current);
    await assert.rejects(h.add(input));
    assert.equal(h.writes.length, 0);
  }
  for (const invalid of [{ amountInclBtw: -1 }, { amountInclBtw: 0 }, { amountInclBtw: NaN }, { amountInclBtw: Infinity }, { description: ' ' }, { description: 'x'.repeat(2001) }, { vatRate: 15 }, { id: '' }]) {
    const h = harness(invoice);
    await assert.rejects(h.add({ ...input, ...invalid }));
    assert.equal(h.writes.length, 0);
  }
});
