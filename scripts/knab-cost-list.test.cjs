const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { buildKnabCostList } = require('../src/lib/knab-cost-list');
const { mapProjectCostRow } = require('../src/lib/project-costs');

function transaction(id, amount, extra = {}) {
  return { id, amount, booking_date: '2026-09-22', counterparty_name: 'Bouwmaat', description: 'Bankomschrijving', ...extra };
}
function source(id, amount, extra = {}) {
  return mapProjectCostRow({ id, category: 'materiaal', amount_incl_btw: amount,
    amount_excl_btw: amount / 1.21, btw_amount: amount - amount / 1.21,
    receipt_url: `https://example.test/${id}.pdf`, ...extra });
}
function ledger(id, sourceIds = [], extra = {}) {
  return { bank_transaction_id: id, source_cost_ids: sourceIds, category: 'materiaal', is_private: false, ...extra };
}
function build(transactions, costs = [], ledgerRows = [], internalTransferIds = new Set(), categoryOverrides) {
  return buildKnabCostList({ userId: 'user', transactions, costs, ledgerRows, internalTransferIds, categoryOverrides });
}

test('alleen afschrijvingen tellen, inclusief prive en eigen overboekingen, zonder losse facturen', () => {
  const transactions = [transaction('purchase', -121), transaction('private', -200),
    transaction('own', -500), transaction('refund', 20), transaction('zero', 0)];
  const costs = [source('attached', 121), source('unmatched', 9000)];
  const result = build(transactions, costs, [ledger('purchase', ['attached']),
    ledger('private', [], { is_private: true })], new Set(['own']));
  assert.equal(result.data.length, 3);
  assert.deepEqual(result.data.map((row) => row.paid_bank_transaction_id).sort(), ['own', 'private', 'purchase']);
  assert.equal(result.bankReconciliation.debitTotal, 821);
  assert.equal(result.bankReconciliation.unmatchedSourceCount, 1);
  assert.equal(result.bankReconciliation.earliestBookingDate, '2026-09-22');
  assert.equal(result.bankReconciliation.latestBookingDate, '2026-09-22');
  assert.equal(result.data.find((row) => row.paid_bank_transaction_id === 'private').category, 'overig');
  assert.equal(result.data.find((row) => row.paid_bank_transaction_id === 'own').category, 'overig');
  assert.equal(result.data.find((row) => row.paid_bank_transaction_id === 'own').is_internal_transfer, true);
});

test('een gemengde factuur blijft een bankregel met exact bankbedrag en bronbijlagen', () => {
  const costs = [source('material', 121), source('tool', 60.5, { category: 'gereedschap' })];
  const { data } = build([transaction('payment', -181.5)], costs, [ledger('payment', ['material', 'tool'])]);
  assert.equal(data.length, 1);
  assert.equal(data[0].amount_incl_btw, 181.5);
  assert.equal(data[0].amount_excl_btw, 150);
  assert.equal(data[0].btw_amount, 31.5);
  assert.equal(data[0].vat_known, true);
  assert.equal(data[0].receipt_files.length, 2);
  assert.equal(data[0].description, 'Bankomschrijving');
  assert.equal(data[0].id, 'bank-knab-payment');
  assert.equal(data[0].has_supporting_document, true);
});

test('afwijkende bronbedragen geven geen naar verhouding verzonnen btw', () => {
  const result = build([transaction('netted-credit', -324.57)], [source('bill', 376.44)],
    [ledger('netted-credit', ['bill'])]);
  assert.equal(result.data[0].amount_incl_btw, 324.57);
  assert.equal(result.data[0].vat_known, false);
  assert.equal(result.data[0].btw_amount, 0);
  assert.ok(result.data[0].receipt_url);
});

test('een ontbrekende bijlage bij een deelbedrag bewijst geen btw voor de hele betaling', () => {
  const costs = [source('documented', 121), source('undocumented', 60.5, { receipt_url: null })];
  const { data } = build([transaction('payment', -181.5)], costs,
    [ledger('payment', ['documented', 'undocumented'])]);
  assert.equal(data[0].amount_incl_btw, 181.5);
  assert.equal(data[0].vat_known, false);
  assert.equal(data[0].has_supporting_document, true);
});

