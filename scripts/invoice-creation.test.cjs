const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loader(overrides = {}) {
  const cache = new Map();
  function load(filename) {
    if (filename in overrides) return overrides[filename];
    if (!filename.startsWith('@/')) return require(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = fs.readFileSync(path.join(__dirname, '..', filename.replace('@/', 'src/') + '.ts'), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('require', 'module', 'exports', code)(load, module, module.exports);
    return module.exports;
  }
  return load;
}
const load = loader({
  'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => 'server-time' } },
  '@/lib/quote-calculations': { calculateQuoteTotals: (data) => data.totals, normalizeDataJson: (data) => data },
});
const { summarizeInvoiceBilling, invoiceBillingSignature } = load('@/lib/invoice-billing');
const { invoiceQuoteSignature } = load('@/lib/invoice-quote-signature');
const { createInvoiceAtomically } = load('@/lib/invoice-create-server');
const { resolveInvoiceTotal } = load('@/lib/invoice-total');
const advance = (id, total, status = 'verzonden', paid = 0) => ({ id, userId: 'owner', quoteId: 'quote', invoiceType: 'voorschot', status, invoiceNumberLabel: id, totalsSnapshot: { totaalInclBtw: total }, paymentSummary: { paidAmount: paid } });

test('een concept is herbruikbaar en telt niet als gefactureerd of ontvangen voorschot', () => {
  const result = summarizeInvoiceBilling([advance('draft', 500, 'concept', 500)]);
  assert.equal(result.existingAdvanceId, 'draft');
  assert.equal(result.billedAdvanceAmount, 0);
  assert.equal(result.receivedAdvanceAmount, 0);
});

test('werkelijk uitgereikte voorschotten worden opgeteld; archiveren verwijdert geen facturatie', () => {
  const result = summarizeInvoiceBilling([
    { ...advance('first', 3000, 'gedeeltelijk_betaald', 1000), archived: true },
    advance('second', 2000, 'verzonden'), advance('cancelled', 9999, 'geannuleerd', 9999),
  ]);
  assert.equal(result.billedAdvanceAmount, 5000);
  assert.equal(result.receivedAdvanceAmount, 1000);
  assert.equal(result.openAdvanceAmount, 4000);
  assert.equal(result.existingAdvanceId, null);
  assert.equal(result.ambiguity, null);
});

test('onduidelijke concepten en voorschotten voor meerdere offertes vragen controle', () => {
  assert.match(summarizeInvoiceBilling([advance('a', 50, 'concept'), advance('b', 50, 'concept')]).ambiguity, /meerdere/);
  assert.match(summarizeInvoiceBilling([advance('a', 50), advance('b', 50, 'concept')]).ambiguity, /meerdere/);
  assert.match(summarizeInvoiceBilling([{ ...advance('a', 100), combinedQuoteIds: ['quote', 'other'] }]).ambiguity, /meerdere offertes/);
});

test('meerwerkregels blijven een aparte factuur, een echte gecombineerde eindfactuur telt wel', () => {
  const supplementary = { ...advance('mw', 100), invoiceType: 'eind', combinedContext: { type: 'meerwerkbon_combined', meerwerkbonId: 'mw' } };
  assert.equal(summarizeInvoiceBilling([supplementary]).existingFinalId, null);
  assert.equal(summarizeInvoiceBilling([{ ...supplementary, combinedContext: { quoteIds: ['quote', 'other'] } }]).existingFinalId, 'mw');
});

test('een afgesproken nulprijs valt niet terug op een ouder positief offertebedrag', () => {
  assert.equal(resolveInvoiceTotal({ amount: 1000, financieel: { afgesprokenPrijsInclBtw: 0 } }, null), 0);
  assert.equal(resolveInvoiceTotal({ amount: 1000, financieel: { afgesprokenPrijsInclBtw: null } }, { totals: { totaalInclBtw: 1200 } }), 1200);
});

function harness({ rows = [], total = 12000, extra = {} } = {}) {
  const quote = { userId: 'owner', amount: total, financieel: { afgesprokenPrijsInclBtw: total }, facturatie: { voorschotPercentage: 50 }, klantinformatie: { voornaam: 'Test', achternaam: 'Klant' } };
  const documents = new Map(Object.entries({
    'quotes/quote': quote,
    'users/owner': { settings: { factuurNummerStart: 1, factuurNummerPrefix: '2026-' } },
    ...Object.fromEntries(rows.map(({ id, ...row }) => [`invoices/${id}`, row])), ...extra,
  }));
  let id = 0;
  let queue = Promise.resolve();
  const commits = [];
  const ref = (path) => ({ path, id: path.split('/').at(-1) });
  const snapshot = (reference) => ({ ...reference, ref: reference, exists: documents.has(reference.path), data: () => documents.get(reference.path) });
  const firestore = {
    doc: ref,
    collection(name) {
      return { doc: () => ref(`${name}/new-${++id}`), where: (_field, _op, uid) => ({ select: () => ({ collection: name, uid }) }) };
    },
    runTransaction(callback) {
      const current = queue.then(async () => {
        const writes = [];
        const tx = {
          async get(target) {
            if (target.collection) return { docs: [...documents.entries()].filter(([key, value]) => key.startsWith(target.collection + '/') && value.userId === target.uid).map(([key]) => snapshot(ref(key))) };
            return snapshot(target);
          },
          set(reference, fields, options) { writes.push({ path: reference.path, fields, merge: !!options?.merge }); },
          update(reference, fields) { writes.push({ path: reference.path, fields, merge: true }); },
        };
        const result = await callback(tx);
        for (const write of writes) {
          documents.set(write.path, write.merge ? { ...documents.get(write.path), ...write.fields } : write.fields);
        }
        commits.push(writes);
        return result;
      });
      queue = current.catch(() => {});
      return current;
    },
  };
  const params = {
    userId: 'owner', quoteId: 'quote', quote, settings: {}, invoiceType: 'eind', originalTotalInclBtw: total,
    totalsInclBtw: total - summarizeInvoiceBilling(rows).billedAdvanceAmount,
    expectedQuoteSignature: invoiceQuoteSignature(quote), expectedBillingSignature: invoiceBillingSignature(rows),
  };
  return { firestore, documents, commits, params, quote };
}

test('eindfactuur trekt de bestaande €5000 af van gewijzigd totaal €12000, niet opnieuw 50%', async () => {
  const h = harness({ rows: [advance('first', 5000, 'gedeeltelijk_betaald', 2000)] });
  const id = await createInvoiceAtomically(h.firestore, 'owner', h.params, null);
  const invoice = h.documents.get(`invoices/${id}`);
  assert.equal(invoice.totalsSnapshot.totaalInclBtw, 7000);
  assert.equal(invoice.financialAdjustments.voorschotAftrekInclBtw, 5000);
  assert.equal(invoice.financialAdjustments.voorschotFactuur.paidAmount, 2000);
  assert.equal(invoice.status, 'concept');
  assert.equal(h.commits[0].filter((write) => write.path.startsWith('invoices/')).length, 1);
  assert.equal(h.documents.get('counters/invoiceNumber_owner').next, 2);
});

test('afwijkend bedrag of verouderde factuurcontrole schrijft geen factuur of nummer', async () => {
  const h = harness({ rows: [advance('first', 5000)] });
  await assert.rejects(createInvoiceAtomically(h.firestore, 'owner', { ...h.params, totalsInclBtw: 6000 }, null), /eindbedrag klopt niet/);
  await assert.rejects(createInvoiceAtomically(h.firestore, 'owner', { ...h.params, expectedBillingSignature: 'old' }, null), /facturen zijn gewijzigd/);
  await assert.rejects(createInvoiceAtomically(h.firestore, 'owner', { ...h.params, expectedQuoteSignature: 'old' }, null), /offerte is gewijzigd/);
  assert.equal(h.documents.has('counters/invoiceNumber_owner'), false);
});

test('twee gelijktijdige verzoeken hergebruiken dezelfde termijn en reserveren één nummer', async () => {
  const h = harness();
  const results = await Promise.all([
    createInvoiceAtomically(h.firestore, 'owner', h.params, null),
    createInvoiceAtomically(h.firestore, 'owner', h.params, null),
  ]);
  assert.equal(results[0], results[1]);
  assert.equal(h.documents.get('counters/invoiceNumber_owner').next, 2);
  assert.equal([...h.documents.keys()].filter((key) => key.startsWith('invoices/')).length, 1);
});

test('bestaand concept hergebruiken reserveert niets; geannuleerd concept kan worden vervangen', async () => {
  const draft = { ...advance('draft', 12000, 'concept'), invoiceType: 'eind' };
  const h = harness({ rows: [draft] });
  assert.equal(await createInvoiceAtomically(h.firestore, 'owner', h.params, null), 'draft');
  assert.equal(h.documents.has('counters/invoiceNumber_owner'), false);
  h.documents.get('invoices/draft').status = 'geannuleerd';
  h.params.expectedBillingSignature = invoiceBillingSignature([{ ...draft, status: 'geannuleerd' }]);
  const id = await createInvoiceAtomically(h.firestore, 'owner', h.params, null);
  assert.notEqual(id, 'draft');
  assert.equal(h.documents.get('counters/invoiceNumber_owner').next, 2);
});

test('een open voorschotconcept wordt niet stilzwijgend verrekend of naast een eindfactuur uitgegeven', async () => {
  const h = harness({ rows: [advance('draft', 6000, 'concept')] });
  await assert.rejects(createInvoiceAtomically(h.firestore, 'owner', h.params, null), /voorschotconcept/);
  const advanceParams = { ...h.params, invoiceType: 'voorschot', totalsInclBtw: 6000 };
  assert.equal(await createInvoiceAtomically(h.firestore, 'owner', advanceParams, null), 'draft');
});

test('handmatig eindbedrag houdt echte voorschotverrekening en vereist een reden', async () => {
  const h = harness({ rows: [advance('first', 5000)] });
  const input = { ...h.params, handmatigEindbedrag: true, totalsInclBtw: 6500 };
  await assert.rejects(createInvoiceAtomically(h.firestore, 'owner', input, null), /reden/);
  const id = await createInvoiceAtomically(h.firestore, 'owner', { ...input, opmerking: 'Afgesproken korting' }, null);
  assert.equal(h.documents.get(`invoices/${id}`).financialAdjustments.voorschotAftrekInclBtw, 5000);
});

test('offerte in echte gecombineerde eindfactuur kan niet nogmaals afzonderlijk worden gefactureerd', async () => {
  const combined = { ...advance('combined', 16000), invoiceType: 'eind', quoteId: 'other', combinedQuoteIds: ['quote', 'other'] };
  const h = harness({ rows: [combined] });
  assert.equal(await createInvoiceAtomically(h.firestore, 'owner', h.params, null), 'combined');
  assert.equal(h.documents.has('counters/invoiceNumber_owner'), false);
});

test('meerwerkbon blijft apart van hoofdfactuur en voorschot, met controle van alle eigenaren', async () => {
  const h = harness({ rows: [advance('advance', 5000), { ...advance('final', 7000), invoiceType: 'eind' }], extra: {
    'meerwerkbonnen/mw': { userId: 'owner', primaryQuoteId: 'quote', linkedQuoteIds: ['other'], totals: { totaalInclBtw: 200 }, status: 'akkoord', numbering: { label: 'MW1' } },
    'quotes/other': { userId: 'owner', amount: 400 },
  } });
  const input = { ...h.params, originalTotalInclBtw: 200, totalsInclBtw: 200, combinedContext: { type: 'meerwerkbon_combined', meerwerkbonId: 'mw' } };
  const id = await createInvoiceAtomically(h.firestore, 'owner', input, null);
  const invoice = h.documents.get(`invoices/${id}`);
  assert.equal(invoice.totalsSnapshot.totaalInclBtw, 200);
  assert.equal(invoice.financialAdjustments.voorschotAftrekInclBtw, 0);
  assert.deepEqual(invoice.combinedQuoteIds, ['quote', 'other']);
  assert.equal(await createInvoiceAtomically(h.firestore, 'owner', input, null), id);
});

test('offerte van een andere gebruiker en verlaagde offerte onder al gefactureerd bedrag worden geweigerd', async () => {
  const h = harness({ total: 1000, rows: [advance('first', 1500)] });
  await assert.rejects(createInvoiceAtomically(h.firestore, 'owner', h.params, null), /hoger dan/);
  h.quote.userId = 'someone-else';
  await assert.rejects(createInvoiceAtomically(h.firestore, 'owner', h.params, null), /niet gevonden/);
});

test('meerdere verzonden voorschotten leveren één vaste aftrek met afzonderlijke bronsnapshots', async () => {
  const h = harness({ rows: [advance('a', 3000, 'betaald', 3000), advance('b', 2000)] });
  const id = await createInvoiceAtomically(h.firestore, 'owner', h.params, null);
  const invoice = h.documents.get(`invoices/${id}`);
  assert.equal(invoice.totalsSnapshot.totaalInclBtw, 7000);
  assert.equal(invoice.financialAdjustments.voorschotFacturen.length, 2);
});

test('een factuur bewaart de gecontroleerde berekeninstellingen en vertrouwde klantgegevens', async () => {
  const h = harness();
  h.quote.instellingen = { btwTarief: 9, uurTariefExclBtw: 80 };
  h.params.expectedQuoteSignature = invoiceQuoteSignature(h.quote);
  const input = { ...h.params, quote: { klantinformatie: { voornaam: 'Onjuist' } }, settings: { factuurNummerPrefix: 'FOUT-', factuurNummerStart: 999 } };
  const id = await createInvoiceAtomically(h.firestore, 'owner', input, { instellingen: { btwTarief: 21, uurTariefExclBtw: 50 }, totals: { totaalInclBtw: 9000 } });
  const invoice = h.documents.get(`invoices/${id}`);
  assert.equal(invoice.invoiceSnapshotVersion, 1);
  assert.equal(invoice.invoiceNumberLabel, '2026-1');
  assert.equal(invoice.sourceQuote.klantSnapshot.naam, 'Test Klant');
  assert.equal(invoice.calculationSnapshot.instellingen.btwTarief, 9);
  assert.equal(invoice.calculationSnapshot.instellingen.uurTariefExclBtw, 80);
  assert.equal(invoice.calculationSnapshot.urenPerDag, 8);
});

test('nummering gebruikt bestaande teller, anders de ingestelde start inclusief nul', async () => {
  const h = harness({ extra: { 'counters/invoiceNumber_owner': { userId: 'owner', next: 123 } } });
  const id = await createInvoiceAtomically(h.firestore, 'owner', h.params, null);
  assert.equal(h.documents.get(`invoices/${id}`).invoiceNumberLabel, '2026-123');
  assert.equal(h.documents.get('counters/invoiceNumber_owner').next, 124);
  const zero = harness();
  zero.documents.get('users/owner').settings.factuurNummerStart = 0;
  const zeroId = await createInvoiceAtomically(zero.firestore, 'owner', zero.params, null);
  assert.equal(zero.documents.get(`invoices/${zeroId}`).invoiceNumberLabel, '2026-0');
});

test('create API weigert ontbrekende auth voordat Firebase wordt gestart', async () => {
  let initialized = 0;
  const route = loader({
    '@/firebase/admin': { initFirebaseAdmin: () => { initialized += 1; throw new Error('not configured'); } },
    '@/lib/supabase-admin': {},
    '@/lib/invoice-create-server': load('@/lib/invoice-create-server'),
    '@/lib/demo-trial-server': { ensureDemoTrialActiveByUid: async () => null },
  })('@/app/api/facturen/create/route');
  const response = await route.POST(new Request('https://app.test/api/facturen/create', { method: 'POST', body: '{}' }));
  assert.equal(response.status, 401);
  assert.equal(initialized, 0);
});

test('create API verwerpt ongeldige gecombineerde context; hiermee kan actuele calculatie niet worden overgeslagen', async () => {
  let reads = 0;
  const route = loader({
    '@/firebase/admin': { initFirebaseAdmin: () => ({ auth: { verifyIdToken: async () => ({ uid: 'owner' }) }, firestore: { doc: () => { reads += 1; throw new Error('unexpected read'); } } }) },
    '@/lib/supabase-admin': {},
    '@/lib/invoice-create-server': load('@/lib/invoice-create-server'),
    '@/lib/demo-trial-server': { ensureDemoTrialActiveByUid: async () => null },
  })('@/app/api/facturen/create/route');
  for (const context of [{}, { type: 'unsupported', meerwerkbonId: 'mw' }, 'anything', { type: 'meerwerkbon_combined' }]) {
    const response = await route.POST(new Request('https://app.test/api/facturen/create', { method: 'POST', headers: { Authorization: 'Bearer token' }, body: JSON.stringify({ quoteId: 'quote', invoiceType: 'eind', combinedContext: context }) }));
    assert.equal(response.status, 400);
  }
  assert.equal(reads, 0);
});
