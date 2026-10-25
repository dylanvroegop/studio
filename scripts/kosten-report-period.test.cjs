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
  assert.deepEqual(value, { hourly: 50, monthly: 6000, potentialMonthly: 12000, potentialTotal: 60000, potentialHours: 1200, potentialHourly: 50 });
  assert.equal(reportEarnings(30000, 600 * 60, 6).potentialTotal, 72000);
  assert.equal(reportEarnings(null, 600, 5).hourly, null);
  assert.equal(reportEarnings(100, 0, 5).hourly, null);
});

test('verstreken tijd is geen telling van aangeraakte kalendermaanden', () => {
  assert.deepEqual(reportElapsed('2026-10-24'), { days: 136, months: 4, remainingDays: 14 });
  assert.deepEqual(reportElapsed('2026-11-26'), { days: 169, months: 5, remainingDays: 16 });
  assert.deepEqual(reportElapsed('2026-06-10'), { days: 0, months: 0, remainingDays: 0 });
});


test('aangepaste begindatum werkt voor kosten, credits, GPS en maandgemiddelden', () => {
  const start = '2026-08-15';
  assert.deepEqual(reportMonths('2026-10-24', start), ['2026-08', '2026-09', '2026-10']);
  assert.equal(isReportDate('2026-08-14', 'all', '2026-10-24', start), false);
  assert.equal(isReportDate(start, 'all', '2026-10-24', start), true);
  assert.equal(isReportDate(start, '2026-09', '2026-10-24', start), false);
  assert.equal(isReportTimeEntry({ work_date: start, source: 'gps_tracking_confirm', onsite_minutes: 60 }, '2026-10-24', start), true);
  assert.equal(isReportTimeEntry({ work_date: '2026-08-14', source: 'gps_tracking_confirm', onsite_minutes: 60 }, '2026-10-24', start), false);
  assert.deepEqual(reportElapsed('2026-10-24', start), { days: 70, months: 2, remainingDays: 9 });
  assert.equal(reportEarnings(900, 60, reportMonths('2026-10-24', start).length).monthly, 300);
  assert.equal(isReportDate('2026-01-01', 'all', '2026-10-24', '2026-01-01'), true);
});

test('begindatum valideert echte datums en weigert toekomstige datums', () => {
  const { isValidReportStart } = require('../src/lib/kosten-report-period');
  for (const value of ['', null, '2026-02-30', '2026-13-01', '2026-10-25', '1899-01-01']) {
    assert.equal(isValidReportStart(value, '2026-10-24'), false);
  }
  assert.equal(isValidReportStart('2024-02-29', '2026-10-24'), true);
  assert.equal(isValidReportStart('2026-10-24', '2026-10-24'), true);
  assert.deepEqual(reportElapsed('2026-03-01', '2026-01-31'), { days: 29, months: 1, remainingDays: 1 });
});


test('vaste lasten schalen niet mee met extra werkuren', () => {
  // 600 uur leverde 30.000 op na 5.000 vaste lasten over vijf maanden.
  // Bij 1.200 uur verdubbelt de marge vóór vaste lasten tot 70.000.
  const result = reportEarnings(30000, 600 * 60, 5, 5000);
  assert.equal(result.hourly, 50);
  assert.equal(result.monthly, 6000);
  assert.equal(result.potentialTotal, 65000);
  assert.equal(result.potentialMonthly, 13000);
  assert.equal(result.potentialHourly, 65000 / 1200);
  assert.equal(reportEarnings(30000, 1200 * 60, 5, 5000).potentialTotal, 30000);
  assert.equal(reportEarnings(null, 600, 5, 5000).potentialTotal, null);
  assert.equal(reportEarnings(30000, 0, 5, 5000).potentialTotal, null);
  assert.equal(reportEarnings(30000, 600, 0, 5000).potentialTotal, null);
});

test('alleen resterende telefoon-, privé- en storagekosten zijn vast', () => {
  const { remainingFixedCosts } = require('../src/lib/bank-cost-scenario');
  const totals = { telefoon: 728.90, eigen_verbruik: 8000, storage: 437.96, brandstof: 4629.22 };
  assert.equal(remainingFixedCosts(totals, { telefoon: 300, eigen_verbruik: 1500, brandstof: 1500 }), 7366.86);
  assert.equal(remainingFixedCosts(totals, { telefoon: 728.90, eigen_verbruik: 8000, storage: 437.96 }), 0);
  assert.equal(remainingFixedCosts(totals, { telefoon: 900, eigen_verbruik: 9000, storage: 500 }), 0);
});

test('deelmaanden tellen proportioneel, ook schrikkelfebruari en een enkele dag', () => {
  const { reportPeriodMonths } = require('../src/lib/kosten-report-period');
  assert.equal(reportPeriodMonths('2026-07-01', '2026-07-31'), 1);
  assert.equal(reportPeriodMonths('2024-02-01', '2024-02-29'), 1);
  assert.equal(reportPeriodMonths('2026-07-31', '2026-07-31'), 1 / 31);
  assert.ok(Math.abs(reportPeriodMonths('2026-06-22', '2026-10-24') - (9 / 30 + 3 + 24 / 31)) < 1e-10);
});
test('periodecorrectie blijft berekenbaar bij gedeeltelijke overlap zonder extra uren te maken', () => {
  const { reportOverlapFraction } = require('../src/lib/kosten-report-period');
  const june = reportOverlapFraction('2026-06-22', '2026-07-22', '2026-06-01', '2026-06-30');
  const july = reportOverlapFraction('2026-06-22', '2026-07-22', '2026-07-01', '2026-07-31');
  assert.equal(june + july, 1);
  assert.equal(10920 * (june + july) + 480, 11400);
  assert.equal(20 * (june + july), 20);
  assert.equal(reportOverlapFraction('2026-06-22', '2026-07-22', '2026-08-01', '2026-08-31'), 0);
});

test('handmatig totaal potentiele uren bepaalt maand, totaal en uurbedrag', () => {
  const value = reportEarnings(30000, 600 * 60, 5, 5000, 900);
  assert.equal(value.potentialHours, 900);
  assert.equal(value.potentialTotal, 47500);
  assert.equal(value.potentialMonthly, 9500);
  assert.equal(value.potentialHourly, 47500 / 900);
  assert.equal(reportEarnings(30000, 36000, 5, 5000, 0).potentialHourly, null);
  assert.equal(reportEarnings(30000, 36000, 5, 5000, null).potentialTotal, null);
  assert.equal(reportEarnings(30000, 36000, 5, 5000, -1).potentialTotal, null);
});
