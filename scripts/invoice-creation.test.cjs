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

test('browser en Admin timestamps geven dezelfde offertecontrole, echte wijzigingen blijven zichtbaar', () => {
  const { Timestamp: ClientTimestamp } = require('firebase/firestore');
  const { Timestamp: AdminTimestamp } = require('firebase-admin/firestore');
  const quote = (Timestamp, nanos = 873000000) => ({
    amount: 2210.96,
    klantinformatie: { voornaam: 'Test', updatedAt: new Timestamp(1775653868, nanos) },
    extras: [{ updatedAt: new Timestamp(1775653868, nanos) }],
  });
  const browser = invoiceQuoteSignature(quote(ClientTimestamp));
  assert.equal(browser, invoiceQuoteSignature(quote(AdminTimestamp)));
  assert.notEqual(browser, invoiceQuoteSignature(quote(AdminTimestamp, 873000001)));
  assert.notEqual(browser, invoiceQuoteSignature({ ...quote(AdminTimestamp), amount: 2300 }));
  const changedCustomer = quote(AdminTimestamp);
  changedCustomer.klantinformatie.voornaam = 'Andere klant';
  assert.notEqual(browser, invoiceQuoteSignature(changedCustomer));
});

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
    '@/lib/invoice-bank-payments': { InvoiceBankError: class extends Error {} },
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
    '@/lib/invoice-bank-payments': { InvoiceBankError: class extends Error {} },
    '@/lib/invoice-create-server': load('@/lib/invoice-create-server'),
    '@/lib/demo-trial-server': { ensureDemoTrialActiveByUid: async () => null },
  })('@/app/api/facturen/create/route');
  for (const context of [{}, { type: 'unsupported', meerwerkbonId: 'mw' }, 'anything', { type: 'meerwerkbon_combined' }]) {
    const response = await route.POST(new Request('https://app.test/api/facturen/create', { method: 'POST', headers: { Authorization: 'Bearer token' }, body: JSON.stringify({ quoteId: 'quote', invoiceType: 'eind', combinedContext: context }) }));
    assert.equal(response.status, 400);
  }
  assert.equal(reads, 0);
});

const sharedSnapshot = (overrides = {}) => ({ id: 'pdf-957', quoteId: 'quote', amountCents: 95700, currency: 'EUR', fileName: 'Offerte.pdf', sharedAt: '2026-11-03T10:00:00.000Z', ...overrides });
function withShared(h, snapshot = sharedSnapshot()) {
  h.quote.whatsappQuoteSnapshot = snapshot;
  h.params.expectedQuoteSignature = invoiceQuoteSignature(h.quote);
  return h;
}

test('€984,94 tegenover gedeelde €957 wordt geblokkeerd vóór factuur en nummer; voorschot telt mee', async () => {
  const h = withShared(harness({ total: 984.94, rows: [advance('first', 478.50, 'betaald', 478.50)] }));
  assert.equal(h.params.totalsInclBtw, 506.44000000000005);
  await assert.rejects(createInvoiceAtomically(h.firestore, 'owner', h.params, null), /via WhatsApp gedeelde offerte/);
  assert.equal(h.commits.length, 0);
  assert.equal(h.documents.has('counters/invoiceNumber_owner'), false);
});

test('expliciet ja legt exact bevestigd verschil van €27,94 vast in de nieuwe factuur', async () => {
  const h = withShared(harness({ total: 984.94, rows: [advance('first', 478.50)] }));
  const sharedQuoteAmountConfirmation = { snapshotId: 'pdf-957', sharedAmountCents: 95700, invoiceTotalCents: 98494 };
  const id = await createInvoiceAtomically(h.firestore, 'owner', { ...h.params, sharedQuoteAmountConfirmation }, null);
  const invoice = h.documents.get(`invoices/${id}`);
  assert.equal(invoice.totalsSnapshot.totaalInclBtw, 506.44);
  assert.deepEqual(invoice.sharedQuoteAmountCheck, { ...sharedQuoteAmountConfirmation, differenceCents: 2794, confirmedDifference: true, checkedAt: 'server-time', checkedBy: 'owner' });
});

