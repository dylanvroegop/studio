import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findGpsVisitEvidence, type GpsVisitOptions, type GpsVisitPoint, type GpsVisitSite } from './quote-visit-gps';

const baseMs = Date.parse('2026-10-06T14:00:00Z');
const site: GpsVisitSite = { latitude: 52, longitude: 5 };
const options: GpsVisitOptions = { expectedDeviceId: 7, from: '2026-10-06T13:00:00Z',
  to: '2026-10-06T16:00:00Z', now: new Date('2026-10-06T17:00:00Z') };

function point(minutes: number, patch: Partial<GpsVisitPoint> = {}): GpsVisitPoint {
  return { id: `point-${minutes}`, deviceId: 7, valid: true, latitude: 52, longitude: 5,
    accuracy: 5, speed: 0, fixTime: new Date(baseMs + minutes * 60_000).toISOString(), ...patch };
}

function dwell(start = 0, duration = 10): GpsVisitPoint[] {
  return Array.from({ length: duration + 1 }, (_, minute) => point(start + minute));
}

test('tien aaneengesloten minuten leveren controleerbaar GPS-locatiebewijs op', () => {
  assert.deepEqual(findGpsVisitEvidence(dwell(), site, options), {
    source: 'traccar_gps', startedAt: '2026-10-06T14:00:00.000Z', endedAt: '2026-10-06T14:10:00.000Z',
    dwellMinutes: 10, pointCount: 11, maxAccuracyM: 5, maxDistanceM: 0,
  });
  assert.equal(findGpsVisitEvidence(dwell(0, 9), site, options), null);
  assert.equal(findGpsVisitEvidence([], site, options), null);
});

test('bekende vertrekmeting tussen aankomst en terugkeer mag nooit als verblijf worden overbrugd', () => {
  const points = [point(0), point(5, { latitude: 52.02, speed: 60 / 1.852 }), point(10)];
  assert.equal(findGpsVisitEvidence(points, site, options), null);
  const frequentPoints = dwell().map((entry, index) => index === 5 ? point(5, { latitude: 52.02 }) : entry);
  assert.equal(findGpsVisitEvidence(frequentPoints, site, options), null);
});

test('iedere slechte meting onderbreekt het verblijf, ook tussen verder goede punten', () => {
  const invalidPoints: Partial<GpsVisitPoint>[] = [
    { valid: false }, { valid: undefined }, { deviceId: 8 }, { deviceId: undefined },
    { accuracy: null }, { accuracy: undefined }, { accuracy: 0 }, { accuracy: -1 }, { accuracy: 25.1 }, { accuracy: NaN },
    { speed: null }, { speed: undefined }, { speed: -1 }, { speed: NaN }, { speed: 5.01 / 1.852 },
    { latitude: 0, longitude: 0 }, { latitude: NaN }, { longitude: Infinity }, { latitude: 91 }, { longitude: 181 },
  ];
  for (const patch of invalidPoints) {
    const points = dwell().map((entry, index) => index === 5 ? point(5, patch) : entry);
    assert.equal(findGpsVisitEvidence(points, site, options), null, JSON.stringify(patch));
  }
});

test('nauwkeurigheidscirkel moet volledig binnen vijftig meter van het adres passen', () => {
  assert.ok(findGpsVisitEvidence(dwell().map((entry) => ({ ...entry, accuracy: 25 })), site, options));
  assert.ok(findGpsVisitEvidence(dwell().map((entry) => ({ ...entry, latitude: 52.0001, accuracy: 25 })), site, options));
  assert.equal(findGpsVisitEvidence(dwell().map((entry) => ({ ...entry, latitude: 52.0003, accuracy: 25 })), site, options), null);
});

test('snelheid is in knopen en een passerende auto kwalificeert niet', () => {
  assert.equal(findGpsVisitEvidence(dwell().map((entry) => ({ ...entry, speed: 20 })), site, options), null);
  assert.ok(findGpsVisitEvidence(dwell().map((entry) => ({ ...entry, speed: 5 / 1.852 })), site, options));
});

