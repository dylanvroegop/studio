const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { reportMonths, isReportDate, isReportTimeEntry, reportEarnings, reportElapsed } = require('../src/lib/kosten-report-period');
test('juni tot oktober is vijf maanden, november zes', () => {
  assert.equal(reportMonths('2026-10-24').length, 5);
  assert.equal(reportMonths('2026-11-01').length, 6);
});
test('kosten en credits gebruiken dezelfde begindatum en maand', () => {
  assert.equal(isReportDate('2026-06-09', 'all', '2026-10-24'), false);
  assert.equal(isReportDate('2026-06-10', 'all', '2026-10-24'), true);
  assert.equal(isReportDate('2026-10-26', 'all', '2026-10-24'), false);
  assert.equal(isReportDate('2026-07-23', '2026-08', '2026-10-24'), false);
});
test('GPS-uren tellen vanaf dezelfde datum als kosten mee', () => {
  assert.equal(isReportTimeEntry({ work_date: '2026-06-09', source: 'gps_tracking_confirm', onsite_minutes: 300 }, '2026-10-24'), false);
  assert.equal(isReportTimeEntry({ work_date: '2026-06-10', source: 'gps_tracking_confirm', onsite_minutes: 300 }, '2026-10-24'), true);
});
test('oude handmatige uren worden niet als GPS-dagen opgevraagd', () => {
  assert.equal(isReportTimeEntry({ work_date: '2026-07-16', source: 'manual', worked_hours: 8 }, '2026-10-24'), false);
  assert.equal(isReportTimeEntry({ work_date: '2026-07-23', source: 'gps_tracking_confirm', onsite_minutes: 300 }, '2026-10-24'), true);
});
test('bedrag gedeeld door uren; potentieel schaalt naar 240 uur per maand', () => {
  const value = reportEarnings(30000, 600 * 60, 5);
  assert.deepEqual(value, { hourly: 50, monthly: 6000, potentialMonthly: 12000, potentialTotal: 60000, potentialHours: 1200 });
  assert.equal(reportEarnings(30000, 600 * 60, 6).potentialTotal, 72000);
  assert.equal(reportEarnings(null, 600, 5).hourly, null);
  assert.equal(reportEarnings(100, 0, 5).hourly, null);
});

test('verstreken tijd is geen telling van aangeraakte kalendermaanden', () => {
  assert.deepEqual(reportElapsed('2026-10-24'), { days: 136, months: 4, remainingDays: 14 });
  assert.deepEqual(reportElapsed('2026-11-26'), { days: 169, months: 5, remainingDays: 16 });
  assert.deepEqual(reportElapsed('2026-06-10'), { days: 0, months: 0, remainingDays: 0 });
});