test('expliciete orderbevestiging, offerte of proforma telt niet als factuur ondanks een bijlage', () => {
  for (const documentType of ['order_confirmation', 'quote', 'proforma']) {
    const cost = { ...source('attached', 121), document_type: documentType };
    const { data } = build([transaction('payment', -121)], [cost], [ledger('payment', ['attached'])]);
    assert.equal(data[0].category, 'overig');
    assert.equal(data[0].has_supporting_document, false);
    assert.equal(data[0].vat_known, false);
    assert.ok(data[0].receipt_url);
  }
});

test('zonder gekoppeld document blijft alles Overig ondanks categorie of factuurnaam', () => {
  const cost = source('no-document', 121, { receipt_url: null, source_filename: 'factuur.pdf' });
  const { data } = build([transaction('payment', -121)], [cost],
    [ledger('payment', ['no-document'], { category: 'gereedschap' })]);
  assert.equal(data[0].category, 'overig');
  assert.equal(data[0].vat_known, false);
  assert.equal(data[0].has_supporting_document, false);
});

test('een gecontroleerd betaalbewijs blijft als bijlage beschikbaar maar bewijst geen factuur of btw', () => {
  for (const documentType of ['payment_confirmation', 'order_confirmation', 'payment_request']) {
    const cost = source('attached', 121, { receipt_files: [{
      url: 'https://example.test/payment.pdf', filename: 'betaling.pdf', document_type: documentType,
    }] });
    const { data } = build([transaction('payment', -121)], [cost], [ledger('payment', ['attached'])]);
    assert.equal(data[0].category, 'overig');
    assert.equal(data[0].has_supporting_document, false);
    assert.equal(data[0].vat_known, false);
    assert.equal(data[0].receipt_files[0].document_type, documentType);
    assert.ok(data[0].receipt_url);
  }
});

test('een echte factuur naast een betaalbewijs blijft een geldig aankoopdocument', () => {
  const cost = source('attached', 121, { receipt_files: [
    { url: 'https://example.test/payment.pdf', document_type: 'payment_confirmation' },
    { url: 'https://example.test/invoice.pdf', document_type: 'invoice' },
  ] });
  const { data } = build([transaction('payment', -121)], [cost], [ledger('payment', ['attached'])]);
  assert.equal(data[0].has_supporting_document, true);
  assert.equal(data[0].vat_known, true);
  assert.equal(data[0].category, 'materiaal');
  assert.equal(data[0].receipt_url, 'https://example.test/invoice.pdf');
});

test('Allsafe zonder document blijft Overig, ook wanneer de algemene bronmapper Storage herkent', () => {
  const transactions = [
    transaction('allsafe-invoice', -437.96, { counterparty_name: 'ALLSAFE Group B.V. AMO Lelystad' }),
    transaction('allsafe-card', -15.49, { counterparty_name: 'CCV*ALLSAFE Group B.V.' }),
    transaction('fuel', -150, { counterparty_name: 'Shell' }),
    transaction('private', -100, { counterparty_name: 'top-up via bunq' }),
  ];
  const { data, bankReconciliation } = build(transactions, [], [
    ledger('allsafe-invoice', [], { category: 'storage' }),
    ledger('allsafe-card', [], { category: 'storage' }),
    ledger('fuel', [], { category: 'brandstof' }),
    ledger('private', [], { category: 'eigen_verbruik', is_private: true }),
  ]);
  assert.equal(bankReconciliation.debitTotal, 703.45);
  assert.ok(data.every((row) => row.has_supporting_document === false));
  assert.ok(data.filter(row => row.paid_bank_transaction_id.startsWith('allsafe')).every(row => row.category === 'overig'));
  assert.equal(data.find((row) => row.paid_bank_transaction_id === 'fuel').category, 'brandstof');
  assert.equal(data.find((row) => row.paid_bank_transaction_id === 'fuel').bank_category, 'brandstof');
});

test('herkende tankbetalingen zijn brandstof zonder bon en zonder verzonnen btw', () => {
  const transactions = [transaction('shell', -200.56, { counterparty_name: 'BCK*SHELL SCHWEITZERDR' }),
    transaction('bp', -53.74, { counterparty_name: 'CCV*BP LASERDREEF' }),
    transaction('circle', -49.84, { counterparty_name: 'Circle K' }),
    transaction('placeholder', -75, { counterparty_name: '...', description: 'BCK*NL12345 Tamoil' })];
  const { data, bankReconciliation } = build(transactions);
  assert.equal(data.length, 4);
  assert.equal(bankReconciliation.transactionCount, 4);
  assert.equal(bankReconciliation.debitTotal, 379.14);
  for (const cost of data) {
    assert.equal(cost.category, 'brandstof');
    assert.equal(cost.bank_category, 'brandstof');
    assert.equal(cost.is_fuel_payment, true);
    assert.equal(cost.fuel_needs_review, false);
    assert.equal(cost.has_supporting_document, false);
    assert.equal(cost.vat_known, false);
    assert.equal(cost.btw_amount, 0);
    assert.equal(cost.btw_percentage, 0);
    assert.equal(cost.receipt_url, null);
    assert.deepEqual(cost.receipt_files, []);
    assert.equal(cost.amount_incl_btw, -transactions.find(row => row.id === cost.paid_bank_transaction_id).amount);
  }
});

