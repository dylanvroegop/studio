const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadSource(filename, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', filename), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)((name) => {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Onverwachte dependency: ${name}`);
  }, module, module.exports);
  return module.exports;
}

const matching = loadSource('src/lib/invoice-bank-matching.ts');
const invoice = { id: 'invoice-a', userId: 'owner', reference: 'F-460001', status: 'verzonden',
  totalCents: 10000, paidCents: 0, issueDate: '2026-10-01', clientName: 'Jan Jansen' };
const credit = { id: 'transaction-a', key: 'stable-key-a', amountCents: 10000, currency: 'EUR',
  bookingDate: '2026-10-03', name: 'Jan Jansen', description: 'Betaling factuur F-460001' };
function candidates(overrides = {}) {
  return matching.findInvoiceBankCandidates({ invoice, invoices: [invoice], credits: [credit], allocations: new Map(), ...overrides });
}

test('exact volledig factuurnummer en openstaand EUR-bedrag kunnen automatisch worden gekoppeld', () => {
  assert.equal(candidates()[0].automatic, true);
  assert.equal(candidates()[0].suggestedCents, 10000);
});
test('factuurnummer is geen deelstring; speciale prefixtekens blijven letterlijk', () => {
  assert.equal(matching.hasInvoiceBankReference('F-4600019', 'F-460001'), false);
  assert.equal(matching.hasInvoiceBankReference('AF-460001', 'F-460001'), false);
  assert.equal(matching.hasInvoiceBankReference('Factuur F.460001', 'F.460001'), true);
  assert.equal(matching.hasInvoiceBankReference('Factuur Fx460001', 'F.460001'), false);
});
test('alleen naam en bedrag geven altijd een voorstel, nooit automatisch betaald', () => {
  const result = candidates({ credits: [{ ...credit, description: 'Bedankt voor het werk' }] });
  assert.equal(result.length, 1);
  assert.equal(result[0].automatic, false);
});
test('ander expliciet factuurnummer wint van naam en bedrag', () => {
  const other = { ...invoice, id: 'other', reference: 'F-460002' };
  assert.equal(candidates({ invoices: [invoice, other], credits: [{ ...credit, description: 'F-460002' }] }).length, 0);
});
test('concept, geannuleerd, afwijkende valuta en betaling voor factuurdatum worden uitgesloten', () => {
  for (const status of ['concept', 'geannuleerd']) assert.equal(candidates({ invoice: { ...invoice, status } }).length, 0);
  assert.equal(candidates({ credits: [{ ...credit, currency: 'USD' }] }).length, 0);
  assert.equal(candidates({ credits: [{ ...credit, bookingDate: '2026-09-30' }] }).length, 0);
});
test('dubbele factuurnummers en meerdere exact passende stortingen vragen bevestiging', () => {
  assert.equal(candidates({ invoices: [invoice, { ...invoice, id: 'duplicate', status: 'concept' }] })[0].automatic, false);
  assert.ok(candidates({ credits: [credit, { ...credit, id: 'other', key: 'other' }] }).every((item) => !item.automatic));
});
test('deelbetaling en gecombineerde betaling zijn expliciete, begrensde voorstellen', () => {
  const partial = candidates({ credits: [{ ...credit, amountCents: 4000 }] })[0];
  assert.equal(partial.automatic, false);
  assert.equal(partial.suggestedCents, 4000);
  const other = { ...invoice, id: 'other', reference: 'F-460002' };
  const combined = candidates({ invoices: [invoice, other], credits: [{ ...credit, amountCents: 20000, description: 'F-460001 en F-460002' }] })[0];
  assert.equal(combined.automatic, false);
  assert.equal(combined.suggestedCents, 10000);
});
test('handmatig betaald wordt alleen aan bewijs gekoppeld zonder opnieuw op te tellen', () => {
  const result = candidates({ invoice: { ...invoice, status: 'betaald', paidCents: 10000 } })[0];
  assert.equal(result.automatic, false);
  assert.equal(result.suggestedCents, 0);
  assert.equal(result.linkExistingCents, 10000);
});
test('bestaande toewijzingen begrenzen transactierestant en voorkomen dubbele boekingen', () => {
  const allocations = new Map([[credit.key, [{ invoiceId: 'other', amountCents: 7000, mode: 'add' }]]]);
  assert.equal(candidates({ allocations })[0].suggestedCents, 3000);
  allocations.set(credit.key, [{ invoiceId: invoice.id, amountCents: 10000, mode: 'add' }]);
  assert.equal(candidates({ allocations }).length, 0);
});
test('boeking valideert opnieuw bedrag, factuurrestant en resterende handmatige betaling', () => {
  const base = { invoice, credit, existing: [], linkedCents: 0, amountCents: 10000, mode: 'add' };
  assert.doesNotThrow(() => matching.validateInvoiceBankAllocation(base));
  assert.throws(() => matching.validateInvoiceBankAllocation({ ...base, amountCents: 10001 }), /elders gekoppeld/);
  assert.throws(() => matching.validateInvoiceBankAllocation({ ...base, amountCents: 1.1 }), /Ongeldig/);
  assert.throws(() => matching.validateInvoiceBankAllocation({ ...base, invoice: { ...invoice, paidCents: 1000 } }), /gewijzigd/);
  assert.throws(() => matching.validateInvoiceBankAllocation({ ...base, mode: 'link' }), /gewijzigd/);
});

