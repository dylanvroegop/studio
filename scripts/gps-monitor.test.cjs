const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function load(file) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date, process, require: name => name === '@/lib/gps-health' ? load('src/lib/gps-health.ts') : require(name) });
  return module.exports;
}
const { recentGpsHealth } = load('src/lib/gps-health-server.ts');
const { nextGpsAlert } = load('src/lib/gps-alert-state.ts');
const now = Date.parse('2026-10-19T17:33:00Z');
const healthy = { state: 'ok', lastFixAt: new Date(now).toISOString(), minutesWithoutFix: 0 };
const unknown = { state: 'unknown', lastFixAt: null, minutesWithoutFix: null };
test('herstel met actuele punten wordt niet geblokkeerd door toekomstpunt', () => {
  const result = recentGpsHealth([
    { deviceId: 1, fixTime: '2026-10-19T17:51:00Z' },
    { deviceId: 1, fixTime: '2026-10-19T17:32:41Z' },
  ], 1, now);
  assert.equal(result.state, 'ok');
  assert.equal(result.lastFixAt, '2026-10-19T17:32:41.000Z');
});
test('ongeldige punten en punten van ander apparaat bewijzen geen herstel', () => {
  assert.equal(recentGpsHealth([{ deviceId: 2, fixTime: healthy.lastFixAt }, { deviceId: 1, fixTime: healthy.lastFixAt, valid: false }], 1, now).state, 'unknown');
});
test('onbereikbare GPS meldt na 20 minuten en behoudt eventId bij retries', () => {
  const first = nextGpsAlert(undefined, unknown, now);
  assert.equal(first.eventId, null);
  assert.equal(nextGpsAlert(first, unknown, now + 19 * 60000).eventId, null);
  const alert = nextGpsAlert(first, unknown, now + 20 * 60000);
  assert.ok(alert.eventId);
  assert.equal(nextGpsAlert(alert, unknown, now + 50 * 60000).eventId, alert.eventId);
  const recovered = nextGpsAlert(alert, healthy, now + 51 * 60000);
  assert.equal(recovered.eventId, null);
  assert.equal(recovered.outageSince, null);
  const next = nextGpsAlert(recovered, unknown, now + 52 * 60000);
  assert.notEqual(nextGpsAlert(next, unknown, now + 72 * 60000).eventId, alert.eventId);
});
test('20 minuten oude GPS geeft direct waarschuwing', () => {
  assert.ok(nextGpsAlert(undefined, { state: 'stale', lastFixAt: new Date(now - 20 * 60000).toISOString(), minutesWithoutFix: 20 }, now).eventId);
});
test('workflow controleert zonder geopende app via beveiligde POST', () => {
  const w = require('./gps-monitor-workflow.cjs').createGpsMonitorWorkflow();
  assert.equal(w.nodes[0].parameters.rule.interval[0].minutesInterval, 5);
  assert.equal(w.nodes[0].parameters.rule.interval[1].expression, '0 19 * * *');
  assert.equal(w.settings.timezone, 'Europe/Amsterdam');
  const saved = JSON.parse(fs.readFileSync('n8n/gps-monitor.workflow.json', 'utf8'));
  assert.deepEqual(saved.nodes[0].parameters.rule.interval, w.nodes[0].parameters.rule.interval);
  assert.equal(w.nodes[1].parameters.method, 'POST');
  assert.equal(w.nodes[1].parameters.genericAuthType, 'httpHeaderAuth');
});

const { gpsDailyReminderId } = load('src/lib/gps-alert-state.ts');
const outage = { outageSince: now - 86400000, eventId: 'gps-storing:1' };
test('dagelijkse herinnering vanaf 19:00 Amsterdam, ook volgende dagen en bij retries', () => {
  assert.equal(gpsDailyReminderId(outage, Date.parse('2026-10-19T16:59:00Z')), null);
  assert.equal(gpsDailyReminderId(outage, Date.parse('2026-10-19T17:00:00Z')), 'gps-herinnering:2026-10-19');
  assert.equal(gpsDailyReminderId(outage, Date.parse('2026-10-19T21:55:00Z')), 'gps-herinnering:2026-10-19');
  assert.equal(gpsDailyReminderId(outage, Date.parse('2026-10-20T17:00:00Z')), 'gps-herinnering:2026-10-20');
  assert.equal(gpsDailyReminderId(outage, Date.parse('2026-10-20T00:00:00Z')), null);
});
test('wintertijd gebruikt ook 19:00 lokale tijd', () => {
  assert.equal(gpsDailyReminderId(outage, Date.parse('2026-10-26T17:59:00Z')), null);
  assert.equal(gpsDailyReminderId(outage, Date.parse('2026-10-26T18:00:00Z')), 'gps-herinnering:2026-10-26');
});
test('herstel stopt herinneringen, onbekende GPS blijft herinneren na wachttijd', () => {
  assert.equal(gpsDailyReminderId(nextGpsAlert(outage, healthy, now), now), null);
  assert.equal(gpsDailyReminderId(nextGpsAlert(undefined, unknown, now), now), null);
  assert.equal(gpsDailyReminderId(nextGpsAlert(outage, unknown, now), now), 'gps-herinnering:2026-10-19');
  assert.equal(gpsDailyReminderId({ ...outage, eventId: 'gps-storing:2' }, now), 'gps-herinnering:2026-10-19');
});

function stoppedPoint(minutes) {
  return { deviceId: 1, fixTime: new Date(now - minutes * 60000).toISOString(), valid: true, speed: 0, attributes: { motion: false } };
}
test('expliciete stilstand onderdrukt meldingen, ook na het zoekvenster en een nacht', () => {
  for (const minutes of [20, 31, 60, 12 * 60, 24 * 60 - 1]) {
    const health = recentGpsHealth([stoppedPoint(minutes)], 1, now);
    assert.equal(health.state, 'stationary');
    assert.equal(health.minutesWithoutFix, minutes);
    const state = nextGpsAlert(outage, health, now);
    assert.equal(state.eventId, null);
    assert.equal(gpsDailyReminderId(state, now), null);
  }
});
test('stilstand onderdrukt uitval niet onbeperkt', () => {
  const health = recentGpsHealth([stoppedPoint(24 * 60)], 1, now);
  assert.equal(health.state, 'stale');
  assert.ok(nextGpsAlert(undefined, health, now).eventId);
});
test('rijden, tegenstrijdige beweging en onbekende beweging blijven na 20 minuten melden', () => {
  for (const point of [
    { ...stoppedPoint(20), attributes: { motion: true } },
    { ...stoppedPoint(20), speed: 5 },
    { ...stoppedPoint(20), attributes: undefined },
  ]) {
    const health = recentGpsHealth([point], 1, now);
    assert.equal(health.state, 'stale');
    assert.ok(nextGpsAlert(undefined, health, now).eventId);
  }
});
test('nieuwste geldige punt bepaalt stilstand, niet volgorde of een toekomstpunt', () => {
  const driving = { ...stoppedPoint(21), attributes: { motion: true } };
  assert.equal(recentGpsHealth([driving, stoppedPoint(40)], 1, now).state, 'stale');
  assert.equal(recentGpsHealth([stoppedPoint(40), stoppedPoint(20), { ...driving, fixTime: new Date(now + 3600000).toISOString() }], 1, now).state, 'stationary');
  assert.equal(recentGpsHealth([{ ...stoppedPoint(20), valid: false }], 1, now).state, 'unknown');
});
