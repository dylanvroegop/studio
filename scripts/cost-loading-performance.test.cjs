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
    throw new Error(`Unexpected dependency: ${name}`);
  }, module, module.exports);
  return module.exports;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const { deduplicateRequest } = loadSource('src/lib/deduplicate-request.ts');
const { refreshBankData } = loadSource('src/lib/refresh-bank-data.ts');
const projectCosts = loadSource('src/lib/project-costs.ts');
const { buildFinanceBankLedger, splitFinanceBankLedgerRowsByCategory } = loadSource('src/lib/finance-bank-ledger.ts', {
  '@/lib/project-costs': projectCosts,
  '@/lib/supabase-admin': {},
});

const transaction = (overrides = {}) => ({
  id: 'payment', amount: -121, booking_date: '2026-09-24',
  counterparty_name: 'Supplier', description: 'Card payment', ...overrides,
});
const cost = (overrides = {}) => projectCosts.mapProjectCostRow({
  id: 'cost', user_id: 'user', supplier_name: 'Supplier', date: '2026-09-24',
  amount_incl_btw: 121, amount_excl_btw: 100, category: 'materiaal', ...overrides,
});

test('simultaneous loads share a request but later reads are fresh', async () => {
  let reads = 0;
  const waiting = deferred();
  const read = deduplicateRequest(async () => { reads += 1; return waiting.promise; });
  const first = read();
  const second = read();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(reads, 1);
  waiting.resolve(['cost']);
  assert.deepEqual(await first, ['cost']);
  await read();
  assert.equal(reads, 2, 'a save/refetch must not reuse a settled ledger snapshot');
});

test('failed loads can retry, and separate users never share a read', async () => {
  let attempts = 0;
  const read = deduplicateRequest(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('offline');
    return 'user-a';
  });
  await assert.rejects(read(), /offline/);
  assert.equal(await read(), 'user-a');
  const other = deduplicateRequest(async () => 'user-b');
  assert.deepEqual(await Promise.all([read(), other()]), ['user-a', 'user-b']);
});

test('a save starts a fresh read even while the initial request is pending', async () => {
  const initial = deferred();
  const saved = deferred();
  let reads = 0;
  const read = deduplicateRequest(() => (++reads === 1 ? initial.promise : saved.promise));
  const first = read();
  await Promise.resolve();
  const fresh = read(true);
  await Promise.resolve();
  assert.equal(reads, 2);
  initial.resolve(['old']);
  await first;
  assert.equal(read(), fresh, 'older completion must not evict the newer pending read');
  saved.resolve(['saved']);
  assert.deepEqual(await fresh, ['saved']);
});

test('stored bank data is read before slow sync completes and refreshed afterwards', async () => {
  const sync = deferred();
  const events = [];
  const run = refreshBankData({
    readInitial: async () => { events.push('visible'); },
    synchronize: () => { events.push('sync'); return sync.promise; },
    readUpdated: async () => { events.push('updated'); },
  });
  await Promise.resolve();
  assert.deepEqual(events, ['visible', 'sync']);
  sync.resolve();
  await run;
  assert.deepEqual(events, ['visible', 'sync', 'updated']);
});

test('a slow initial response cannot overwrite post-sync financial data', async () => {
  const initial = deferred();
  let current = null;
  const run = refreshBankData({
    readInitial: async () => { await initial.promise; current = 'old'; },
    synchronize: async () => undefined,
    readUpdated: async () => { current = 'fresh'; },
  });
  await Promise.resolve();
  assert.equal(current, null);
  initial.resolve();
  await run;
  assert.equal(current, 'fresh');
});

test('sync failure preserves available read and surfaces error without marking it current', async () => {
  let visible = false;
  let updated = false;
  await assert.rejects(refreshBankData({
    readInitial: async () => { visible = true; },
    synchronize: async () => { throw new Error('bank offline'); },
    readUpdated: async () => { updated = true; },
  }), /bank offline/);
  assert.equal(visible, true);
  assert.equal(updated, false);
});

test('successful sync recovers a failed initial read', async () => {
  let updated = false;
  await refreshBankData({
    readInitial: async () => { throw new Error('initial request failed'); },
    synchronize: async () => undefined,
    readUpdated: async () => { updated = true; },
  });
  assert.equal(updated, true);
});

test('explicit payment links and proportional VAT/category splitting remain authoritative', () => {
  const costs = [cost({ id: 'material', amount_incl_btw: 80, paid_bank_transaction_id: 'payment' }),
    cost({ id: 'tools', amount_incl_btw: 40, category: 'gereedschap', paid_bank_transaction_id: 'payment' })];
  const rows = buildFinanceBankLedger({ userId: 'user', costs, transactions: [transaction()] });
  assert.deepEqual(rows[0].source_cost_ids, ['material', 'tools']);
  const split = splitFinanceBankLedgerRowsByCategory({ costs, rows });
  assert.equal(split.length, 2);
  assert.equal(Math.round(split.reduce((sum, row) => sum + row.amount, 0) * 100), 12100);
});

test('exact historical matches are retained but ambiguous equal amounts stay unmatched', () => {
  const historical = cost({ date: '2025-01-01' });
  const rows = buildFinanceBankLedger({ userId: 'user', costs: [historical], transactions: [transaction()] });
  assert.deepEqual(rows[0].source_cost_ids, ['cost']);
  const ambiguous = buildFinanceBankLedger({ userId: 'user', costs: [historical, { ...historical, id: 'other' }], transactions: [transaction()] });
  assert.equal(ambiguous[0].match_status, 'unmatched');
});

test('matching normalizes metadata once per row instead of once per cost/payment pair', () => {
  const count = 200;
  const costs = Array.from({ length: count }, (_, index) => cost({ id: `cost-${index}`, supplier_name: `Vendor ${index}`, source_filename: `receipt-${index}.pdf` }));
  const payments = Array.from({ length: count }, (_, index) => transaction({ id: `payment-${index}`, counterparty_name: `Unmatched ${index}`, amount: -9876 }));
  const originalNormalize = String.prototype.normalize;
  let normalizations = 0;
  String.prototype.normalize = function (...args) {
    normalizations += 1;
    return originalNormalize.apply(this, args);
  };
  let rows;
  try {
    rows = buildFinanceBankLedger({ userId: 'user', costs, transactions: payments });
  } finally {
    String.prototype.normalize = originalNormalize;
  }
  assert.equal(rows.length, count);
  assert.ok(rows.every((row) => row.match_status === 'unmatched'));
  assert.ok(normalizations < count * 10, `Unexpected repeated normalization: ${normalizations}`);
});
