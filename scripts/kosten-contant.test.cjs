const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });

const cash = require('../src/lib/kosten-cash');
const { isManualCashPurchase, mapProjectCostRow } = require('../src/lib/project-costs');
const { summarizeBankCostRows } = require('../src/lib/bank-cost-summary');
const id = 'd9ca28ac-09a4-4f79-b5e5-b1b5d9324c01';
const deposit = { id, date: '2026-09-09', amount: '1.250,50', description: '  Privéspaargeld  ', kind: 'deposit' };

function setup({ failOnceOnCompletion = false } = {}) {
  const deposits = new Map();
  const purchases = new Map();
  const scope = (uid) => ({
    orderBy: () => ({ get: async () => ({
      docs: [...deposits].filter(([key]) => key.startsWith(`${uid}/`)).map(([key, value]) => ({
        id: key.split('/')[1], data: () => value,
      })),
    }) }),
    doc: (id) => {
      const key = `${uid}/${id}`;
      return {
        create: async (value) => {
          if (deposits.has(key)) throw Object.assign(new Error('Already exists'), { code: 6 });
          deposits.set(key, value);
        },
        get: async () => ({ data: () => deposits.get(key) }),
        update: async (value) => {
          assert.ok(deposits.has(key));
          if (value.converted && failOnceOnCompletion) {
            failOnceOnCompletion = false;
            throw new Error('Firestore tijdelijk onbereikbaar');
          }
          deposits.set(key, { ...deposits.get(key), ...value });
        },
        delete: async () => deposits.delete(key),
      };
    },
  });
  const firestore = {
    runTransaction: (operation) => operation({
      get: (ref) => ref.get(),
      update: (ref, data) => ref.update(data),
      delete: (ref) => ref.delete(),
    }),
    collection: (name) => {
      assert.equal(name, 'users');
      return { doc: (uid) => ({ collection: (name) => {
        assert.equal(name, 'cash_deposits');
        return scope(uid);
      } }) };
    },
  };
  const dependencies = {
    '@/firebase/admin': { initFirebaseAdmin: () => ({ firestore }) },
    '@/lib/bank-api-auth': {
      extractBearerToken: (header) => header?.startsWith('Bearer '),
      resolveUid: async (request) => request.headers.get('authorization').slice(7),
      noStoreHeaders: () => ({ 'Cache-Control': 'no-store' }),
    },
    '@/lib/kosten-cash': cash,
    '@/lib/supabase-admin': {
      supabaseAdmin: { from: (table) => {
        assert.equal(table, 'project_costs');
        return {
          insert: async (row) => {
            if (purchases.has(row.id)) return { error: { code: '23505' } };
            purchases.set(row.id, row);
            return { error: null };
          },
          select: () => {
            const filters = {};
            const query = {
              eq: (field, value) => { filters[field] = value; return query; },
              maybeSingle: async () => {
                const row = purchases.get(filters.id);
                return { data: row?.user_id === filters.user_id ? row : null, error: null };
              },
            };
            return query;
          },
        };
      } },
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/app/api/kosten/contant/route.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(name => dependencies[name] || require(name), mod, mod.exports);
  return {
    deposits, purchases,
    request: (method, data, uid = 'owner') => mod.exports[method](new Request('https://studio.example/api/kosten/contant', {
      method, headers: uid ? { Authorization: `Bearer ${uid}` } : {},
      body: data ? JSON.stringify(data) : undefined,
    })),
  };
}

test('contante bedragen gebruiken centen en datum, categorie en omschrijving worden gevalideerd', () => {
  const today = '2026-11-20';
  assert.equal(cash.parseCashEntry(deposit, today).amountCents, 125050);
  assert.match(cash.parseCashEntry({ ...deposit, date: '2026-09-31' }, today), /geldige datum/);
  assert.match(cash.parseCashEntry({ ...deposit, date: '2026-11-21' }, today), /geldige datum/);
  assert.match(cash.parseCashEntry({ ...deposit, amount: '-1' }, today), /positief/);
  assert.match(cash.parseCashEntry({ ...deposit, kind: 'private-purchase', category: 'eigen_verbruik' }, today), /kostencategorie/);
  assert.match(cash.parseCashEntry({ ...deposit, kind: 'private-purchase', description: '' }, today), /gekocht/);
});

test('privé-inleg is per eigenaar, kan worden aangepast en een herhaalde aanvraag boekt niet dubbel', async () => {
  const { request, deposits, purchases } = setup();
  assert.equal((await request('POST', deposit, null)).status, 401);
  assert.equal((await request('POST', deposit)).status, 200);
  assert.equal((await request('POST', deposit)).status, 200);
  assert.equal((await request('POST', { ...deposit, amount: '50' })).status, 409);
  assert.equal(deposits.size, 1);
  assert.equal(purchases.size, 0);
  assert.deepEqual((await (await request('GET', null, 'other')).json()).deposits, []);
  await request('DELETE', { id }, 'other');
  assert.equal(deposits.size, 1);
  assert.equal((await request('POST', { ...deposit, editing: true, description: 'Bijgewerkt' })).status, 200);
  assert.deepEqual((await (await request('GET')).json()).deposits,
    [{ id, date: '2026-09-09', amountCents: 125050, description: 'Bijgewerkt' }]);
  assert.equal((await request('DELETE', { id })).status, 200);
  assert.equal(deposits.size, 0);
});

test('privé betaalde investering zonder bon telt één keer als kosten en wordt niet als kasinleg geboekt', async () => {
  const { request, purchases, deposits } = setup();
  const purchase = { ...deposit, kind: 'private-purchase', category: 'gereedschap', amount: '699,99', description: 'Telefoon' };
  assert.equal((await request('POST', purchase)).status, 200);
  assert.equal((await request('POST', purchase)).status, 200);
  assert.equal(purchases.size, 1);
  assert.equal(deposits.size, 0);
  const row = mapProjectCostRow(purchases.get(id));
  assert.equal(isManualCashPurchase(row), true);
  assert.equal(cash.isPrivateCashPurchase(row), true);
  assert.equal(cash.isPrivateCashPurchase({ ...row, supplier_order_number: cash.cashPurchaseReference(id, false) }), false);
  assert.equal(row.payment_status, 'paid');
  assert.equal(row.btw_amount, 0);
  assert.deepEqual(row.receipt_files, []);
  const summary = summarizeBankCostRows([row]);
  assert.equal(summary.counts.alle, 1);
  assert.equal(summary.totals.gereedschap, 699.99);
  assert.equal(summary.privateSummary.depositTotal, 0);
});

test('omzetten verplaatst de bestaande privé-inleg naar Investering en behoudt datum en bedrag', async () => {
  const { request, purchases } = setup();
  const conversion = { ...deposit, kind: 'private-purchase', editing: true, category: 'gereedschap' };
  assert.equal((await request('POST', deposit)).status, 200);
  assert.equal((await request('POST', conversion, 'other')).status, 404);
  assert.equal((await request('POST', conversion)).status, 200);
  assert.equal((await request('POST', conversion)).status, 200);
  assert.equal(purchases.size, 1);
  assert.deepEqual((await (await request('GET')).json()).deposits, []);
  const row = mapProjectCostRow(purchases.get(id));
  assert.equal(row.date, deposit.date);
  assert.equal(row.description, 'Privéspaargeld');
  assert.equal(summarizeBankCostRows([row]).totals.gereedschap, 1250.50);
});

test('een onderbroken omzetting kan worden hervat zonder dubbele aankoop of inleg', async (t) => {
  t.mock.method(console, 'error', () => undefined);
  const { request, purchases } = setup({ failOnceOnCompletion: true });
  const conversion = { ...deposit, kind: 'private-purchase', editing: true, category: 'materiaal' };
  assert.equal((await request('POST', deposit)).status, 200);
  assert.equal((await request('POST', conversion)).status, 500);
  assert.equal(purchases.size, 1);
  const pending = (await (await request('GET')).json()).deposits[0];
  assert.equal(pending.conversion.category, 'materiaal');
  assert.equal((await request('POST', { ...conversion, category: 'gereedschap' })).status, 409);
  assert.equal((await request('DELETE', { id })).status, 409);
  assert.equal((await request('POST', conversion)).status, 200);
  assert.equal(purchases.size, 1);
  assert.deepEqual((await (await request('GET')).json()).deposits, []);
});
