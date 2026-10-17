import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJobFinanceReports, reportDate, previousReportDate, type JobReportInput } from './job-finance-report';

const final = { id: 'end', invoiceType: 'eind', status: 'verzonden', quoteId: 'q', sentAt: '2026-10-10T21:00:00Z', invoiceNumberLabel: '2026001',
  totalsSnapshot: { totaalExclBtw: 800, btw: 168, totaalInclBtw: 968 }, paymentSummary: { paidAmount: 100 } };
const cost = { id: 'cost', offerte_id: 'q', category: 'materiaal', date: '2026-10-02', status: 'confirmed', amount_excl_btw: 100, amount_incl_btw: 121, btw_percentage: 21 };
function input(patch: Partial<JobReportInput> = {}): JobReportInput {
  return { now: new Date('2026-10-11T06:00:00Z'), invoices: [final], quotes: [{ id: 'q', titel: 'Keuken' }], costs: [cost], hours: [
    { quote_id: 'q', work_date: '2026-10-01', worked_hours: 4 }, { quote_id: 'q', work_date: '2026-10-02', worked_hours: 6 },
    { quote_id: 'q', work_date: '2026-10-02', worked_hours: 2 },
  ], ...patch };
}
test('next Amsterdam morning, DST and sentAt only; never creation or updatedAt', () => {
  assert.equal(reportDate('2026-10-10T22:30:00Z'), '2026-10-11');
  assert.equal(previousReportDate(new Date('2026-03-29T06:00:00Z')), '2026-03-28');
  assert.equal(previousReportDate(new Date('2026-10-25T07:00:00Z')), '2026-10-24');
  assert.equal(buildJobFinanceReports(input({ invoices: [{ ...final, sentAt: null, createdAt: '2026-10-10' }] })).length, 0);
  assert.equal(buildJobFinanceReports(input({ invoices: [{ ...final, sentAt: '2026-10-11' }] })).length, 0);
  for (const patch of [{ status: 'concept' }, { status: 'geannuleerd' }, { invoiceType: 'voorschot' }, { combinedContext: { type: 'meerwerkbon_combined', meerwerkbonId: 'm' } }]) {
    assert.equal(buildJobFinanceReports(input({ invoices: [{ ...final, ...patch }] })).length, 0);
  }
});
test('advances and remaining final amount counted once, receipts separate; workdays are unique', () => {
  const advance = { ...final, id: 'advance', invoiceType: 'voorschot', totalsSnapshot: { totaalExclBtw: 200, btw: 42, totaalInclBtw: 242 }, paymentSummary: { paidAmount: 242 } };
  const report = buildJobFinanceReports(input({ invoices: [final, advance] }))[0];
  assert.equal(report.revenueIncl, 1210);
  assert.equal(report.receivedIncl, 342);
  assert.equal(report.profitExcl, 900);
  assert.equal(report.perHour, 75);
  assert.equal(report.perDay, 450);
  assert.equal(report.days, 2);
});
test('each purchase line category and quote are respected; header is not counted again', () => {
  const report = buildJobFinanceReports(input({ costs: [{ ...cost, amount_excl_btw: 120, line_items: [
    { description: 'Platen', category: 'materiaal', offerte_id: 'q', total_price: 70 },
    { description: 'Boor', category: 'gereedschap', offerte_id: 'q', total_price: 20 },
    { description: 'Andere klus', offerte_id: 'other', total_price: 30 },
  ] }] }))[0];
  assert.equal(report.costsExcl, 70);
  assert.equal(report.toolsExcl, 20);
  assert.match(report.messages.join(''), /\[Gereedschap\].*\n  Boor/);
  assert.doesNotMatch(report.messages.join(''), /Andere klus/);
});
test('all tools remain informational and never reduce profit, even when quote-linked', () => {
  const report = buildJobFinanceReports(input({ costs: [cost,
    { ...cost, id: 'own-tool', category: 'gereedschap', amount_excl_btw: 20 },
    { ...cost, id: 'extra-tool', offerte_id: null, category: 'gereedschap', amount_excl_btw: 30 },
    { ...cost, id: 'future-tool', offerte_id: null, category: 'gereedschap', date: '2026-10-03', amount_excl_btw: 500 },
  ] }))[0];
  assert.equal(report.toolsExcl, 50);
  assert.equal(report.profitExcl, 700);
  assert.match(report.messages.join(''), /wordt nergens van de winst afgetrokken/);
});
test('missing net VAT totals and hours remain unknown, receipts remain visible', () => {
  const report = buildJobFinanceReports(input({ invoices: [{ ...final, totalsSnapshot: { totaalInclBtw: 968 } }], hours: [] }))[0];
  assert.equal(report.revenueExcl, null);
  assert.equal(report.profitExcl, null);
  assert.equal(report.perHour, null);
  assert.equal(report.toolsExcl, null);
  assert.equal(report.receivedIncl, 100);
});
test('undated hours cannot establish a reliable purchase period', () => {
  const report = buildJobFinanceReports(input({ hours: [
    { quote_id: 'q', work_date: '2026-10-01', worked_hours: 4 },
    { quote_id: 'q', work_date: null, worked_hours: 4 },
  ] }))[0];
  assert.equal(report.hours, null);
  assert.equal(report.firstDay, null);
  assert.equal(report.toolsExcl, null);
});
test('combined invoices have one combined report; cross-project advances are not silently allocated', () => {
  const combined = buildJobFinanceReports(input({ invoices: [{ ...final, combinedQuoteIds: ['q', 'q2'] }] }))[0];
  assert.deepEqual(combined.quoteIds, ['q', 'q2']);
  const ambiguous = buildJobFinanceReports(input({ invoices: [final, { ...final, id: 'advance', invoiceType: 'voorschot', combinedQuoteIds: ['q', 'q2'] }] }))[0];
  assert.equal(ambiguous.receivedIncl, null);
  assert.equal(ambiguous.profitExcl, null);
});
test('unconfirmed/mismatched costs do not produce confident profit, private and transfers excluded', () => {
  const invalid = buildJobFinanceReports(input({ costs: [{ ...cost, line_items: [{ total_price: 50 }] }] }))[0];
  assert.equal(invalid.profitExcl, null);
  const privateCosts = buildJobFinanceReports(input({ costs: [{ ...cost, category: 'eigen_verbruik' }, { ...cost, id: 'transfer', category: 'profit' }] }))[0];
  assert.equal(privateCosts.costsExcl, 0);
});
test('long purchase lists split without losing a line', () => {
  const report = buildJobFinanceReports(input({ costs: Array.from({ length: 100 }, (_, i) => ({ ...cost, id: String(i), description: `Productregel ${i}` })) }))[0];
  assert.ok(report.messages.length > 1);
  assert.ok(report.messages.every(message => message.length < 4096));
  for (let i = 0; i < 100; i++) assert.match(report.messages.join(''), new RegExp(`Productregel ${i}`));
});
