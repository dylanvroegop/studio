const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadSource(filename, dependencies = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)((name) => {
    if (name in dependencies) return dependencies[name];
    if (['@/lib/invoice-billing', '@/lib/invoice-quote-signature'].includes(name)) return loadSource(name.replace('@/', 'src/') + '.ts');
    if (name === 'firebase/auth') return {};
    throw new Error(`Onverwachte dependency: ${name}`);
  }, module, module.exports);
  return module.exports;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('factuurvoorbereiding start alle onafhankelijke reads vóór de eerste response', async (t) => {
  const pendingUser = deferred();
  const pendingQuote = deferred();
  const pendingCalculation = deferred();
  const pendingAdvance = deferred();
  const calls = [];
  t.mock.method(global, 'fetch', async (_url, options) => {
    calls.push('calculation');
    assert.deepEqual(JSON.parse(options.body), {
      quoteId: 'quote-60', latestOnly: true, preferCompletedFallback: true,
    });
    await pendingCalculation.promise;
    return { ok: true, json: async () => ({ ok: true, row: { data_json: { total: 123 } } }) };
  });
  const { loadInvoicePreparation } = loadSource('src/lib/invoice-preparation.ts', {
    'firebase/firestore': {
      doc: (_db, collection) => collection,
      getDoc: (collection) => {
        calls.push(collection);
        return collection === 'users' ? pendingUser.promise : pendingQuote.promise;
      },
    },
    '@/lib/invoice-actions': {
      loadQuoteInvoiceBilling: () => { calls.push('advance'); return pendingAdvance.promise; },
    },
  });
  let finished = false;
  const loading = loadInvoicePreparation({}, { uid: 'owner', getIdToken: async () => 'token' }, 'quote-60')
    .then((data) => { finished = true; return data; });
  await Promise.resolve();
  assert.deepEqual(new Set(calls), new Set(['users', 'quotes', 'advance', 'calculation']));
  pendingCalculation.resolve();
  pendingQuote.resolve({ id: 'quote-60' });
  pendingUser.resolve({ id: 'owner' });
  await Promise.resolve();
  assert.equal(finished, false, 'voorschotcontrole moet klaar zijn vóór aanmaken mogelijk is');
  pendingAdvance.resolve([{ id: 'advance-60', invoiceType: 'voorschot', status: 'concept', totalsSnapshot: { totaalInclBtw: 50 } }]);
  const result = await loading;
  assert.equal(result.existingVoorschotId, 'advance-60');
  assert.equal(result.calculationSnapshot.total, 123);
});

test('mislukte voorschotcontrole wordt niet behandeld als geen voorschot', async (t) => {
  t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ ok: true, row: null }) }));
  const { loadInvoicePreparation } = loadSource('src/lib/invoice-preparation.ts', {
    'firebase/firestore': { doc: () => ({}), getDoc: async () => ({}) },
    '@/lib/invoice-actions': { loadQuoteInvoiceBilling: async () => { throw new Error('offline'); } },
  });
  await assert.rejects(loadInvoicePreparation({}, { uid: 'owner', getIdToken: async () => 'token' }, 'quote'), /offline/);
});

function preparationSaveHarness(currentQuote) {
  const writes = [];
  let transactions = 0;
  const preparation = loadSource('src/lib/invoice-preparation.ts', {
    'firebase/firestore': {
      doc: (_db, collection, id) => `${collection}/${id}`,
      serverTimestamp: () => 'server-time',
      runTransaction: async (_db, callback) => {
        transactions += 1;
        return callback({
          get: async () => ({ exists: () => currentQuote !== null, data: () => currentQuote }),
          update: (ref, fields) => { writes.push({ ref, fields }); },
        });
      },
    },
    '@/lib/invoice-actions': {},
  });
  return { ...preparation, writes, transactions: () => transactions };
}

test('uitgestelde boekhouding schrijft één keer bij een ongewijzigde offerte en niets zonder wijzigingen', async () => {
  const expectedQuote = { amount: 100, financieel: {}, instellingen: { btwTarief: 21 } };
  const harness = preparationSaveHarness(expectedQuote);
  await harness.saveInvoicePreparation({}, 'quote', null);
  assert.equal(harness.transactions(), 0);
  await harness.saveInvoicePreparation({}, 'quote', {
    expectedQuote,
    updates: { amount: 121, totaalbedrag: 121, 'financieel.oorspronkelijkePrijsInclBtw': 121 },
  });
  assert.deepEqual(harness.writes, [{
    ref: 'quotes/quote',
    fields: { amount: 121, totaalbedrag: 121, 'financieel.oorspronkelijkePrijsInclBtw': 121, updatedAt: 'server-time' },
  }]);
});

test('een inmiddels opgeslagen oorspronkelijke prijs en prijshistorie blijven behouden', async () => {
  const expectedQuote = { amount: 121, financieel: {} };
  const harness = preparationSaveHarness({
    amount: 121,
    financieel: { oorspronkelijkePrijsInclBtw: 99, prijswijzigingen: [{ bedrag: 22 }] },
  });
  await harness.saveInvoicePreparation({}, 'quote', {
    expectedQuote,
    updates: { 'financieel.oorspronkelijkePrijsInclBtw': 121 },
  });
  assert.deepEqual(harness.writes, []);
});

test('nieuwe bedragen, afgesproken prijs of calculatie-invoer blokkeren een verouderde factuur zonder writes', async () => {
  const expectedQuote = {
    amount: 100, totaalbedrag: 100, financieel: {}, instellingen: { btwTarief: 21 },
  };
  for (const change of [
    { amount: 200 },
    { totaalbedrag: 200 },
    { financieel: { afgesprokenPrijsInclBtw: 200 } },
    { instellingen: { btwTarief: 9 } },
    { calculationSnapshot: { materiaal: 200 } },
  ]) {
    const harness = preparationSaveHarness({ ...expectedQuote, ...change });
    await assert.rejects(harness.saveInvoicePreparation({}, 'quote', {
      expectedQuote,
      updates: { amount: 121, totaalbedrag: 121, 'financieel.oorspronkelijkePrijsInclBtw': 121 },
    }), harness.InvoicePreparationConflictError);
    assert.deepEqual(harness.writes, []);
  }
});

