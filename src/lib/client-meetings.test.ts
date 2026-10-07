import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConfirmedMeetingNotes, getConfirmedMeetingItems, meetingReportSchema, validateMeetingEvidence, type MeetingItem, type MeetingReport } from './client-meetings';
import { isEditableMeetingQuote, meetingClientToQuote, meetingQuoteNotes } from './client-meeting-quote';
import { buildEmptyQuoteDefaults } from './quote-defaults';

function item(overrides: Partial<MeetingItem> = {}): MeetingItem {
  return {
    id: 'fronten', section: 'scope', title: 'Keukenfronten vervangen', detail: 'Bestaande scharnieren hergebruiken.',
    status: 'confirmed', basis: 'spoken', priority: 'normal', reviewed: false,
    evidence: [{ segmentId: 'c0-s0', quote: 'De bestaande scharnieren blijven.' }], measurement: null, ...overrides,
  };
}
const report = (items: MeetingItem[]): MeetingReport => ({ projectName: 'Keukenrenovatie', description: 'Onbevestigd: misschien ook nieuwe kasten.', items });

test('alleen handmatig gecontroleerde bevestigde feiten gaan naar een offerte', () => {
  const input = report([
    item({ reviewed: true }),
    item({ id: 'ongezien' }),
    item({ id: 'optie', reviewed: true, status: 'suggestion', detail: 'Misschien MDF.' }),
    item({ id: 'verzoek', reviewed: true, status: 'request' }),
    item({ id: 'maat-oud', reviewed: true, status: 'contradiction' }),
    item({ id: 'risico', section: 'risk', reviewed: true, basis: 'assessment' }),
    item({ id: 'vraag', section: 'question', reviewed: true }),
  ]);
  assert.deepEqual(getConfirmedMeetingItems(input).map((entry) => entry.id), ['fronten']);
  const notes = buildConfirmedMeetingNotes(input);
  assert.match(notes, /scharnieren hergebruiken/);
  assert.doesNotMatch(notes, /MDF|nieuwe kasten/);
  assert.match(meetingQuoteNotes(input), /^### Keukenrenovatie/);
});

test('originele en gecorrigeerde maat blijven terugvindbaar, bronverzinsel wordt geweigerd', () => {
  const transcript = [{ id: 'c0-s0', chunkIndex: 0, startMs: 0, endMs: 60000, speaker: null, text: 'Breedte 80 cm. Nee, correctie: 82 cm. De bestaande scharnieren blijven.' }];
  const input = report([item(), item({ id: 'maat', section: 'measurement', status: 'contradiction',
    evidence: [{ segmentId: 'c0-s0', quote: 'Breedte 80 cm. Nee, correctie: 82 cm.' }],
    measurement: { element: 'Front', dimension: 'breedte', value: '82', unit: 'cm', normalizedValue: 820, normalizedUnit: 'mm' } })]);
  assert.deepEqual(validateMeetingEvidence(input, transcript), []);
  const fabricated = report([item({ evidence: [{ segmentId: 'c0-s0', quote: '83 cm' }] })]);
  assert.equal(validateMeetingEvidence(fabricated, transcript).length, 1);
  assert.equal(transcript[0].text, 'Breedte 80 cm. Nee, correctie: 82 cm. De bestaande scharnieren blijven.');
});

test('schema weigert dubbele ids en maatregels zonder gestructureerde maat', () => {
  assert.equal(meetingReportSchema.safeParse(report([item(), item()])).success, false);
  assert.equal(meetingReportSchema.safeParse(report([item({ section: 'measurement' })])).success, false);
  assert.equal(meetingReportSchema.safeParse(report([item()])).success, true);
});

test('overdracht behoudt originele maten en eenheden', () => {
  const notes = buildConfirmedMeetingNotes(report([item({ reviewed: true, section: 'measurement',
    measurement: { element: 'MDF front', dimension: 'dikte', value: '1,8', unit: 'cm', normalizedValue: 18, normalizedUnit: 'mm' } })]));
  assert.match(notes, /MDF front: dikte 1,8 cm/);
});

test('bestaande offertes mogen uitsluitend bij dezelfde klant en vóór versturen worden aangevuld', () => {
  const quote = { userId: 'u1', status: 'concept', klantinformatie: { clientId: 'c1' } };
  assert.equal(isEditableMeetingQuote(quote, 'u1', 'c1'), true);
  assert.equal(isEditableMeetingQuote(quote, 'u2', 'c1'), false);
  assert.equal(isEditableMeetingQuote(quote, 'u1', 'c2'), false);
  assert.equal(isEditableMeetingQuote({ ...quote, clientId: 'c2' }, 'u1', 'c1'), false);
  assert.equal(isEditableMeetingQuote({ ...quote, sentAt: new Date() }, 'u1', 'c1'), false);
  assert.equal(isEditableMeetingQuote({ ...quote, status: 'geaccepteerd' }, 'u1', 'c1'), false);
  assert.equal(isEditableMeetingQuote({ ...quote, archived: true }, 'u1', 'c1'), false);
});

test('klantidentiteit en adres komen uitsluitend uit het gekozen dossier', () => {
  const result = meetingClientToQuote('c1', { voornaam: 'Jan', achternaam: 'Test', emailadres: 'jan@example.test', straat: 'Teststraat', huisnummer: '8', plaats: 'Utrecht', projectStraat: 'Werkstraat', projectHuisnummer: '9' });
  assert.equal(result.clientId, 'c1');
  assert.equal(result['e-mailadres'], 'jan@example.test');
  assert.equal(result.afwijkendProjectadres, true);
  assert.deepEqual(result.factuuradres, { straat: 'Teststraat', huisnummer: '8', postcode: '', plaats: 'Utrecht' });
});

test('gedeelde offerte-instellingen behouden voorkeuren en geselecteerde kostenpakketten', () => {
  assert.equal(buildEmptyQuoteDefaults().instellingen.uurTariefExclBtw, 55);
  const defaults = buildEmptyQuoteDefaults({
    settings: { uurTarief: 60 }, instellingen: {
      standaardUurtarief: 72, standaardTransport: { mode: 'none' },
      standaardWinstMarge: { mode: 'fixed', fixedAmount: 125 },
      bouwplaatsKostenStandaardId: 'p', bouwplaatsKostenPakketten: [{ id: 'p', items: [{ id: 'a', naam: 'Parkeren', prijs: 20, per: 'dag' }] }],
    }, defaultAlgemeneVoorwaarden: { tekst: 'Eigen voorwaarden.' },
  });
  assert.equal(defaults.instellingen.uurTariefExclBtw, 72);
  assert.equal(defaults.extras.transport.mode, 'none');
  assert.equal(defaults.extras.winstMarge.fixedAmount, 125);
  assert.equal(defaults.extras.materieel?.[0].naam, 'Parkeren');
  assert.equal(defaults.algemeneVoorwaarden?.tekst, 'Eigen voorwaarden.');
});
