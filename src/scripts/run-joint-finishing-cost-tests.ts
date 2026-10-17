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
console.log('Nadenraming geslaagd: wand, plafond, gekozen kant, gemengde offerte, ontbrekende maten, RK, openingen en twee zijden.');
