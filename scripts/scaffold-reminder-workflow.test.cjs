const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createScaffoldReminderWorkflow, reminderItems } = require('./scaffold-reminder-workflow.cjs');
test('workflow reserveert vóór Telegram en bevestigt pas na verzending; geen Telegram retry', () => {
  const w = createScaffoldReminderWorkflow();
  assert.equal(w.active, false);
  assert.equal(w.settings.timezone, 'Europe/Amsterdam');
  const get = name => w.nodes.find(n => n.name === name);
  assert.equal(get('Dagelijks 08:00').parameters.rule.interval[0].triggerAtHour, 8);
  assert.equal(get('Reserveer herinnering').retryOnFail, false);
  assert.equal(get('Stuur steigerherinnering').retryOnFail, false);
  assert.equal(w.connections['Nog niet verstuurd'].main[0][0].node, 'Stuur steigerherinnering');
  assert.equal(w.connections['Stuur steigerherinnering'].main[0][0].node, 'Bevestig verzending');
  assert.equal(w.connections['Bevestig verzending'].main[0][0].node, 'Eén herinnering tegelijk');
  assert.equal(w.connections['Eén herinnering tegelijk'].main[1][0].node, 'Reserveer herinnering');
});
test('lege resultaten stil; foutieve of onzekere bron blokkeert verzending', () => {
  const data = { ok: true, version: 1, reminders: [], uncertain: [] };
  assert.deepEqual(reminderItems(data), []);
  assert.throws(() => reminderItems({ ...data, uncertain: [{}] }));
  assert.throws(() => reminderItems({ ...data, ok: false }));
  assert.deepEqual(reminderItems({ ...data, reminders: [{ quoteId: 'q1', startDay: '2026-10-25' }] }), [{ json: { quoteId: 'q1', startDay: '2026-10-25' } }]);
});