test('onafhankelijke notities en veldvolgorde veroorzaken geen onnodig prijsconflict', async () => {
  const expectedQuote = { amount: 121, instellingen: { btwTarief: 21, uurTarief: 60 } };
  const harness = preparationSaveHarness({
    amount: 121, instellingen: { uurTarief: 60, btwTarief: 21 }, notes: 'Nieuwe notitie',
  });
  await harness.saveInvoicePreparation({}, 'quote', {
    expectedQuote,
    updates: { 'financieel.oorspronkelijkePrijsInclBtw': 121 },
  });
  assert.equal(harness.writes.length, 1);
  assert.deepEqual(Object.keys(harness.writes[0].fields), ['financieel.oorspronkelijkePrijsInclBtw', 'updatedAt']);
});

test('voorschot wordt gevonden na de eerste 50 facturen en geannuleerde/andere facturen tellen niet mee', async () => {
  const invoices = Array.from({ length: 60 }, (_, i) => ({
    id: `other-${i}`, userId: 'owner', quoteId: `other-${i}`, invoiceType: 'eind', status: 'concept',
  }));
  invoices.push(
    { id: 'cancelled', userId: 'owner', quoteId: 'target', invoiceType: 'voorschot', status: 'geannuleerd' },
    { id: 'other-owner', userId: 'other', quoteId: 'target', invoiceType: 'voorschot', status: 'concept' },
    { id: 'final', userId: 'owner', quoteId: 'target', invoiceType: 'eind', status: 'concept' },
    { id: 'advance', userId: 'owner', quoteId: 'target', invoiceType: 'voorschot', status: 'concept' },
  );
  let readCount = 0;
  const { findExistingVoorschotInvoiceId } = loadSource('src/lib/invoice-actions.ts', {
    'firebase/firestore': {
      collection: () => 'invoices',
      where: (field, _operator, value) => ({ field, value }),
      limit: (count) => ({ count }),
      query: (_collection, ...filters) => filters,
      getDocs: async (filters) => {
        let result = invoices;
        filters.forEach((filter) => {
          result = filter.count ? result.slice(0, filter.count) : result.filter((item) => item[filter.field] === filter.value);
        });
        readCount = result.length;
        return { empty: result.length === 0, docs: result.map((row) => ({ id: row.id, data: () => row })) };
      },
    },
    '@/lib/firestore-actions': {},
    '@/lib/utils': {},
  });
  assert.equal(await findExistingVoorschotInvoiceId({}, { userId: 'owner', quoteId: 'target' }), 'advance');
  assert.equal(readCount, 2, 'alleen voorschotfacturen van deze offerte mogen worden opgehaald');
});

test('afbeeldingscache deelt lopende requests, is tijdelijk/begrensd en herstelt na fouten', async (t) => {
  let count = 0;
  let now = 0;
  let fail = false;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(global, 'fetch', async () => {
    count += 1;
    if (fail) throw new Error('offline');
    return { ok: true, json: async () => ({ dataUrl: `data:image/png;base64,${count}` }) };
  });
  const { loadPdfImage } = loadSource('src/lib/pdf-image-cache.ts');
  const first = loadPdfImage('https://storage/logo?token=one');
  assert.equal(loadPdfImage('https://storage/logo?token=one'), first);
  await first;
  await loadPdfImage('https://storage/logo?token=two');
  assert.equal(count, 2, 'volledige URL inclusief token is de cache key');
  now = 5 * 60 * 1000 + 1;
  await loadPdfImage('https://storage/logo?token=one');
  assert.equal(count, 3, 'een logo met dezelfde URL kan opnieuw worden bijgewerkt');
  fail = true;
  await assert.rejects(loadPdfImage('failed'), /offline/);
  fail = false;
  await loadPdfImage('failed');
  assert.equal(count, 5);
  for (let i = 0; i < 8; i += 1) await loadPdfImage(`image-${i}`);
  await loadPdfImage('https://storage/logo?token=one');
  assert.equal(count, 14, 'oude afbeeldingen worden uit de begrensde cache verwijderd');
});

test('preview en download delen PDF; gewijzigde factuur krijgt direct een nieuwe PDF', async () => {
  let generated = 0;
  let fail = false;
  const { getInvoicePdfBlob } = loadSource('src/lib/invoice-pdf-client.ts', {
    '@/lib/generate-invoice-pdf': {
      generateInvoicePDF: async (data) => {
        generated += 1;
        if (fail) throw new Error('PDF fout');
        return new Blob([JSON.stringify(data)]);
      },
    },
  });
  const data = { invoiceNumberLabel: '460001', totals: { totaalInclBtw: 121 } };
  const preview = getInvoicePdfBlob(data);
  assert.equal(getInvoicePdfBlob({ ...data }), preview);
  assert.equal(await getInvoicePdfBlob(data), await preview);
  assert.equal(generated, 1);
  await getInvoicePdfBlob({ ...data, totals: { totaalInclBtw: 242 } });
  assert.equal(generated, 2);
  fail = true;
  await assert.rejects(getInvoicePdfBlob({ ...data, invoiceNumberLabel: 'failed' }), /PDF fout/);
  fail = false;
  await getInvoicePdfBlob({ ...data, invoiceNumberLabel: 'failed' });
  assert.equal(generated, 4);
});