test('handmatige categorie heeft voorrang op merkherkenning en Tracking volgt dezelfde keuze', () => {
  for (const category of ['overig', 'autokosten', 'eigen_verbruik', 'brandstof']) {
    const { data } = build([transaction('shell', -100, { counterparty_name: 'Shell' })], [],
      [ledger('shell', [], { category, category_override: category })]);
    assert.equal(data[0].category, category);
    assert.equal(data[0].bank_category, category);
    assert.equal(data[0].is_fuel_payment, true);
    assert.equal(data[0].fuel_needs_review, false);
    assert.equal(data[0].vat_known, false);
    assert.equal(data[0].amount_incl_btw, 100);
  }
});

test('expliciet bevestigde brandstof werkt zonder herkenbare merchant of bon', () => {
  const { data } = build([transaction('manual', -100, { counterparty_name: 'Betaalterminal' })], [],
    [ledger('manual', [], { category: 'brandstof', category_override: 'brandstof' })]);
  assert.equal(data[0].is_fuel_payment, true);
  assert.equal(data[0].category, 'brandstof');
  assert.equal(data[0].bank_category, 'brandstof');
  assert.equal(data[0].has_supporting_document, false);
  assert.equal(data[0].vat_known, false);
});

test('bevestigde Adolf Roth-tankbetaling blijft corrigeerbaar na handmatig Overig', () => {
  const tx = transaction('adolf-roth', -100, { counterparty_name: 'Adolf Roth GmbH & Co.' });
  for (const category of ['overig', 'brandstof']) {
    const cost = build([tx], [], [ledger(tx.id, [], { category, category_override: category })]).data[0];
    assert.equal(cost.is_fuel_payment, true);
    assert.equal(cost.category, category);
    assert.equal(cost.bank_category, category);
    assert.equal(cost.has_supporting_document, false);
    assert.equal(cost.vat_known, false);
  }
});

test('echte boncategorie van Shell-shop of wasstraat gaat voor een merchantaanname', () => {
  for (const category of ['autokosten', 'materiaal', 'overig']) {
    const cost = source('receipt', 121, { category });
    const { data } = build([transaction('shell', -121, { counterparty_name: 'Shell' })], [cost],
      [ledger('shell', ['receipt'], { category })]);
    assert.equal(data[0].category, category);
    assert.equal(data[0].bank_category, category);
    assert.equal(data[0].is_fuel_payment, true);
    assert.equal(data[0].has_supporting_document, true);
    assert.equal(data[0].vat_known, true);
    assert.equal(data[0].btw_amount, 21);
    assert.equal(data[0].amount_incl_btw, 121);
  }
});

test('oude prive-aanduidingen zonder geldig document blijven Overig ter controle', () => {
  const variants = [{ payment_type: 'private' }, { category: 'eigen_verbruik' },
    { line_items: [{ description: 'Oude bronregel', quantity: 1, total_price: 100, category: 'eigen_verbruik' }] }];
  for (const extra of variants) {
    const cost = source('old-source', 121, { receipt_url: null, ...extra });
    const { data } = build([transaction('shell', -121, { counterparty_name: 'Shell' })], [cost],
      [ledger('shell', ['old-source'], { category: 'eigen_verbruik' })]);
    assert.equal(data[0].is_fuel_payment, true);
    assert.equal(data[0].fuel_needs_review, true);
    assert.equal(data[0].category, 'overig');
    assert.equal(data[0].bank_category, 'overig');
    assert.equal(data[0].vat_known, false);
    const confirmed = build([transaction('shell', -121, { counterparty_name: 'Shell' })], [cost],
      [ledger('shell', ['old-source'], { category: 'brandstof', category_override: 'brandstof' })]).data[0];
    assert.equal(confirmed.category, 'brandstof');
    assert.equal(confirmed.fuel_needs_review, false);
    assert.equal(confirmed.vat_known, false);
  }
});