test('gaten langer dan twee minuten worden niet opgeteld tot bezoek', () => {
  assert.equal(findGpsVisitEvidence([point(0), point(5), point(10)], site, options), null);
  assert.ok(findGpsVisitEvidence([0, 2, 4, 6, 8, 10].map((minute) => point(minute)), site, options));
  assert.equal(findGpsVisitEvidence([0, 2, 4, 6.001, 8, 10].map((minute) => point(minute)), site, options), null);
});

test('dubbele fixtijden tellen één keer en een conflicterend duplicaat onderbreekt het verblijf', () => {
  const points = dwell().flatMap((entry) => [entry, { ...entry, id: `copy-${entry.id}` }]);
  assert.equal(findGpsVisitEvidence(points, site, options)?.pointCount, 11);
  for (const patch of [{ valid: false }, { latitude: 52.02 }, { accuracy: 10 }, { deviceId: 8 }]) {
    assert.equal(findGpsVisitEvidence([...dwell(), point(5, patch)], site, options), null);
    assert.equal(findGpsVisitEvidence([point(5, patch), ...dwell()], site, options), null);
  }
  assert.equal(findGpsVisitEvidence(Array.from({ length: 100 }, () => point(0)), site, options), null);
});

test('onbekende of ongeldige fixtijd blijft onbekend zonder fallback op ontvangsttijd', () => {
  for (const fixTime of [undefined, '', 'invalid', '2026-02-31T12:00:00Z', '2026-10-06', '2026-10-06T14:00:00']) {
    assert.equal(findGpsVisitEvidence([...dwell(), point(5, { fixTime, deviceTime: '2026-10-06T14:05:00Z',
      serverTime: '2026-10-06T14:05:00Z' })], site, options), null);
  }
});

test('punten buiten het tijdvenster of uit de toekomst mogen niet meetellen', () => {
  assert.equal(findGpsVisitEvidence(dwell(), site, { ...options, from: '2026-10-06T14:01:00Z' }), null);
  assert.equal(findGpsVisitEvidence(dwell(), site, { ...options, to: '2026-10-06T14:09:00Z' }), null);
  assert.equal(findGpsVisitEvidence(dwell(), site, { ...options, now: new Date('2026-10-06T14:09:00Z') }), null);
  assert.equal(findGpsVisitEvidence(dwell(), site, { ...options, from: '2026-10-07T13:00:00Z', to: '2026-10-07T16:00:00Z' }), null);
});

test('verkeerde apparaten, ongeldige vensters en onbekende of ambigue adressen blijven onbekend', () => {
  assert.equal(findGpsVisitEvidence(dwell(), site, { ...options, expectedDeviceId: 8 }), null);
  assert.equal(findGpsVisitEvidence(dwell(), site, { ...options, expectedDeviceId: '' }), null);
  assert.equal(findGpsVisitEvidence(dwell(), site, { ...options, from: 'invalid' }), null);
  assert.equal(findGpsVisitEvidence(dwell(), site, { ...options, to: options.from }), null);
  assert.equal(findGpsVisitEvidence(dwell(), site, { ...options, now: new Date('invalid') }), null);
  assert.equal(findGpsVisitEvidence(dwell(), { ...site, isAmbiguous: true }, options), null);
  assert.equal(findGpsVisitEvidence(dwell(), { latitude: 0, longitude: 0 }, options), null);
  assert.equal(findGpsVisitEvidence(dwell(), { latitude: NaN, longitude: 5 }, options), null);
});

test('uitsluitend het langste aaneengesloten segment wordt teruggegeven, geen losse periodes optellen', () => {
  const points = [...dwell(0, 5), point(6, { speed: 20 }), ...dwell(7, 11), point(19, { latitude: 52.02 }), ...dwell(20, 5)];
  const evidence = findGpsVisitEvidence(points.reverse(), site, options);
  assert.equal(evidence?.startedAt, '2026-10-06T14:07:00.000Z');
  assert.equal(evidence?.endedAt, '2026-10-06T14:18:00.000Z');
  assert.equal(evidence?.dwellMinutes, 11);
  assert.equal(evidence?.pointCount, 12);
});
