const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { buildKnabCostList } = require('../src/lib/knab-cost-list');
const confirmedCategories = { exports: {} };
new Function('module', 'exports', ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/lib/confirmed-bank-categories.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText)(confirmedCategories, confirmedCategories.exports);

function loadLedger(client = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/finance-bank-ledger.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dependencies = {
    '@/lib/confirmed-bank-categories': confirmedCategories.exports,
    '@/lib/supabase-admin': { supabaseAdmin: client },
    '@/lib/finance-cost-visibility': { isConfirmedCashCost: () => false },
    '@/lib/project-costs': {
      roundEuro: (value) => Math.round(value * 100) / 100,
      normalizeProjectCostCategory: (value) => value,
      inferProjectCostCategory: () => 'overig',
    },
  };
  new Function('require', 'module', 'exports', code)((name) => {
    if (!(name in dependencies)) throw new Error(`Onverwachte dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}

const iban = 'NL91KNAB0123456789';
const secondIban = 'NL92KNAB0123456780';
const accounts = [
  { id: 'old', iban, connection_id: 'expired', name: 'Bedrijf', currency: 'EUR' },
  { id: 'new', iban, connection_id: 'current', name: 'Bedrijf', currency: 'EUR' },
  { id: 'personal', iban: secondIban, connection_id: 'current', name: 'Persoon', currency: 'EUR' },
];
function row(id, accountId = 'new', reference = id, overrides = {}) {
  return { id, bank_account_id: accountId, amount: -100, currency: 'EUR', booking_date: '2026-07-01',
    counterparty_name: 'Leverancier', description: 'Betaling', user_id: 'owner',
    raw: reference ? { entry_reference: reference } : {}, ...overrides };
}
const ledger = loadLedger();

test('nieuwe Creman-betaling krijgt ook zonder bestaande override de bevestigde schuldencategorie', () => {
  const transactions = [row('creman', 'new', 'creman-ref', {
    counterparty_name: 'Stichting Derdengelden Creman via S', amount: -727.73,
  })];
  const result = ledger.buildFinanceBankLedger({ userId: 'owner', transactions, costs: [] });
  assert.equal(result[0].category, 'schulden');
  assert.equal(result[0].amount, 727.73);
  assert.deepEqual(result[0].source_cost_ids, []);
});
function select(rows, options = {}) {
  return ledger.selectKnabTransactionHistory({ accounts, rows, preferredAccountIds: ['new', 'old'], ...options });
}

test('oude en huidige koppeling van dezelfde IBAN tellen dezelfde bankboeking eenmaal', () => {
  const result = select([row('old-row', 'old', 'bank-id'), row('current-row', 'new', 'bank-id')]);
  assert.deepEqual(result.transactions.map((item) => item.id), ['current-row']);
  assert.deepEqual(result.transactions[0].source_transaction_ids, ['current-row', 'old-row']);
  assert.equal(result.metadata.duplicateTransactionCount, 1);
  assert.equal(result.metadata.sourceTransactionCount, 2);
  assert.equal(result.metadata.historicalAccountCount, 2);
});

test('twee echte gelijke betalingen blijven twee afschrijvingen, ook bij een retour', () => {
  const result = select([
    row('debit-one', 'new', 'bank-a', { amount: -3.10 }),
    row('debit-two', 'new', 'bank-b', { amount: -3.10 }),
    row('refund', 'new', 'bank-c', { amount: 3.10 }),
    row('old-copy', 'old', 'bank-a', { amount: -3.10 }),
  ]);
  assert.equal(result.transactions.length, 3);
  assert.equal(result.transactions.filter((item) => item.amount < 0).length, 2);
  assert.equal(result.transactions.reduce((sum, item) => sum + Math.round(item.amount * 100), 0), -310);
});

test('ontbrekende bankkenmerken maken gelijke betalingen niet onzichtbaar', () => {
  const result = select([row('a', 'new', null), row('b', 'old', null)]);
  assert.equal(result.transactions.length, 2);
  assert.equal(result.metadata.unidentifiedTransactionCount, 2);
  assert.equal(result.metadata.duplicateTransactionCount, 0);
});

test('een bestaande documentkoppeling aan een oude import-id blijft gekoppeld na opnieuw verbinden', () => {
  const history = select([row('old-row', 'old', 'bank-id'), row('current-row', 'new', 'bank-id')]);
  const cost = { id: 'receipt', paid_bank_transaction_id: 'old-row', amount_incl_btw: 100,
    supplier_name: 'Andere omschrijving', description: '', receipt_files: [], date: '2020-01-01', category: 'materiaal' };
  const result = ledger.buildFinanceBankLedger({ userId: 'owner', transactions: history.transactions, costs: [cost] });
  assert.deepEqual(result[0].source_cost_ids, ['receipt']);
  assert.equal(result[0].bank_transaction_id, 'current-row');
  const unrelated = ledger.buildFinanceBankLedger({ userId: 'owner', transactions: history.transactions,
    costs: [{ ...cost, paid_bank_transaction_id: 'another-payment' }] });
  assert.deepEqual(unrelated[0].source_cost_ids, []);
});

function categoryWithOverrides(entries) {
  const transaction = { ...row('current-row'), source_transaction_ids: ['current-row', 'old-row', 'older-row'] };
  const cost = { id: 'receipt', paid_bank_transaction_id: 'current-row', amount_incl_btw: 100,
    supplier_name: 'Leverancier', description: '', receipt_files: [], date: '2026-07-01', category: 'materiaal' };
  return ledger.buildFinanceBankLedger({ userId: 'owner', transactions: [transaction], costs: [cost],
    categoryOverrides: new Map(entries) })[0].category;
}

test('handmatige categorie op een oude import-id blijft behouden na opnieuw verbinden', () => {
  assert.equal(categoryWithOverrides([['old-row', 'gereedschap']]), 'gereedschap');
  assert.equal(categoryWithOverrides([['old-row', 'gereedschap'], ['older-row', 'gereedschap']]), 'gereedschap');
  assert.equal(categoryWithOverrides([]), 'materiaal');
});

test('handmatige categorie op de huidige import-id heeft voorrang op oude keuzes', () => {
  assert.equal(categoryWithOverrides([['current-row', 'afval'], ['old-row', 'gereedschap'], ['older-row', 'materiaal']]), 'afval');
  assert.equal(categoryWithOverrides([['current-row', 'overig'], ['old-row', 'gereedschap']]), 'overig');
});

test('tegenstrijdige handmatige categorieën op oude import-ids worden Overig', () => {
  assert.equal(categoryWithOverrides([['old-row', 'gereedschap'], ['older-row', 'materiaal']]), 'overig');
});

test('ledger gebruikt dezelfde merkherkenning voor tankstations en ontbrekende tegenpartijnamen', () => {
  const transactions = ['BCK*SHELL DEN RUYGENHO', 'CCV*BP LASERDREEF', 'Circle K', 'CircleK', 'Total NN1234']
    .map((name, index) => row(`fuel-${index}`, 'new', `fuel-${index}`, { counterparty_name: name }));
  transactions.push(row('placeholder', 'new', 'placeholder', { counterparty_name: '.', description: 'BCK*NL12345 Tamoil' }));
  const result = ledger.buildFinanceBankLedger({ userId: 'owner', transactions, costs: [] });
  assert.equal(result.length, 6);
  assert.ok(result.every(item => item.category === 'brandstof'));
  assert.ok(result.every(item => item.category_override === undefined));
  assert.ok(result.every(item => item.amount === 100 && item.source_cost_ids.length === 0));
});

test('ledger geeft documentcategorie voorrang op stationnaam en daarna een bewuste bankoverride', () => {
  const transaction = row('fuel', 'new', 'fuel', { counterparty_name: 'Shell' });
  const cost = { id: 'wash-receipt', paid_bank_transaction_id: 'fuel', amount_incl_btw: 100,
    supplier_name: 'Shell', description: 'Wasstraat', receipt_files: [], date: '2026-07-01', category: 'autokosten' };
  const base = { userId: 'owner', transactions: [transaction], costs: [cost] };
  const documented = ledger.buildFinanceBankLedger(base)[0];
  assert.equal(documented.category, 'autokosten');
  assert.equal(documented.category_override, undefined);
  assert.deepEqual(documented.source_cost_ids, ['wash-receipt']);
  const corrected = ledger.buildFinanceBankLedger({ ...base, categoryOverrides: new Map([['fuel', 'overig']]) })[0];
  assert.equal(corrected.category, 'overig');
  assert.equal(corrected.category_override, 'overig');
  assert.deepEqual(corrected.source_cost_ids, ['wash-receipt']);
});

test('historische brandstof-overrides en conflicten overleven de projectie zonder bon', () => {
  const transaction = { ...row('current-row', 'new', 'fuel', { counterparty_name: 'Shell', amount: -200.56 }),
    source_transaction_ids: ['current-row', 'old-row', 'older-row'] };
  const cases = [
    { entries: [['old-row', 'overig']], category: 'overig' },
    { entries: [['old-row', 'autokosten'], ['older-row', 'autokosten']], category: 'autokosten' },
    { entries: [['old-row', 'autokosten'], ['older-row', 'brandstof']], category: 'overig' },
    { entries: [['current-row', 'brandstof'], ['old-row', 'autokosten'], ['older-row', 'overig']], category: 'brandstof' },
    { entries: [['current-row', 'overig'], ['old-row', 'brandstof']], category: 'overig' },
  ];
  for (const { entries, category } of cases) {
    const ledgerRows = ledger.buildFinanceBankLedger({ userId: 'owner', transactions: [transaction], costs: [],
      categoryOverrides: new Map(entries) });
    assert.equal(ledgerRows[0].category, category);
    assert.equal(ledgerRows[0].category_override, category);
    const result = buildKnabCostList({ userId: 'owner', transactions: [transaction], costs: [], ledgerRows, internalTransferIds: new Set() });
    assert.equal(result.data[0].category, category);
    assert.equal(result.data[0].bank_category, category);
    assert.equal(result.data[0].has_supporting_document, false);
    assert.equal(result.data[0].vat_known, false);
    assert.equal(result.bankReconciliation.debitTotal, 200.56);
    assert.equal(result.bankReconciliation.transactionCount, 1);
  }
});

test('bank transaction_id werkt als entry_reference ontbreekt; importhash geldt niet als bankidentiteit', () => {
  const result = select([
    row('a', 'old', null, { raw: { transaction_id: 'bank-unique' } }),
    row('b', 'new', null, { raw: { transaction_id: 'bank-unique' } }),
    row('c', 'new', null, { external_transaction_id: 'same-import-hash' }),
    row('d', 'old', null, { external_transaction_id: 'same-import-hash' }),
  ]);
  assert.equal(result.transactions.length, 3);
  assert.equal(result.metadata.unidentifiedTransactionCount, 2);
});

test('tegenstrijdige gegevens onder hetzelfde bankkenmerk worden niet stil weggefilterd', () => {
  for (const changes of [{ amount: -101 }, { booking_date: '2026-07-02' }, { currency: 'USD' }]) {
    assert.throws(() => select([row('a', 'new', 'same'), row('b', 'old', 'same', changes)]), /afwijkende boekingsgegevens/);
  }
});

test('meerdere fysieke rekeningen vragen een keuze; expliciete IBAN houdt ze gescheiden', () => {
  const rows = [row('a', 'new', 'same'), row('b', 'personal', 'same')];
  assert.throws(() => select(rows), /meerdere Knab-rekeningen/);
  assert.deepEqual(select(rows, { iban: secondIban.toLowerCase() }).transactions.map((item) => item.id), ['b']);
  assert.equal(select(rows, { iban }).metadata.iban, iban);
});

test('lege nevenrekening en vreemde bankgegevens worden niet bij de zakelijke rekening opgeteld', () => {
  const result = select([row('a'), row('foreign', 'someone-else'), row('bunq', 'bunq')], {
    accounts: [...accounts, { id: 'bunq', iban: 'NL91BUNQ0123456789' }],
  });
  assert.deepEqual(result.transactions.map((item) => item.id), ['a']);
  assert.equal(result.metadata.iban, iban);
});

test('bedragen zonder geldig bewijs worden niet stil als nul verwerkt', () => {
  for (const amount of [null, undefined, '', 'geen bedrag']) {
    assert.throws(() => select([row('a', 'new', 'a', { amount })]), /geen geldig bedrag/);
  }
});

function mockClient(data, failureTable = null) {
  const calls = [];
  return {
    calls,
    from(table) {
      const filters = [];
      let page = null;
      const builder = {
        select() { return builder; },
        eq(key, value) { filters.push([key, value]); return builder; },
        in(key, values) { filters.push([key, values]); return builder; },
        order() { return builder; },
        range(start, end) { page = [start, end]; return builder; },
        then(resolve, reject) {
          calls.push({ table, filters, page });
          if (table === failureTable) return Promise.resolve({ data: null, error: { message: 'unavailable' } }).then(resolve, reject);
          let rows = (data[table] || []).filter((item) => filters.every(([key, value]) => Array.isArray(value) ? value.includes(item[key]) : item[key] === value));
          if (page) rows = rows.slice(page[0], page[1] + 1);
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

test('loader doorloopt meer dan 1000 bronrijen en neemt verlopen verbindingen mee, met eigendomsfilter', async () => {
  const transactions = Array.from({ length: 501 }, (_, index) => [
    row(`new-${index}`, 'new', `bank-${index}`), row(`old-${index}`, 'old', `bank-${index}`),
  ]).flat();
  const client = mockClient({
    bank_connections: [
      { id: 'current', provider: 'enablebanking', user_id: 'owner', status: 'connected', last_synced_at: '2026-10-23T18:00:00Z' },
      { id: 'expired', provider: 'enablebanking', user_id: 'owner', status: 'revoked', last_synced_at: '2026-09-01T18:00:00Z' },
      { id: 'unowned', provider: 'enablebanking', user_id: 'someone-else', status: 'connected' },
    ],
    bank_accounts: accounts,
    bank_transactions: [...transactions, row('unowned', 'new', 'unowned', { user_id: 'someone-else' })],
  });
  const result = await loadLedger(client).loadKnabTransactionHistory('owner');
  assert.equal(result.transactions.length, 501);
  assert.ok(result.transactions.every((item) => item.id.startsWith('new-')));
  assert.equal(result.metadata.duplicateTransactionCount, 501);
  assert.equal(result.metadata.connected, true);
  assert.equal(result.metadata.lastSyncedAt, '2026-10-23T18:00:00Z');
  const transactionCalls = client.calls.filter((call) => call.table === 'bank_transactions');
  assert.deepEqual(transactionCalls.map((call) => call.page), [[0, 499], [500, 999], [1000, 1499]]);
  assert.ok(transactionCalls.every((call) => call.filters.some(([key, value]) => key === 'user_id' && value === 'owner')));
});

test('bewaarde historie blijft beschikbaar als de koppeling verlopen is', async () => {
  const client = mockClient({
    bank_connections: [{ id: 'expired', provider: 'enablebanking', user_id: 'owner', status: 'revoked' }],
    bank_accounts: accounts,
    bank_transactions: [row('historic', 'old')],
  });
  const result = await loadLedger(client).loadKnabTransactionHistory('owner');
  assert.equal(result.transactions.length, 1);
  assert.equal(result.metadata.connected, false);
});

test('een mislukte bronpagina levert geen schijnbaar compleet deelresultaat', async () => {
  const client = mockClient({
    bank_connections: [{ id: 'current', provider: 'enablebanking', user_id: 'owner', status: 'connected' }],
    bank_accounts: accounts,
  }, 'bank_transactions');
  await assert.rejects(loadLedger(client).loadKnabTransactionHistory('owner'), /Knab-transacties konden niet worden geladen/);
});