test('order of afwijkende bron maakt tankbetaling niet automatisch btw-bekend', () => {
  const order = source('order', 121, { receipt_files: [{ url: 'https://example.test/order.pdf', document_type: 'order_confirmation' }] });
  const mismatch = source('invoice', 242);
  for (const cost of [order, mismatch]) {
    const { data } = build([transaction('shell', -121, { counterparty_name: 'Shell' })], [cost],
      [ledger('shell', [cost.id], { category: 'brandstof' })]);
    assert.equal(data[0].category, 'brandstof');
    assert.equal(data[0].amount_incl_btw, 121);
    assert.equal(data[0].vat_known, false);
    assert.equal(data[0].btw_amount, 0);
  }
});

test('herkenning verandert geen aantallen, bedragen, credits, prive- of interne grens', () => {
  const transactions = [transaction('shell-a', -3.1, { counterparty_name: 'Shell' }),
    transaction('shell-b', -3.1, { counterparty_name: 'Shell' }),
    transaction('shell-refund', 3.1, { counterparty_name: 'Shell' }),
    transaction('shell-zero', 0, { counterparty_name: 'Shell' }),
    transaction('own', -500, { counterparty_name: 'Shell' }),
    transaction('private', -200, { counterparty_name: 'Shell' }),
    transaction('unknown', -50, { counterparty_name: 'Webpartner BV', description: 'Shell' })];
  const result = build([...transactions, transactions[0]], [source('unmatched', 9999)],
    [ledger('private', [], { is_private: true }), ledger('unknown', [], { category: 'brandstof' })], new Set(['own']));
  assert.equal(result.data.length, 5);
  assert.equal(result.bankReconciliation.transactionCount, 5);
  assert.equal(result.bankReconciliation.debitTotal, 756.2);
  assert.equal(result.bankReconciliation.unmatchedSourceCount, 1);
  assert.equal(result.data.filter(cost => cost.category === 'brandstof').length, 2);
  for (const id of ['own', 'private', 'unknown']) {
    const cost = result.data.find(cost => cost.paid_bank_transaction_id === id);
    assert.equal(cost.category, 'overig');
    assert.equal(cost.is_fuel_payment, false);
    assert.equal(cost.vat_known, false);
  }
});

test('alleen bunq-top-ups krijgen zonder bon de bevestigde uitzondering Prive-opnames', () => {
  const transactions = [
    transaction('bunq', -1000, { counterparty_name: 'top-up via bunq' }),
    transaction('paypal', -200, { counterparty_name: 'PayPal top-up' }),
    transaction('manual-private', -50, { category: 'private' }),
  ];
  const { data, bankReconciliation } = build(transactions, [], transactions.map((row) =>
    ledger(row.id, [], { is_private: true, category: 'overig' })));
  assert.equal(bankReconciliation.debitTotal, 1250);
  assert.equal(data.find((row) => row.paid_bank_transaction_id === 'bunq').category, 'eigen_verbruik');
  assert.equal(data.find((row) => row.paid_bank_transaction_id === 'bunq').is_bunq_topup, true);
  assert.equal(data.find((row) => row.paid_bank_transaction_id === 'paypal').category, 'overig');
  assert.equal(data.find((row) => row.paid_bank_transaction_id === 'manual-private').category, 'overig');
  assert.ok(data.every((row) => row.has_supporting_document === false));
});

test('dezelfde bank-id telt eenmaal; verschillende gelijke betalingen blijven apart', () => {
  const { data, bankReconciliation } = build([transaction('first', -100), transaction('first', -100), transaction('second', -100)]);
  assert.equal(data.length, 2);
  assert.equal(bankReconciliation.debitTotal, 200);
  assert.throws(() => build([transaction('first', -100), transaction('first', -110)]), /tegenstrijdige/);
});

test('bevestigde Creman-betalingen zijn Schulden zonder losse factuur, met onbekende btw', () => {
  const transactions = ['Stichting Derdengelden Creman', 'Stichting Derdengelden Creman via S',
    ' stichting  derdengelden CREMAN via Stichting '].map((name, index) =>
    transaction(`creman-${index}`, -727.73, { counterparty_name: name }));
  const result = build(transactions);
  assert.equal(result.bankReconciliation.debitTotal, 2183.19);
  assert.equal(result.data.length, 3);
  for (const row of result.data) {
    assert.equal(row.category, 'schulden');
    assert.equal(row.is_creman_debt, true);
    assert.equal(row.has_supporting_document, false);
    assert.equal(row.vat_known, false);
    assert.equal(row.amount_incl_btw, 727.73);
    assert.equal(row.receipt_files.length, 0);
  }
});

