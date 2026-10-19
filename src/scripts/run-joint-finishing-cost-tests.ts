import assert from 'node:assert/strict';
import { calculateJointFinishingCost } from '../lib/joint-finishing-cost';
const job = (type = 'wanden', edge = 'AK2', basis: unknown[] = [{ lengte: 4000, hoogte: 3000, breedte: 3000 }]) => ({
    maatwerk: { meta: { type }, basis },
    materialen: { materialen_lijst: { beplating: { material: { materiaalnaam: `Gipsplaat ${edge}` } } } },
});
assert.equal(calculateJointFinishingCost({ a: job() }).amount, 9.24);
assert.equal(calculateJointFinishingCost({ a: job('plafonds', 'AK4') }).amount, 13.92);
assert.equal(calculateJointFinishingCost({ a: job('plafonds', 'AK2') }).amount, 9.24, 'Gekozen kant gaat voor standaard plafond');
assert.equal(calculateJointFinishingCost({ a: job(), b: job('plafonds', 'AK4') }).amount, 23.16);
assert.ok(calculateJointFinishingCost({}).errors.length);
assert.ok(calculateJointFinishingCost({ a: job('wanden', 'AK2', []) }).errors.length);
assert.equal(calculateJointFinishingCost({ a: job(), b: job('wanden', 'AK2', [{}]) }).amount, 0, 'Geen gedeeltelijk totaal bij ontbrekende maten');
assert.ok(calculateJointFinishingCost({ a: job('plafonds', 'RK') }).errors.length);
assert.equal(calculateJointFinishingCost({ a: job('wanden', 'AK2', [{ lengte: 4000, hoogte: 3000, openings: [{ breedte: 1000, hoogte: 2000 }] }]) }).area, 10);
assert.ok(calculateJointFinishingCost({ a: job('wanden', 'AK2', [{ lengte: 4000, hoogte: 3000, shape: 'slope' }]) }).errors.length);
const double = job();
Object.assign(double.materialen.materialen_lijst, { beplating_2: { material: { materiaalnaam: 'Gipsplaat AK2' } } });
assert.equal(calculateJointFinishingCost({ a: double }).area, 24);
// Offerte 260494: dezelfde netto oppervlakken als op de twee tekeningen.
const gable = (width: number, height: number) => job('wanden', 'AK2', [{
    shape: 'gable', lengte: 6600, hoogte: 800, hoogteNok: 2800,
    openings: [{ width, height }],
}]);
const firstGable = calculateJointFinishingCost({ a: gable(930, 2115) });
const secondGable = calculateJointFinishingCost({ a: gable(850, 2015) });
assert.deepEqual(firstGable.errors, []);
assert.deepEqual(secondGable.errors, []);
assert.equal(firstGable.area.toFixed(2), '9.91');
assert.equal(secondGable.area.toFixed(2), '10.17');
assert.equal(calculateJointFinishingCost({ a: gable(930, 2115), b: gable(850, 2015) }).area.toFixed(2), '20.08');
assert.equal(calculateJointFinishingCost({ a: job('wanden', 'AK2', [{
    shape: 'slope', lengte: 4000, hoogteLinks: 1000, hoogteRechts: 3000,
}]) }).area, 8);
assert.ok(calculateJointFinishingCost({ a: job('wanden', 'AK2', [{
    shape: 'gable', lengte: 6600, hoogte: 800,
}]) }).errors.length, 'Ontbrekende nokhoogte niet verzinnen');
console.log('Nadenraming geslaagd: wand, plafond, gekozen kant, gemengde offerte, ontbrekende maten, RK, openingen en twee zijden.');
