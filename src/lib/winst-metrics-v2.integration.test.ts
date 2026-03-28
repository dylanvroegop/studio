import assert from 'node:assert/strict';

import { buildWinstMetrics, type BuildWinstMetricsInput } from './winst-metrics-v2';

function createIntegrationInput(): BuildWinstMetricsInput {
  const quotes = Array.from({ length: 6 }).map((_, index) => {
    const quoteId = `q-${index + 1}`;
    const createdAt = new Date(`2026-02-${String(index + 1).padStart(2, '0')}T09:00:00.000Z`);
    return {
      id: quoteId,
      offerteNummer: 260100 + index,
      title: `Project ${index + 1}`,
      clientId: index % 2 === 0 ? 'klant-a' : 'klant-b',
      clientName: index % 2 === 0 ? 'Klant A' : 'Klant B',
      status: 'geaccepteerd',
      createdAt,
      updatedAt: createdAt,
      quotedRevenueIncl: 5000 + index * 500,
      jobTypes: index % 2 === 0 ? ['Binnenwand'] : ['Dakrenovatie'],
      quotedMaterieelExcl: 0,
      quotedOverheadExcl: 0,
    };
  });

  const calculations = quotes.map((quote) => ({
    quoteId: quote.id,
    dataJson: {
      grootmaterialen: [{ product: 'Plaat', aantal: 1, prijs_per_stuk: 300 }],
      verbruiksartikelen: [{ product: 'Kit', aantal: 1, prijs_per_stuk: 80 }],
      totaal_uren: 8,
      instellingen: { uurTariefExclBtw: 50, btwTarief: 21 },
      extras: {
        transport: { mode: 'fixed', vasteTransportkosten: 100 },
        winstMarge: { mode: 'percentage', percentage: 10, basis: 'totaal' },
      },
    },
  }));

  const invoices = quotes.map((quote, index) => ({
    id: `inv-${index + 1}`,
    quoteIds: [quote.id],
    status: index === 5 ? 'verzonden' : 'betaald',
    createdAt: quote.createdAt,
    dueDate: new Date('2026-03-01T00:00:00.000Z'),
    totalIncl: quote.quotedRevenueIncl,
    paidAmount: index === 5 ? 0 : quote.quotedRevenueIncl,
    openAmount: index === 5 ? quote.quotedRevenueIncl : 0,
  }));

  const payments = invoices
    .filter((invoice) => invoice.paidAmount > 0)
    .map((invoice) => ({
      invoiceId: invoice.id,
      amount: invoice.paidAmount,
      date: new Date('2026-03-10T00:00:00.000Z'),
    }));

  const nacalculaties = quotes.map((quote, index) => ({
    quoteId: quote.id,
    data: {
      status: 'afgerond',
      labor: {
        entries: [{ id: `l-${index}`, date: '2026-03-05', hours: 10, hourRateExcl: 50 }],
      },
      materials: {
        groot: {
          entries: [{ id: `g-${index}`, date: '2026-03-05', name: 'Plaat', qty: 1, unitCostExcl: 360 }],
        },
        verbruik: {
          entries: [{ id: `v-${index}`, date: '2026-03-05', name: 'Kit', qty: 1, unitCostExcl: 92 }],
        },
      },
      transport: {
        entries: [{ id: `t-${index}`, date: '2026-03-05', km: 20, costExcl: 130, revenueExcl: 95 }],
      },
      materieel: { entries: [] },
      overhead: { entries: [] },
    },
  }));

  return {
    userId: 'user-1',
    now: new Date('2026-03-27T12:00:00.000Z'),
    filters: {
      periodType: 'month',
      periodRange: 6,
      jobTypes: [],
      clientIds: [],
      projectIds: [],
    },
    quotes,
    calculations,
    invoices,
    payments,
    nacalculaties,
  };
}

export function runWinstMetricsIntegrationTests(): void {
  const metrics = buildWinstMetrics(createIntegrationInput());

  assert.equal(metrics.projectPerformances.length, 6);
  assert.ok(metrics.leakDetection.length >= 2);
  assert.ok(metrics.leakDetection.some((row) => row.id.includes('arbeid')));
  assert.ok(metrics.leakDetection.some((row) => row.id.includes('materiaal')));
  assert.ok(metrics.leakDetection.some((row) => row.id.includes('transport')));

  assert.equal(metrics.topPerformers.length, 5);
  assert.equal(metrics.worstPerformers.length, 5);
  assert.ok(metrics.cashflow.openAmount > 0);
  assert.ok(metrics.cashflow.overdueAmount > 0);

  const filtered = buildWinstMetrics({
    ...createIntegrationInput(),
    filters: {
      periodType: 'month',
      periodRange: 6,
      jobTypes: ['Binnenwand'],
      clientIds: [],
      projectIds: [],
    },
  });
  assert.ok(filtered.projectPerformances.every((row) => row.jobTypes.includes('Binnenwand')));
}