test('Creman-uitzondering geldt niet voor andere incassopartijen of alleen een vermelding', () => {
  const transactions = [
    transaction('other', -100, { counterparty_name: 'Stichting Derdengelden Andere Incasso' }),
    transaction('similar', -100, { counterparty_name: 'Stichting Derdengelden CremanAndere' }),
    transaction('mention', -100, { counterparty_name: 'Andere leverancier', description: 'Stichting Derdengelden Creman' }),
    transaction('refund', 100, { counterparty_name: 'Stichting Derdengelden Creman' }),
  ];
  const result = build(transactions);
  assert.equal(result.data.length, 3);
  assert.ok(result.data.every((row) => row.category === 'overig' && !row.is_creman_debt));
  assert.equal(result.bankReconciliation.debitTotal, 300);
});

test('lege historie heeft expliciet nul transacties en geen datumbereik', () => {
  assert.deepEqual(build([]).bankReconciliation, { transactionCount: 0, debitTotal: 0,
    earliestBookingDate: null, latestBookingDate: null, unmatchedSourceCount: 0 });
});

test('elf bevestigde privestortingen komen apart van afschrijvingen en onbekende ontvangsten', () => {
  const credits = Array.from({ length: 11 }, (_, index) => transaction(`deposit-${index}`, index === 10 ? 666 : 650,
    { counterparty_name: 'KNAB', description: `Betaalverzoek voorbeeld ${index}` }));
  const overrides = new Map(credits.map((row) => [row.id, 'eigen_verbruik']));
  overrides.set('own-business', 'eigen_verbruik');
  overrides.set('zero', 'eigen_verbruik');
  const transactions = [transaction('purchase', -121), ...credits,
    transaction('customer', 1000), transaction('refund', 20),
    transaction('unconfirmed-own-name', 350, { counterparty_name: 'D. Voorbeeld', category: 'eigen_verbruik' }),
    transaction('own-business', 500), transaction('zero', 0)];
  const costs = [source('attached', 121), source('unmatched', 9000)];
  const ledgerRows = [ledger('purchase', ['attached']),
    ledger('unconfirmed-own-name', [], { is_private: true, category: 'eigen_verbruik' })];
  const baseline = build(transactions, costs, ledgerRows, new Set(['own-business']));
  const result = build(transactions, costs, ledgerRows, new Set(['own-business']), overrides);

  assert.deepEqual(result.data, baseline.data);
  assert.deepEqual(result.bankReconciliation, baseline.bankReconciliation);
  assert.equal(result.bankReconciliation.transactionCount, 1);
  assert.equal(result.bankReconciliation.debitTotal, 121);
  assert.equal(result.bankReconciliation.unmatchedSourceCount, 1);
  assert.deepEqual(baseline.privateCredits, []);
  assert.equal(result.privateCredits.length, 11);
  assert.equal(result.privateCredits.reduce((sum, row) => sum + Math.round(row.amount_incl_btw * 100), 0), 716600);
  assert.deepEqual(new Set(result.privateCredits.map((row) => row.paid_bank_transaction_id)), new Set(credits.map((row) => row.id)));
});

test('historische creditbevestiging blijft geldig, canonical gaat voor en aliasconflict blijft uitgesloten', () => {
  const transactions = [
    transaction('alias-only', 10, { source_transaction_ids: ['old-private'] }),
    transaction('same-aliases', 20, { source_transaction_ids: ['old-private', 'old-private-2'] }),
    transaction('canonical-private', 30, { source_transaction_ids: ['old-other', 'old-private'] }),
    transaction('canonical-other', 40, { source_transaction_ids: ['old-private'] }),
    transaction('conflicting-aliases', 50, { source_transaction_ids: ['old-private', 'old-other'] }),
    transaction('unknown-alias', 60, { source_transaction_ids: ['unknown'] }),
  ];
  const overrides = new Map([['old-private', 'eigen_verbruik'], ['old-private-2', 'eigen_verbruik'],
    ['old-other', 'overig'], ['canonical-private', 'eigen_verbruik'], ['canonical-other', 'overig']]);
  const result = build(transactions, [], [], new Set(), overrides);
  assert.deepEqual(result.privateCredits.map((row) => row.paid_bank_transaction_id).sort(),
    ['alias-only', 'canonical-private', 'same-aliases']);
  assert.equal(result.privateCredits.reduce((sum, row) => sum + row.amount_incl_btw, 0), 60);
  assert.deepEqual(result.data, []);
  assert.equal(result.bankReconciliation.transactionCount, 0);
  assert.equal(result.bankReconciliation.debitTotal, 0);
});

