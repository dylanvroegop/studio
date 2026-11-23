const assert = require('node:assert/strict');
const { test } = require('node:test');

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'commonjs', moduleResolution: 'node' },
});

const { getDepartureTrips, getDepartureReminder } = require('../src/lib/planning-departure-reminder');

const utc = time => new Date(`2026-11-23T${time}:00Z`);
const entry = (id, time, extra = {}) => ({
  id, start: utc(time), status: 'scheduled', cache: { projectAddress: id }, ...extra,
});

test('uses the preceding job, excluding private, tentative, cancelled and historical rows', () => {
  const entries = [
    entry('baan', '07:00', { status: 'completed' }),
    entry('historie', '13:00', { isGoogleCalendarHistory: true }),
    entry('privé', '14:00', { googleCalendarColorId: '5' }),
    entry('voorstel', '15:00', { status: 'pending', planningType: 'werkbespreking' }),
    entry('afgezegd', '16:00', { status: 'cancelled', planningType: 'werkbespreking' }),
    entry('klant', '18:00', { googleCalendarColorId: '11' }),
  ];
  const trips = getDepartureTrips(entries, utc('15:00'));
  assert.equal(trips.length, 1);
  assert.equal(trips[0].origin, 'baan');
  assert.equal(trips[0].destination, 'klant');
});

test('only looks at future evening meetings on the local date', () => {
  const entries = [
    entry('middag', '15:59', { planningType: 'werkbespreking' }),
    entry('verleden', '17:00', { planningType: 'werkbespreking' }),
    entry('vanavond', '18:00', { planningType: 'werkbespreking' }),
    entry('morgen', '23:30', { planningType: 'werkbespreking' }),
  ];
  assert.deepEqual(getDepartureTrips(entries, utc('17:00')).map(trip => trip.meeting.id), ['vanavond']);
});

test('sends one hour before departure and formats the appointment and departure in Amsterdam time', () => {
  const appointment = utc('18:00');
  assert.equal(getDepartureReminder(appointment, utc('16:05'), 50), null);
  assert.deepEqual(getDepartureReminder(appointment, utc('16:10'), 50), {
    appointmentTime: '19:00', leaveTime: '18:10',
  });
  assert.equal(getDepartureReminder(appointment, utc('17:10'), 50), null);
});

test('falls back to an hour before the appointment if route data is missing', () => {
  assert.deepEqual(getDepartureReminder(utc('18:00'), utc('17:00'), null), {
    appointmentTime: '19:00', leaveTime: null,
  });
});
