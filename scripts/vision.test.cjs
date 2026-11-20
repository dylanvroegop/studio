const test = require('node:test');
const assert = require('node:assert/strict');
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs', moduleResolution: 'node' });
require('ts-node/register/transpile-only');
const {
  emptyWorkspace,
  blankEntry,
  workspaceSchema,
  validWorkspace,
  retainsHistory,
  shiftMonth,
  newGoal,
} = require('../src/lib/vision/model');
const { project, noFinance, cashInputs, receiptCheck } = require('../src/lib/vision/projection');
const { mergeEdits } = require('../src/lib/vision/merge');
const { evidence } = require('../src/lib/vision/evidence');

function fixture() {
  const w = emptyWorkspace();
  Object.assign(w.manual, { bank: 20000, cash: 1000, debt: 1000, vat: 500, tax: 500, bills: 0 });
  Object.assign(w.scenario, {
    start: '2026-11-20',
    months: 1,
    revenue: 10000,
    operating: 2000,
    lease: 500,
    ownership: 200,
    workLiving: 500,
    taxRate: 25,
    vatRate: 20,
    buffer: 5000,
    price: 12000,
    extras: 0,
    travel: 800,
  });
  return { w, f: noFinance() };
}
test('reserveert belasting en verplichtingen exact één keer en scheidt cash van vrije ruimte', () => {
  const { w, f } = fixture();
  const p = project(w, f);
  assert.equal(p.afterWork, 28000);
  assert.equal(p.afterPurchase, 16000);
  assert.equal(p.freeAtDeparture, 7000);
  assert.equal(p.runway, 7);
  assert.equal(p.threshold, '2027-07-20');
  assert.equal(p.points[3].reserved, 0);
  assert.equal(p.points[3].free, 5000);
});
test('werkt met onbekende bronnen, echte nullen, twee rekeningen en negatieve runway', () => {
  const { w, f } = fixture();
  w.manual.cash = null;
  assert.equal(project(w, f), null);
  w.manual.cash = 0;
  w.scenario.price = 99999;
  assert.equal(project(w, f).runway, 0);
  f.accounts = [{ amount: 300 }, { amount: -100 }];
  assert.equal(cashInputs(w, f).bank, 200);
  f.accounts[1].amount = null;
  assert.equal(cashInputs(w, f).bank, 20000);
  w.manual.bank = null;
  assert.equal(project(w, f), null);
});
test('ontvangt alleen bevestigde restbedragen één keer op gekozen datum', () => {
  const { w, f } = fixture();
  w.scenario.collect = true;
  f.invoices = [
    { id: 'a', amount: 500, label: 'Test' },
    { id: 'b', amount: 800, label: 'Test' },
  ];
  w.manual.confirmed = { a: '2027-01-08' };
  w.manual.receiptChecks.a = receiptCheck(w, f, f.invoices[0]);
  w.manual.invoices = 1500;
  const p = project(w, f);
  assert.equal(p.points[1].income, 12000);
  assert.equal(p.points[2].income, 500);
  assert.equal(p.points[3].income, 0);
  f.history.cashDeposits = 9000;
  assert.equal(project(w, f).afterPurchase, p.afterPurchase);
  w.manual.bank += 500;
  assert.equal(project(w, f), null);
});
test('vertraagde ontvangst, hernieuwd werken en inflatie gebruiken maandelijkse kasstromen', () => {
  const { w, f } = fixture();
  w.scenario.lag = 2;
  w.scenario.repeat = true;
  w.scenario.annual = 1;
  w.scenario.inflation = true;
  const p = project(w, f);
  assert.equal(p.points[1].income, 0);
  assert.equal(p.points[3].income, 12000);
  assert.equal(p.points[15].income, 12000);
  assert(p.points[2].out > 1000);
  assert.equal(p.simple, false);
});
test('leasen zonder extra werk en zonder toekomstige kosten vereist geen werkbegroting', () => {
  const { w, f } = fixture();
  Object.assign(w.scenario, {
    work: false,
    buy: false,
    invest: false,
    operating: null,
    ownership: null,
    workLiving: null,
    taxRate: null,
    vatRate: null,
  });
  const p = project(w, f);
  assert.equal(p.afterPurchase, 21000);
  assert.equal(p.freeAtDeparture, 14000);
  assert.equal(p.burn, 1300);
  w.scenario.travel = 0;
  w.scenario.lease = 0;
  assert.equal(project(w, f).runway, null);
});
test('rekent nooit reeds verstreken werkmaanden op een nieuw banksaldo', () => {
  const { w, f } = fixture();
  f.asOf = '2027-01-22T23:05:00Z';
  assert.equal(project(w, f).departure, '2027-02-23');
  assert.equal(shiftMonth('2028-01-31', 1), '2028-02-29');
});
test('verwerpt verwijderde of herschreven originele versies en cyclische doelen', () => {
  const { w } = fixture();
  w.notes = [
    {
      id: 'n',
      ai: false,
      created: '2026-11-20T12:00:00Z',
      versions: [{ ...blankEntry(), id: 'v', at: '2026-11-20T12:00:00Z', body: 'origineel' }],
    },
  ];
  const fresh = workspaceSchema.parse(JSON.parse(JSON.stringify(w)));
  const old = workspaceSchema.parse(w);
  assert(retainsHistory(old, fresh));
  fresh.notes[0].versions[0].body = 'overschreven';
  assert(!retainsHistory(old, fresh));
  assert(!retainsHistory(old, { ...fresh, notes: [] }));
  const a = newGoal(),
    b = newGoal();
  a.dependencies = [b.id];
  b.dependencies = [a.id];
  assert(!validWorkspace({ ...w, goals: [a, b] }));
});
test('voegt onafhankelijke wijzigingen van twee apparaten samen en detecteert conflicten', () => {
  assert.deepEqual(mergeEdits({ a: 1, b: 1 }, { a: 2, b: 1 }, { a: 1, b: 2 }), { a: 2, b: 2 });
  assert.throws(() => mergeEdits(1, 2, 3));
  assert.deepEqual(mergeEdits([], [{ id: 'a' }], [{ id: 'b' }]), [{ id: 'b' }, { id: 'a' }]);
});
test('AI-bronnen respecteren globale, individuele en periodegebonden toestemming, ook na intrekken', () => {
  const { w } = fixture();
  const v = (id, at) => ({ ...blankEntry(), id, at, body: id });
  w.notes = [
    {
      id: 'n',
      ai: true,
      created: '2026-11-01T12:00:00Z',
      versions: [v('vroeger', '2026-11-01T12:00:00Z'), v('nu', '2026-11-20T12:00:00Z')],
    },
    {
      id: 'geheim',
      ai: false,
      created: '2026-11-20T12:00:00Z',
      versions: [v('anders', '2026-11-20T12:00:00Z')],
    },
  ];
  assert.equal(evidence(w, 'month', '2026-11-20').sources.length, 0);
  w.consent.enabled = true;
  w.consent.notes = true;
  assert.deepEqual(
    evidence(w, 'week', '2026-11-20').sources.map((s) => s.version),
    ['nu'],
  );
  assert.deepEqual(
    evidence(w, 'month', '2026-11-20').sources.map((s) => s.version),
    ['vroeger', 'nu'],
  );
  w.notes[0].ai = false;
  assert.equal(evidence(w, 'month', '2026-11-20').sources.length, 0);
});
