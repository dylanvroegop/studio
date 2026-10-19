const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('src/lib/calculation-progress.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(mod, mod.exports);
const { getCalculationProgress: progress } = mod.exports;
const start = Date.parse('2026-10-17T12:37:40Z');
const row = (status, created_at = '2026-10-17T12:37:41Z') => ({ status, created_at, data_json: { totaal: 100 } });
test('nieuwe aanvraag blijft draaien zonder rij en met een oude uitkomst na heropenen', () => {
  assert.equal(progress('in_behandeling', start, null).running, true);
  for (const status of ['completed', 'failed']) {
    assert.deepEqual(progress('in_behandeling', start, row(status, '2026-10-17T10:37:40Z')), { running: true, completed: false, failed: false });
  }
});
test('alleen voltooiing of fout van de nieuwe aanvraag stopt de indicator', () => {
  for (const status of ['pending', 'processing']) assert.equal(progress('in_behandeling', start, row(status)).running, true);
  assert.deepEqual(progress('in_behandeling', start, row('completed')), { running: false, completed: true, failed: false });
  assert.deepEqual(progress('in_behandeling', start, row('failed')), { running: false, completed: false, failed: true });
  assert.equal(progress('in_behandeling', start, { ...row('completed'), data_json: null }).running, true);
});
test('zonder actieve aanvraag geen spinner, foutstatus blijft niet draaien', () => {
  assert.equal(progress('concept', null, null).running, false);
  assert.equal(progress('concept', start, row('completed')).running, false);
  assert.equal(progress('fout', start, row('processing')).running, false);
});

test('afgeronde run vóór webhook-antwoord blijft afgerond met oorspronkelijke starttijd', () => {
  const { resolveCalculationStart } = mod.exports;
  const requestedAt = start - 100;
  const finished = row('completed');
  const lateResponse = start + 120000;
  assert.equal(progress('in_behandeling', lateResponse, finished).running, true);
  assert.equal(progress('in_behandeling', resolveCalculationStart(start, requestedAt), finished).completed, true);
  for (const missing of [undefined, null, NaN, 0]) {
    assert.equal(resolveCalculationStart(missing, requestedAt), requestedAt);
    assert.equal(progress('in_behandeling', resolveCalculationStart(missing, requestedAt), finished).running, false);
  }
});