test('bevestigde credits dedupliceren alleen dezelfde identiteit en weigeren tegenstrijdige datum of bedrag', () => {
  const first = transaction('first-credit', 25);
  const second = transaction('second-credit', 25);
  const overrides = new Map([[first.id, 'eigen_verbruik'], [second.id, 'eigen_verbruik']]);
  const result = build([first, { ...first }, second], [], [], new Set(), overrides);
  assert.equal(result.privateCredits.length, 2);
  assert.equal(result.privateCredits.reduce((sum, row) => sum + row.amount_incl_btw, 0), 50);
  assert.throws(() => build([first, { ...first, amount: 26 }], [], [], new Set(), overrides), /tegenstrijdige bankgegevens/);
  assert.throws(() => build([first, { ...first, booking_date: '2026-09-23' }], [], [], new Set(), overrides), /tegenstrijdige bankgegevens/);
  assert.throws(() => build([transaction('', 25)], [], [], new Set(), new Map([['', 'eigen_verbruik']])), /geen geldig/);
  assert.throws(() => build([transaction('first-credit', Infinity)], [], [], new Set(), overrides), /geen geldig/);
});

test('dezelfde bankidentiteit kan niet tegelijk een afschrijving en bevestigde privestorting zijn', () => {
  const debit = transaction('conflicting-direction', -25);
  const credit = transaction('conflicting-direction', 25);
  const overrides = new Map([[debit.id, 'eigen_verbruik']]);
  for (const transactions of [[debit, credit], [credit, debit]]) {
    assert.throws(() => build(transactions, [], [], new Set(), overrides), /tegenstrijdige bankgegevens/);
  }
});

test('een privestorting krijgt geen factuur, btw of gekoppelde bronkosten uit een toevallige match', () => {
  const tx = transaction('confirmed', 121, { counterparty_name: 'ALLSAFE Group B.V.', booking_date: '2026-10-05' });
  const result = build([tx], [source('invoice', 121)], [ledger(tx.id, ['invoice'])], new Set(),
    new Map([[tx.id, 'eigen_verbruik']]));
  const credit = result.privateCredits[0];
  assert.equal(credit.id, 'bank-knab-credit-confirmed');
  assert.equal(credit.category, 'eigen_verbruik');
  assert.equal(credit.bank_category, 'eigen_verbruik');
  assert.equal(credit.amount_incl_btw, 121);
  assert.equal(credit.is_private_deposit, true);
  assert.equal(credit.is_internal_transfer, false);
  assert.equal(credit.payment_type, 'private');
  assert.equal(credit.payment_status, 'private');
  assert.equal(credit.has_supporting_document, false);
  assert.equal(credit.vat_known, false);
  assert.equal(credit.btw_amount, 0);
  assert.equal(credit.btw_percentage, 0);
  assert.equal(credit.receipt_url, null);
  assert.deepEqual(credit.receipt_files, []);
  assert.deepEqual(credit.source_cost_ids, []);
  assert.equal(result.bankReconciliation.unmatchedSourceCount, 1);
  assert.equal(result.bankReconciliation.earliestBookingDate, null);
  assert.equal(result.bankReconciliation.latestBookingDate, null);
});

test('bevestigde spaaroverboekingen verdwijnen uit kosten en aantallen, bankbron blijft intact', () => {
  const rows = [transaction('savings-2', -2000), transaction('savings-3', -3000), transaction('purchase', -121)];
  const copy = JSON.stringify(rows);
  const result = build(rows, [], [], new Set(['savings-2', 'savings-3']), new Map([['savings-2', 'profit'], ['savings-3', 'profit']]));
  assert.equal(result.data.length, 1);
  assert.equal(result.bankReconciliation.debitTotal, 121);
  assert.equal(JSON.stringify(rows), copy);
});
test('zonder bevestiging blijven andere eigen overboekingen zichtbaar', () => {
  assert.equal(build([transaction('own', -100)], [], [], new Set(['own'])).data.length, 1);
  assert.equal(build([transaction('external', -100)], [], [], new Set(), new Map([['external', 'profit']])).data.length, 1);
});
