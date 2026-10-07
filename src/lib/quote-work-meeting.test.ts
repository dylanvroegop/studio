import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findQuoteIdsForMeeting, type WorkMeetingQuote } from './quote-work-meeting';

function quote(id: string, overrides: Partial<WorkMeetingQuote> = {}): WorkMeetingQuote {
  return { id, clientId: 'babette', clientName: 'Babette Kikkert', archived: false, status: 'werkbespreking', ...overrides };
}

const meeting = { quoteId: '', clientName: '19:30 Babette Kikkert' };

for (const count of [2, 4]) {
  test(`${count} offertes van dezelfde klant gaan allemaal mee`, () => {
    const quotes = Array.from({ length: count }, (_, index) => quote(String(index)));
    assert.deepEqual(findQuoteIdsForMeeting(meeting, quotes), quotes.map((entry) => entry.id));
  });
}

test('andere statussen, archief en andere klanten gaan niet mee', () => {
  const quotes = [quote('one'), quote('two'), quote('archive', { archived: true }),
    ...['concept', 'verzonden', 'geaccepteerd', 'afgewezen'].map((status) => quote(status, { status })),
    quote('other', { clientId: 'other', clientName: 'Babette Anders' })];
  assert.deepEqual(findQuoteIdsForMeeting(meeting, quotes), ['one', 'two']);
});

test('expliciete koppeling neemt alle offertes van dezelfde klant mee', () => {
  const quotes = [quote('linked', { status: 'concept' }), quote('one'), quote('two', { clientName: 'B. Kikkert' }),
    quote('other', { clientId: 'other' })];
  assert.deepEqual(findQuoteIdsForMeeting({ quoteId: 'linked', clientName: 'Afwijkende agendatitel' }, quotes), ['one', 'two']);
});

test('oudere offertes zonder klant-ID kunnen op volledige naam mee', () => {
  const quotes = [quote('one', { clientId: '' }), quote('two', { clientId: '', clientName: ' BABETTE  Kikkert ' })];
  assert.deepEqual(findQuoteIdsForMeeting({ quoteId: 'one', clientName: '' }, quotes), ['one', 'two']);
});

test('alleen voornaam mag meerdere offertes van dezelfde klant vinden', () => {
  assert.deepEqual(findQuoteIdsForMeeting({ quoteId: '', clientName: '19:30 Babette' }, [quote('one'), quote('two')]), ['one', 'two']);
});

test('dezelfde voornaam bij verschillende klanten blijft onduidelijk', () => {
  assert.deepEqual(findQuoteIdsForMeeting({ quoteId: '', clientName: 'Babette' }, [quote('one'),
    quote('other', { clientId: 'other', clientName: 'Babette Anders' })]), []);
});

test('ontbrekende koppeling of naam levert geen willekeurige offerte op', () => {
  assert.deepEqual(findQuoteIdsForMeeting({ quoteId: 'missing', clientName: 'Babette Kikkert' }, [quote('one')]), []);
  assert.deepEqual(findQuoteIdsForMeeting({ quoteId: '', clientName: '' }, [quote('one')]), []);
});