// In-memory transaction adapter: niets hieronder benadert Firebase, Supabase of de bank.
function firestoreFixture({ paid = 0, status = 'verzonden', uid = 'owner' } = {}) {
  const documents = new Map([
    ['invoices/invoice-a', { userId: uid, invoiceNumberLabel: invoice.reference, status,
      totalsSnapshot: { totaalInclBtw: 100 }, paymentSummary: { paidAmount: paid, openAmount: 100 - paid },
      issueDate: '2026-10-01', sourceQuote: { klantSnapshot: { naam: 'Jan Jansen' } },
      quoteId: 'owned-quote', combinedQuoteIds: ['foreign-quote'] }],
    ['quotes/owned-quote', { userId: uid, status: 'verzonden' }],
    ['quotes/foreign-quote', { userId: 'different-user', status: 'verzonden' }],
  ]);
  let tail = Promise.resolve();
  const ref = (name, filters = []) => ({
    path: name, id: name.split('/').at(-1), filters,
    doc: (id) => ref(`${name}/${id}`), collection: (id) => ref(`${name}/${id}`),
    where: (field, _op, value) => ref(name, [...filters, [field, value]]),
    select: (...fields) => { assert.equal(fields.includes('calculationSnapshot'), false); return ref(name, filters); },
  });
  const snapshot = (name, data) => ({ id: name.split('/').at(-1), exists: Boolean(data), ref: ref(name), data: () => data });
  const firestore = {
    collection: (name) => ref(name),
    runTransaction: (callback) => {
      const result = tail.then(async () => {
        const pending = [];
        const value = await callback({
          get: async (target) => {
            if (target.path.split('/').length % 2 === 0) return snapshot(target.path, documents.get(target.path));
            return { docs: Array.from(documents).filter(([name, data]) => name.startsWith(`${target.path}/`)
              && name.split('/').length === target.path.split('/').length + 1
              && target.filters.every(([key, expected]) => data[key] === expected))
              .map(([name, data]) => snapshot(name, data)) };
          },
          set: (target, data) => pending.push(() => documents.set(target.path, data)),
          create: (target, data) => pending.push(() => { assert.equal(documents.has(target.path), false); documents.set(target.path, data); }),
          update: (target, changes) => pending.push(() => {
            const next = structuredClone(documents.get(target.path));
            for (const [key, value] of Object.entries(changes)) {
              const parts = key.split('.');
              if (parts.length === 1) next[key] = value;
              else next[parts[0]][parts[1]] = value;
            }
            documents.set(target.path, next);
          }),
        });
        pending.forEach((apply) => apply());
        return value;
      });
      tail = result.catch(() => {});
      return result;
    },
  };
  return { firestore, documents };
}
const payments = loadSource('src/lib/invoice-bank-payments.ts', {
  'server-only': {}, crypto: require('node:crypto'),
  'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => 'now' }, Timestamp: { fromDate: (date) => date.toISOString() } },
  '@/lib/supabase-admin': {}, '@/lib/invoice-bank-matching': matching,
});
function apply(fixture, overrides = {}) {
  return payments.applyInvoiceBankPayment({ firestore: fixture.firestore, uid: 'owner', invoiceId: invoice.id,
    credit, credits: [credit], amountCents: 10000, mode: 'add', automatic: true, ...overrides });
}
test('transactie legt bewijs en betaling vast, replay telt niets dubbel en vreemde offerte blijft ongemoeid', async () => {
  const fixture = firestoreFixture();
  assert.equal(await apply(fixture), true);
  assert.equal(await apply(fixture), false);
  const saved = fixture.documents.get('invoices/invoice-a');
  assert.equal(saved.paymentSummary.paidAmount, 100);
  assert.equal(saved.status, 'betaald');
  assert.equal(fixture.documents.get('quotes/owned-quote').status, 'geaccepteerd');
  assert.equal(fixture.documents.get('quotes/foreign-quote').status, 'verzonden');
  assert.equal(Array.from(fixture.documents.keys()).filter((key) => key.includes('/payments/')).length, 1);
});
test('gelijktijdige verzoeken boeken hoogstens eenmaal', async () => {
  const fixture = firestoreFixture();
  assert.deepEqual(await Promise.all([apply(fixture), apply(fixture)]), [true, false]);
  assert.equal(fixture.documents.get('invoices/invoice-a').paymentSummary.paidAmount, 100);
});
test('andere eigenaar kan geen betaling op de factuur boeken', async () => {
  const fixture = firestoreFixture({ uid: 'other-user' });
  await assert.rejects(apply(fixture), (error) => error.status === 404);
  assert.equal(fixture.documents.size, 3);
});
test('handmatige bewijslink maakt geen extra betaalregel en verhoogt betaald niet', async () => {
  const fixture = firestoreFixture({ paid: 100, status: 'betaald' });
  assert.equal(await apply(fixture, { mode: 'link', automatic: false }), true);
  assert.equal(fixture.documents.get('invoices/invoice-a').paymentSummary.paidAmount, 100);
  assert.equal(Array.from(fixture.documents.keys()).filter((key) => key.includes('/payments/')).length, 0);
});
test('gedeeltelijk handmatig geboekte bijschrijving: bestaand deel koppelen en restant eenmaal boeken', async () => {
  const fixture = firestoreFixture({ paid: 40, status: 'gedeeltelijk_betaald' });
  assert.equal(await apply(fixture, { mode: 'link', amountCents: 4000, automatic: false }), true);
  assert.equal(fixture.documents.get('invoices/invoice-a').paymentSummary.paidAmount, 40);
  assert.equal(await apply(fixture, { mode: 'add', amountCents: 6000, automatic: false }), true);
  assert.equal(await apply(fixture, { mode: 'add', amountCents: 6000, automatic: false }), false);
  assert.equal(fixture.documents.get('invoices/invoice-a').paymentSummary.paidAmount, 100);
  const assigned = fixture.documents.get('users/owner/invoiceBankAllocations/stable-key-a').allocations;
  assert.equal(assigned.reduce((sum, item) => sum + item.amountCents, 0), 10000);
});
test('geannuleerde of gewijzigde factuur veroorzaakt geen writes', async () => {
  const fixture = firestoreFixture({ status: 'geannuleerd' });
  await assert.rejects(apply(fixture), /past niet meer/);
  assert.equal(fixture.documents.size, 3);
});
test('factuurdatum gebruikt Nederlandse kalenderdag, niet de vorige UTC-dag', async () => {
  const fixture = firestoreFixture();
  fixture.documents.get('invoices/invoice-a').issueDate = '2026-09-30T22:30:00Z';
  const previousDay = { ...credit, bookingDate: '2026-09-30' };
  await assert.rejects(apply(fixture, { credit: previousDay, credits: [previousDay] }), /past niet meer/);
  assert.equal(fixture.documents.size, 3);
});
test('normale Knab-sync koppelt maximaal 25 zekere betalingen en meldt resterende matches', async () => {
  const fixture = firestoreFixture();
  fixture.documents.clear();
  const invoices = Array.from({ length: 26 }, (_, i) => ({ ...invoice, id: `invoice-${i}`, reference: `F-${460001 + i}` }));
  const credits = invoices.map((item, i) => ({ ...credit, id: `credit-${i}`, key: `credit-${i}`, description: item.reference }));
  for (const item of invoices) fixture.documents.set(`invoices/${item.id}`, {
    userId: 'owner', invoiceNumberLabel: item.reference, status: 'verzonden', issueDate: '2026-10-01',
    totalsSnapshot: { totaalInclBtw: 100 }, paymentSummary: { paidAmount: 0, openAmount: 100 },
  });
  const result = await payments.reconcileInvoiceBankContext({ firestore: fixture.firestore, uid: 'owner', context: {
    invoices, allocations: new Map(), bank: { connected: true, lastSyncedAt: null, credits },
  } });
  assert.deepEqual(result, { applied: 25, remaining: 1, warnings: [] });
  assert.equal(fixture.documents.get('invoices/invoice-25').paymentSummary.paidAmount, 0);
});
test('conflict in één factuur blokkeert de overige automatische matches niet', async () => {
  const fixture = firestoreFixture({ status: 'geannuleerd' });
  const other = { ...invoice, id: 'invoice-b', reference: 'F-460002' };
  fixture.documents.set('invoices/invoice-b', {
    ...fixture.documents.get('invoices/invoice-a'), status: 'verzonden', invoiceNumberLabel: other.reference,
  });
  const result = await payments.reconcileInvoiceBankContext({ firestore: fixture.firestore, uid: 'owner', context: {
    invoices: [invoice, other], allocations: new Map(), bank: { connected: true, lastSyncedAt: null,
      credits: [credit, { ...credit, id: 'transaction-b', key: 'stable-key-b', description: other.reference }] },
  } });
  assert.equal(result.applied, 1);
  assert.equal(result.warnings.length, 1);
  assert.equal(fixture.documents.get('invoices/invoice-b').status, 'betaald');
});

