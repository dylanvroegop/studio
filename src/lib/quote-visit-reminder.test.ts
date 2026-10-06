import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getQuoteVisitReminders,
  type VisitReminderMeeting,
  type VisitReminderQuote,
} from './quote-visit-reminder';

const now = new Date('2026-10-06T17:00:00Z'); // 19:00 in Amsterdam.

function quote(id = 'one', patch: Partial<VisitReminderQuote> = {}): VisitReminderQuote {
  return { id, clientId: 'client', clientName: 'Babette Kikkert', status: 'concept', archived: false,
    createdAt: new Date('2026-10-01T10:00:00Z'), ...patch };
}

function meeting(patch: Partial<VisitReminderMeeting> = {}): VisitReminderMeeting {
  return { id: 'visit', quoteId: 'one', clientName: 'Babette Kikkert', planningType: 'werkbespreking',
    status: 'scheduled', startDate: new Date('2026-10-06T14:00:00Z'), endDate: new Date('2026-10-06T15:00:00Z'), ...patch };
}

function ids(quotes: VisitReminderQuote[], meetings = [meeting()], accepted = new Set<string>()): string[] {
  return getQuoteVisitReminders(quotes, meetings, accepted, now).map((entry) => entry.quoteId);
}

test('bezoek blijft iedere dag open, ook als de app status nog niet heeft bijgewerkt', () => {
  for (const status of ['concept', 'werkbespreking', 'in_behandeling', 'in_afwachting']) {
    const quotes = [quote('one', { status })];
    assert.deepEqual(ids(quotes), ['one']);
    assert.equal(getQuoteVisitReminders(quotes, [meeting()], new Set(), new Date('2026-10-07T17:00:00Z')).length, 1);
  }
});

test('verzonden, geaccepteerd, afgesloten, gearchiveerd en betaald stoppen de melding', () => {
  for (const status of ['verzonden', 'geaccepteerd', 'afgewezen', 'verlopen', 'unknown']) {
    assert.deepEqual(ids([quote('one', { status })]), []);
  }
  assert.deepEqual(ids([quote('one', { archived: true })]), []);
  assert.deepEqual(ids([quote()], [meeting()], new Set(['one'])), []);
});

test('alleen afgelopen bevestigde werkbesprekingen tellen als bezoek', () => {
  const variants: Partial<VisitReminderMeeting>[] = [
    { status: 'pending' }, { status: 'cancelled' }, { status: '' }, { planningType: 'job' },
    { startDate: null }, { startDate: new Date('invalid') },
    { endDate: new Date('2026-10-06T17:30:00Z') },
    { startDate: new Date('2026-10-07T14:00:00Z'), endDate: new Date('2026-10-07T15:00:00Z') },
  ];
  for (const patch of variants) assert.deepEqual(ids([quote()], [meeting(patch)]), []);
  assert.deepEqual(ids([quote()], []), []);
  assert.deepEqual(ids([quote()], [meeting({ status: 'completed' })]), ['one']);
});

test('ontbrekende eindtijd gebruikt geplande duur of een uur, nooit alleen de begintijd', () => {
  assert.deepEqual(ids([quote()], [meeting({ endDate: null, scheduledHours: 4 })]), []);
  assert.deepEqual(ids([quote()], [meeting({ endDate: null })]), ['one']);
  assert.deepEqual(ids([quote()], [meeting({ startDate: new Date('2026-10-06T16:30:00Z'), endDate: null })]), []);
});

test('meerdere offertes van dezelfde klant worden meegenomen, ook met afwijkende agendatitel', () => {
  const quotes = [quote(), quote('two', { clientName: 'B. Kikkert' }), quote('sent', { status: 'verzonden' }),
    quote('other', { clientId: 'other' })];
  assert.deepEqual(ids(quotes, [meeting({ clientName: 'Andere titel' })]), ['one', 'two']);
  assert.deepEqual(ids(quotes, [meeting(), meeting({ id: 'duplicate' })]), ['one', 'two']);
});

test('afspraken zonder koppeling gebruiken alleen een ondubbelzinnige klantnaam', () => {
  const quotes = [quote(), quote('two')];
  assert.deepEqual(ids(quotes, [meeting({ quoteId: '', clientName: '19:30 Babette Kikkert' })]), ['one', 'two']);
  assert.deepEqual(ids(quotes, [meeting({ quoteId: '', clientName: 'Babette 19' })]), ['one', 'two']);
  assert.deepEqual(ids([...quotes, quote('other', { clientId: 'other', clientName: 'Babette Anders', status: 'verzonden' })],
    [meeting({ quoteId: '', clientName: 'Babette' })]), []);
  assert.deepEqual(ids([...quotes, quote('other', { clientId: 'other' })], [meeting({ quoteId: '' })]), []);
  assert.deepEqual(ids(quotes, [meeting({ quoteId: '', clientName: 'Babette Anders' })]), []);
  assert.deepEqual(ids(quotes, [meeting({ quoteId: 'missing' })]), []);
});

test('oude klantbezoeken worden niet hergebruikt voor een nieuwe offerte', () => {
  const newQuote = quote('new', { createdAt: new Date('2026-10-06T16:00:00Z') });
  assert.deepEqual(ids([quote(), newQuote]), ['one']);
  assert.deepEqual(ids([newQuote], [meeting({ quoteId: 'new' })]), ['new']);
});

test('nieuwere onbevestigde of toekomstige gekoppelde afspraak onderdrukt oud bezoek', () => {
  for (const status of ['pending', 'scheduled']) {
    const newer = meeting({ id: 'newer', status, startDate: new Date('2026-10-07T14:00:00Z'), endDate: new Date('2026-10-07T15:00:00Z') });
    assert.deepEqual(ids([quote()], [meeting(), newer]), []);
  }
  assert.deepEqual(ids([quote()], [meeting(), meeting({ status: 'cancelled', startDate: new Date('2026-10-07T14:00:00Z') })]), ['one']);
});

test('zomertijd en wintertijd veranderen de vergelijking van afgelopen bezoeken niet', () => {
  for (const [visitEnd, localEvening] of [
    ['2026-10-06T18:30:00+02:00', '2026-10-06T19:00:00+02:00'],
    ['2026-11-06T18:30:00+01:00', '2026-11-06T19:00:00+01:00'],
  ]) {
    const endDate = new Date(visitEnd);
    assert.equal(getQuoteVisitReminders([quote()], [meeting({ startDate: new Date(endDate.getTime() - 3_600_000), endDate })],
      new Set(), new Date(localEvening)).length, 1);
  }
});
