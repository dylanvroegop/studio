import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaffoldReminders, type ScaffoldQuote, type ScaffoldPlanning } from './scaffold-reminder';
const quote: ScaffoldQuote = { id: 'q1', enabled: true, archived: false, status: 'geaccepteerd', client: 'Klant', title: 'Kozijn', number: '260388' };
const entry: ScaffoldPlanning = { id: 'p1', quoteId: 'q1', planningType: 'job', status: 'scheduled', startDate: new Date('2026-10-25T08:00:00Z') };
const now = new Date('2026-10-11T06:00:00Z');
const check = (q = quote, entries = [entry], at = now) => scaffoldReminders([q], entries, at);
test('14 kalenderdagen voor start, over wintertijd heen', () => {
  assert.equal(check().length, 1);
  assert.equal(check()[0].dueDay, '2026-10-11');
  assert.match(check()[0].text, /25-10-2026/);
  assert.equal(check(quote, [entry], new Date('2026-10-10T21:59:00Z')).length, 0);
  assert.equal(check(quote, [entry], new Date('2026-10-10T22:01:00Z')).length, 1);
});
test('inhaalherinnering mag tot de startdag, nooit daarna', () => {
  assert.equal(check(quote, [entry], new Date('2026-10-24T06:00:00Z')).length, 1);
  assert.equal(check(quote, [entry], new Date('2026-10-25T06:00:00Z')).length, 0);
});
test('uitgeschakeld, gearchiveerd en afgewezen geven geen melding', () => {
  for (const patch of [{ enabled: false }, { archived: true }, { status: 'afgewezen' }, { status: 'verlopen' }]) assert.equal(check({ ...quote, ...patch }).length, 0);
});
test('alleen concrete werkplanning; geen afspraken, annuleringen of ontbrekende datum', () => {
  for (const patch of [{ planningType: 'werkbespreking' }, { status: 'pending' }, { status: 'cancelled' }, { startDate: null }, { quoteId: 'other' }, { startDate: new Date('invalid') }]) {
    assert.equal(check(quote, [{ ...entry, ...patch }]).length, 0);
  }
  assert.equal(check(quote, []).length, 0);
  assert.equal(check(quote, [{ ...entry, planningType: undefined }]).length, 1);
});
test('meerdere werkdagen leveren één melding op; gestarte klus geen nieuwe melding', () => {
  const later = { ...entry, id: 'p2', startDate: new Date('2026-10-26T08:00:00Z') };
  assert.equal(check(quote, [entry, later]).length, 1);
  const previous = { ...entry, id: 'p0', startDate: new Date('2026-10-09T08:00:00Z') };
  assert.equal(check(quote, [previous, entry]).length, 0);
  assert.equal(check(quote, [{ ...entry, status: 'completed' }, later]).length, 0);
});
test('verplaatsen herberekent datum en annuleringsstatus telt niet als klusstart', () => {
  const moved = { ...entry, id: 'p2', startDate: new Date('2026-11-09T08:00:00Z') };
  assert.equal(check(quote, [moved]).length, 0);
  assert.equal(check(quote, [{ ...entry, status: 'cancelled' }, moved]).length, 0);
  assert.equal(check(quote, [moved], new Date('2026-10-26T07:00:00Z'))[0].startDay, '2026-11-09');
});
test('zomertijd en jaargrens gebruiken kalenderdagen', () => {
  assert.equal(check(quote, [{ ...entry, startDate: new Date('2027-03-29T06:00:00Z') }], new Date('2027-03-15T07:00:00Z'))[0].dueDay, '2027-03-15');
  assert.equal(check(quote, [{ ...entry, startDate: new Date('2027-01-04T07:00:00Z') }], new Date('2026-12-21T07:00:00Z'))[0].dueDay, '2026-12-21');
});