test('aanpassen naar €478,50 + voorschot €478,50 klopt met €957 en vereist geen afwijkingsakkoord', async () => {
  const h = withShared(harness({ total: 984.94, rows: [advance('first', 478.50)] }));
  const id = await createInvoiceAtomically(h.firestore, 'owner', { ...h.params, totalsInclBtw: 478.50, handmatigEindbedrag: true, opmerking: 'Volgens gedeelde offerte' }, null);
  const invoice = h.documents.get(`invoices/${id}`);
  assert.equal(invoice.totalsSnapshot.totaalInclBtw, 478.50);
  assert.equal(invoice.sharedQuoteAmountCheck.differenceCents, 0);
  assert.equal(invoice.sharedQuoteAmountCheck.confirmedDifference, false);
});

test('oude bevestiging is ongeldig na gewijzigde PDF of gewijzigd bedrag; ook verlaging vraagt akkoord', async () => {
  for (const confirmation of [undefined,
    { snapshotId: 'old-pdf', sharedAmountCents: 95700, invoiceTotalCents: 90000 },
    { snapshotId: 'pdf-957', sharedAmountCents: 95700, invoiceTotalCents: 98494 },
    { snapshotId: 'pdf-957', sharedAmountCents: 99900, invoiceTotalCents: 90000 },
  ]) {
    const h = withShared(harness({ total: 900 }));
    await assert.rejects(createInvoiceAtomically(h.firestore, 'owner', { ...h.params, sharedQuoteAmountConfirmation: confirmation }, null), /via WhatsApp gedeelde offerte/);
    assert.equal(h.commits.length, 0);
  }
});

test('gelijke prijs, ontbrekende historische snapshot en voorschot worden niet als afwijkend eindtotaal behandeld', async () => {
  const equal = withShared(harness({ total: 957, rows: [advance('first', 478.50)] }));
  const equalId = await createInvoiceAtomically(equal.firestore, 'owner', equal.params, null);
  assert.equal(equal.documents.get(`invoices/${equalId}`).sharedQuoteAmountCheck.differenceCents, 0);
  const old = harness({ total: 957 });
  const oldId = await createInvoiceAtomically(old.firestore, 'owner', old.params, null);
  assert.equal(old.documents.get(`invoices/${oldId}`).sharedQuoteAmountCheck, undefined);
  const pre = withShared(harness({ total: 984.94 }));
  const preId = await createInvoiceAtomically(pre.firestore, 'owner', { ...pre.params, invoiceType: 'voorschot', totalsInclBtw: 492.47 }, null);
  assert.equal(pre.documents.get(`invoices/${preId}`).sharedQuoteAmountCheck, undefined);
});

test('nieuwe gedeelde PDF maakt eerder geladen factuurcontrole ongeldig', async () => {
  const h = withShared(harness({ total: 957 }));
  h.quote.whatsappQuoteSnapshot = sharedSnapshot({ id: 'new-pdf' });
  await assert.rejects(createInvoiceAtomically(h.firestore, 'owner', h.params, null), /offerte is gewijzigd/);
  assert.equal(h.commits.length, 0);
});

const workLine = { id: 'arbeid', type: 'vrije_post', omschrijving: 'Montage rooster', eenheid: 'uur', aantal: 2, prijsPerEenheidExclBtw: 50, btwTarief: 9 };
const materialLine = { ...workLine, id: 'rooster', type: 'materiaal', omschrijving: 'Rooster', eenheid: 'stuk', aantal: 1, prijsPerEenheidExclBtw: 20, btwTarief: 21 };
function workOrder(mode) {
  const bon = { userId: 'owner', primaryQuoteId: 'quote', linkedQuoteIds: ['quote', 'other'], status: 'akkoord',
    pricingMode: mode, numbering: { label: '260504-MW01' }, geschatteArbeidsuren: 2, lineItems: [workLine, materialLine],
    totals: { totaalInclBtw: 133.2 }, opmerking: 'Extra ventilatie' };
  const h = harness({ rows: [advance('advance', 5000), { ...advance('paid', 7000, 'betaald'), invoiceType: 'eind' }],
    extra: { 'meerwerkbonnen/mw': bon } });
  const input = { ...h.params, combinedContext: { type: 'meerwerkbon_only', meerwerkbonId: 'mw' },
    meerwerkbonPricingMode: mode, originalTotalInclBtw: 133.2, totalsInclBtw: 133.2 };
  return { h, bon, input };
}

