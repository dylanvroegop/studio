const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveSession } = require('./resolve-telegram-session.cjs');
const { runIdentityScenarios } = require('./telegram-identity-scenarios.cjs');
test('dertien screenshotvolgorde- en klantconflictscenario\'s', () => {
  const results = runIdentityScenarios(resolveSession);
  assert.equal(results.length, 13);
  assert.ok(results.every(result => result.result === 'PASS'));
});