function routeFixture({ unauthorized = false } = {}) {
  let writes = 0;
  const context = { invoice, invoices: [invoice], allocations: new Map(), bank: { connected: true, lastSyncedAt: null, credits: [credit] } };
  const routes = loadSource('src/app/api/facturen/bank-payments/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    '@/firebase/admin': { initFirebaseAdmin: () => ({ firestore: {} }) },
    '@/lib/bank-api-auth': { noStoreHeaders: () => ({}), resolveBankIdentity: async () => {
      if (unauthorized) throw new Error('Unauthorized');
      return { firebaseUid: 'owner', bankUserId: 'bank-owner' };
    } },
    '@/lib/demo-trial-server': { ensureDemoTrialActiveByUid: async () => null },
    '@/lib/invoice-bank-payments': { ...payments, loadInvoiceBankContext: async () => context,
      applyInvoiceBankPayment: async () => { writes += 1; return true; } },
  });
  return { routes, writes: () => writes };
}
test('GET is uitsluitend lezen; factuurbezoek boekt geen betaling', async () => {
  const fixture = routeFixture();
  const response = await fixture.routes.GET(new Request('https://app.test/api/facturen/bank-payments?invoiceId=invoice-a'));
  assert.equal(response.status, 200);
  assert.equal(response.body.data.candidates[0].automatic, true);
  assert.equal(fixture.writes(), 0);
});
test('routes weigeren ontbrekende auth en ongeldige expliciete bevestiging', async () => {
  const unauthorized = routeFixture({ unauthorized: true });
  assert.equal((await unauthorized.routes.GET(new Request('https://app.test/?invoiceId=invoice-a'))).status, 401);
  const fixture = routeFixture();
  const response = await fixture.routes.POST(new Request('https://app.test/', { method: 'POST',
    body: JSON.stringify({ invoiceId: 'invoice-a', action: 'confirm', transactionId: credit.id, mode: 'add', amountCents: 1 }) }));
  assert.equal(response.status, 409);
  assert.equal(fixture.writes(), 0);
});
test('Firestore clientregels blokkeren server-bankbetalingen en houden handmatige betaalregels beschikbaar', () => {
  const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  const paymentRules = rules.match(/match \/payments\/\{paymentId\} \{([\s\S]*?)\n\s*\}/)?.[1];
  assert.ok(paymentRules);
  assert.match(paymentRules, /allow read:/);
  assert.match(paymentRules, /allow write:[\s\S]*request\.auth\.uid[\s\S]*!paymentId\.matches\('bank_\.\*'\)/);
  assert.equal(new RegExp('^bank_.*$').test('bank_stable-key-a'), true);
  assert.equal(new RegExp('^bank_.*$').test('manual-payment-a'), false);
});
test('geslaagde Knab-import blijft succesvol wanneer factuurmatching tijdelijk faalt', async () => {
  let syncs = 0;
  const builder = { select: () => builder, eq: () => builder, order: () => builder, limit: () => builder,
    maybeSingle: async () => ({ data: { requisition_id: 'owned-session' }, error: null }) };
  const route = loadSource('src/app/api/bank/sync-enablebanking/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    '@/firebase/admin': { initFirebaseAdmin: () => ({ firestore: {} }) },
    '@/lib/bank-api-auth': { noStoreHeaders: () => ({}), resolveBankIdentity: async () => ({ firebaseUid: 'owner', bankUserId: 'bank-owner' }) },
    '@/lib/demo-trial-server': { ensureDemoTrialActiveByUid: async () => null },
    '@/lib/enable-banking/sync': { syncEnableBankingConnection: async (options) => {
      assert.deepEqual(options, { bankUserId: 'bank-owner', sessionId: 'owned-session' });
      syncs += 1; return { status: 'connected', accountsSynced: 1, newCount: 10 };
    } },
    '@/lib/supabase-admin': { supabaseAdmin: { from: () => builder } },
    '@/lib/invoice-bank-payments': { reconcileInvoiceBankPaymentsAfterSync: async (options) => {
      assert.equal(options.uid, 'owner'); assert.equal(options.bankUserId, 'bank-owner');
      throw new Error('Tijdelijk factuurconflict');
    } },
  });
  const result = await route.POST(new Request('https://app.test/', { method: 'POST' }));
  assert.equal(syncs, 1);
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.deepEqual(result.body.invoiceMatching.warnings, ['Tijdelijk factuurconflict']);
});