test('aparte meerwerkfactuur bevriest alleen bonregels, ook na de eindfactuur', async () => {
  const { h, input } = workOrder('begroot');
  const create = () => createInvoiceAtomically(h.firestore, 'owner', { ...input, actualLineItems: [] }, null);
  const [id, retry] = await Promise.all([create(), create()]);
  assert.equal(id, retry);
  const invoice = h.documents.get(`invoices/${id}`);
  assert.equal(invoice.status, 'concept');
  assert.deepEqual(invoice.totalsSnapshot, { totaalInclBtw: 133.2, totaalExclBtw: 120, btw: 13.2 });
  assert.equal(invoice.sourceQuote.titel, 'Extra ventilatie');
  assert.equal(invoice.meerwerkbonRegels.length, 2);
  assert.equal(invoice.financialAdjustments.voorschotAftrekInclBtw, 0);
  assert.equal(h.documents.get('meerwerkbonnen/mw').invoiceLink.invoiceId, id);
  assert.equal(h.documents.get('counters/invoiceNumber_owner').next, 2);
  assert.equal(h.commits.flat().some(write => write.path.startsWith('quotes/')), false);
  assert.equal(summarizeInvoiceBilling([{ ...invoice, id }]).existingFinalId, null);
  const combinedRetry = { ...input, combinedContext: { type: 'meerwerkbon_combined', meerwerkbonId: 'mw' } };
  assert.equal(await createInvoiceAtomically(h.firestore, 'owner', combinedRetry, null), id);
});

test('nacalculatie gebruikt uitsluitend bevestigde aantallen en rekent btw per regel', async () => {
  for (const mode of ['uren_nacalculatie', 'uren_materialen_nacalculatie']) {
    const { h, bon, input } = workOrder(mode);
    await assert.rejects(createInvoiceAtomically(h.firestore, 'owner', input, null), /factuurregels/);
    assert.equal(h.commits.length, 0);
    const actuals = [{ ...workLine, aantal: 3, totaalInclBtw: 999 }, { ...materialLine, aantal: 2 }];
    const id = await createInvoiceAtomically(h.firestore, 'owner', {
      ...input, originalTotalInclBtw: 211.9, totalsInclBtw: 211.9, actualLineItems: actuals,
    }, null);
    const invoice = h.documents.get(`invoices/${id}`);
    assert.equal(bon.lineItems[0].aantal, 2);
    assert.deepEqual(invoice.meerwerkbonRegels.map(row => row.totaalInclBtw), [163.5, 48.4]);
    assert.deepEqual(invoice.totalsSnapshot, { totaalInclBtw: 211.9, totaalExclBtw: 190, btw: 21.9 });
  }
});

test('losse Knab-voorschotten worden atomair verrekend en blijven apart van betalingen op de eindfactuur', async () => {
  const h = harness({ total: 2000 });
  const credits = [60000, 44747].map((amountCents, i) => ({ id: 'tx' + i, key: 'key' + i, amountCents,
    bookingDate: '2026-10-27', currency: 'EUR', name: 'KNAB', description: '260493' }));
  const input = { ...h.params, totalsInclBtw: 952.53, bankAdvanceSelection: credits.map((row) => ({ transactionId: row.id, amountCents: row.amountCents })) };
  await assert.rejects(createInvoiceAtomically(h.firestore, 'owner', input, null, [credits[0]]), /gewijzigd/);
  assert.equal(h.commits.length, 0);
  const path = 'users/owner/invoiceBankAllocations/key1';
  h.documents.set(path, { allocations: [{ invoiceId: 'another', amountCents: 44747, mode: 'add' }] });
  await assert.rejects(createInvoiceAtomically(h.firestore, 'owner', input, null, credits), /inmiddels gekoppeld/);
  assert.equal(h.commits.length, 0);
  h.documents.delete(path);
  const id = await createInvoiceAtomically(h.firestore, 'owner', input, null, credits);
  const final = h.documents.get('invoices/' + id);
  assert.equal(final.financialAdjustments.voorschotAftrekInclBtw, 1047.47);
  assert.equal(final.financialAdjustments.bankVoorschotten.length, 2);
  assert.deepEqual(final.paymentSummary, { paidAmount: 0, openAmount: 952.53 });
  assert.deepEqual(h.documents.get(path).allocations, [{ invoiceId: id, amountCents: 44747, mode: 'advance' }]);
  assert.equal(await createInvoiceAtomically(h.firestore, 'owner', input, null, []), id);
});

test('bankselectie kan een al gefactureerd voorschot niet dubbel aftrekken', async () => {
  const h = harness({ rows: [advance('advance', 500, 'betaald', 500)] });
  const input = { ...h.params, bankAdvanceSelection: [{ transactionId: 'tx', amountCents: 50000 }] };
  await assert.rejects(createInvoiceAtomically(h.firestore, 'owner', input, null), /bestaande voorschotfactuur/);
  assert.equal(h.commits.length, 0);
});

