import assert from 'node:assert/strict';

import { buildWinstMetrics, type BuildWinstMetricsInput } from './winst-metrics-v2';

function baseInput(): BuildWinstMetricsInput {
  return {
    userId: 'user-1',
    filters: {
      periodType: 'month',
      periodRange: 6,
      jobTypes: [],
      clientIds: [],
      projectIds: [],
    },
    now: new Date('2026-03-27T12:00:00.000Z'),
    quotes: [
      {
        id: 'q-1',
        offerteNummer: 260001,
        title: 'Binnenwand project',
        clientId: 'klant-a',
        clientName: 'Klant A',
        createdAt: new Date('2026-03-01T10:00:00.000Z'),
        updatedAt: new Date('2026-03-02T10:00:00.000Z'),
        quotedRevenueIncl: 5000,
        status: 'geaccepteerd',
        jobTypes: ['Binnenwand'],
        quotedMaterieelExcl: 100,
        quotedOverheadExcl: 50,
      },
    ],
    calculations: [
      {
        quoteId: 'q-1',
        dataJson: {
          grootmaterialen: [{ product: 'Gipsplaten', aantal: 2, prijs_per_stuk: 100 }],
          verbruiksartikelen: [{ product: 'Schroeven', aantal: 5, prijs_per_stuk: 10 }],
          totaal_uren: 8,
          instellingen: {
            uurTariefExclBtw: 50,
            btwTarief: 21,
          },
          extras: {
            transport: {
              mode: 'fixed',
              vasteTransportkosten: 100,
            },
            winstMarge: {
              mode: 'percentage',
              percentage: 10,
              basis: 'totaal',
            },
          },
        },
      },
    ],
    invoices: [
      {
        id: 'inv-1',
        quoteIds: ['q-1'],
        status: 'betaald',
        createdAt: new Date('2026-03-03T12:00:00.000Z'),
        dueDate: new Date('2026-03-20T12:00:00.000Z'),
        totalIncl: 5000,
        paidAmount: 5000,
        openAmount: 0,
      },
    ],
    payments: [{ invoiceId: 'inv-1', amount: 5000, date: new Date('2026-03-10T09:00:00.000Z') }],
    nacalculaties: [
      {
        quoteId: 'q-1',
        data: {
          status: 'afgerond',
          labor: {
            entries: [{ id: 'l-1', date: '2026-03-10', hours: 10, hourRateExcl: 50 }],
            actualDays: 2,
          },
          materials: {
            groot: {
              entries: [{ id: 'mg-1', date: '2026-03-12', name: 'Gipsplaten', qty: 2, unitCostExcl: 110 }],
            },
            verbruik: {
              entries: [{ id: 'mv-1', date: '2026-03-12', name: 'Schroeven', qty: 5, unitCostExcl: 12 }],
            },
          },
          transport: {
            entries: [{ id: 't-1', date: '2026-03-11', km: 32, costExcl: 140, revenueExcl: 120 }],
          },
          materieel: {
            entries: [{ id: 'm-1', date: '2026-03-11', name: 'Steiger', costExcl: 150 }],
          },
          overhead: {
            entries: [{ id: 'o-1', date: '2026-03-11', name: 'Algemeen', costExcl: 80 }],
          },
        },
      },
    ],
  };
}

export function runWinstMetricsUnitTests(): void {
  const metrics = buildWinstMetrics(baseInput());

  assert.equal(metrics.projectPerformances.length, 1);
  assert.equal(metrics.dataQuality.projectsWithActual, 1);
  assert.equal(metrics.totals.quotedRevenueIncl, 5000);
  assert.equal(metrics.totals.receivedCashIncl, 5000);
  assert.equal(metrics.timeTracking.quotedHours, 8);
  assert.equal(metrics.timeTracking.actualHours, 10);
  assert.equal(metrics.timeTracking.quotedDays, 1);
  assert.equal(metrics.timeTracking.actualDays, 2);
  assert.equal(metrics.timeTracking.expectedEuroPerDay, 5000);
  assert.equal(metrics.timeTracking.realizedEuroPerDay, 2500);

  const arbeid = metrics.costBreakdown.categories.find((row) => row.key === 'arbeid');
  assert.ok(arbeid);
  assert.equal(arbeid?.quotedExcl, 400);
  assert.equal(arbeid?.actualExcl, 500);
  assert.equal(arbeid?.status, 'red');

  const top = metrics.materialAnalysis.topCostItems[0];
  assert.ok(top);
  assert.equal(top.name, 'Gipsplaten');
}