test('eindfactuur en voorschot bewaren de juiste ISDE-gegevens in de PDF-notities', async () => {
  const { emptySubsidyMeasure } = load('@/lib/invoice-subsidy');
  const subsidy = [{
    ...emptySubsidyMeasure(), material: 'Knauf Naturoll 037 140 mm',
    application: 'Dakisolatie', code: 'ka18226', area: '24,5', plannedArea: '26',
    thickness: '140', insulationValue: '3,75', purchaseDate: '2026-11-15',
    installationDate: '2026-11-19', amount: '1250',
  }];

  const final = harness();
  const finalId = await createInvoiceAtomically(final.firestore, 'owner', { ...final.params, subsidy }, null);
  const finalNotes = final.documents.get(`invoices/${finalId}`).notes;
  assert.match(finalNotes, /RVO-meldcode: KA18226/);
  assert.match(finalNotes, /Aangebracht in bestaande woning \(m²\): 24,5/);
  assert.match(finalNotes, /Installatiedatum: 19-11-2026/);
  assert.doesNotMatch(finalNotes, /Gepland/);

  const advanceInvoice = harness();
  const advanceId = await createInvoiceAtomically(advanceInvoice.firestore, 'owner', {
    ...advanceInvoice.params, invoiceType: 'voorschot', totalsInclBtw: 6000, subsidy,
  }, null);
  const advanceNotes = advanceInvoice.documents.get(`invoices/${advanceId}`).notes;
  assert.match(advanceNotes, /RVO-meldcode: KA18226/);
  assert.match(advanceNotes, /Gepland voor bestaande woning \(m²\): 26/);
  assert.doesNotMatch(advanceNotes, /Installatiedatum|Aangebracht|24,5/);
});

test('ongeldige ISDE-invoer reserveert geen factuurnummer', async () => {
  const h = harness();
  const { emptySubsidyMeasure } = load('@/lib/invoice-subsidy');
  await assert.rejects(createInvoiceAtomically(h.firestore, 'owner', {
    ...h.params, subsidy: [{ ...emptySubsidyMeasure(), code: 'onbekend' }],
  }, null), /Controleer de ISDE-gegevens/);
  assert.equal(h.documents.has('counters/invoiceNumber_owner'), false);
});

test('de RVO-werkmap levert alleen een meldcode bij een unieke toepasselijke match', () => {
  const { zipSync, strToU8 } = require('fflate');
  const { emptySubsidyMeasure } = load('@/lib/invoice-subsidy');
  const { parseRvoCatalog, matchRvoCode } = load('@/lib/rvo-meldcodes');
  const rows = [
    { A: 'MELDCODE', C: 'Model', F: 'MIN_DIKTE_MM', J: 'Categorie' },
    { A: 'KA18226', B: 'Knauf Insulation', C: 'Naturoll 037 -dakisolatie', E: '3.5', F: '130', J: 'Dakisolatie', K: 'Alle woningen' },
    { A: 'KA26612', B: 'Knauf Insulation', C: '(M)Naturoll 037 -dakisolatie', E: '2.5', F: '93', J: 'Dakisolatie', K: 'Alleen monumentale woningen' },
  ].map((row, index) => '<row>' + Object.entries(row).map(([column, value]) =>
    `<c r="${column}${index + 1}" t="inlineStr"><is><t>${value}</t></is></c>`).join('') + '</row>');
  const zip = zipSync({ 'xl/worksheets/sheet2.xml': strToU8(`<worksheet><sheetData>${rows.join('')}</sheetData></worksheet>`) });
  const catalog = parseRvoCatalog(zip, 'isolatie');
  const measure = { ...emptySubsidyMeasure(), material: 'Knauf Insulation Naturoll 037 glaswol', application: 'Dakisolatie', thickness: '140', insulationValue: '3,75' };
  assert.equal(matchRvoCode(measure, catalog), 'KA18226');
  assert.equal(matchRvoCode({ ...measure, thickness: '100' }, catalog), '');
  assert.equal(matchRvoCode({ ...measure, application: 'Vloerisolatie' }, catalog), '');
  assert.equal(matchRvoCode(measure, [...catalog, { ...catalog[0], code: 'KA12345' }]), '');
});
