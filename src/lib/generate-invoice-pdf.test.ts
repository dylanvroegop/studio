import assert from 'node:assert/strict';
import {
  buildFinancialAdjustmentRows,
  buildInvoiceCostTable,
  shouldShowClientTaxNumbers,
  type PDFInvoiceData,
} from './generate-invoice-pdf';

function baseData(overrides: Partial<PDFInvoiceData> = {}): Pick<PDFInvoiceData, 'calculationSnapshot' | 'totals' | 'showMaterialLaborBreakdown' | 'showTransportBreakdown' | 'showHourlyRateOnInvoice' | 'laborHoursPerDay'> {
  return {
    showMaterialLaborBreakdown: true,
    showTransportBreakdown: true,
    showHourlyRateOnInvoice: false,
    totals: {
      totaalExclBtw: 2496.09,
      btw: 524.18,
      totaalInclBtw: 3020.27,
    },
    calculationSnapshot: {
      grootmaterialen: [{ aantal: 1, product: 'Materiaal', prijs_per_stuk: 237.51 }],
      verbruiksartikelen: [],
      totaal_uren: 42.5,
      instellingen: {
        btwTarief: 21,
        uurTariefExclBtw: 50,
        extras: {
          transport: { mode: 'fixed', vasteTransportkosten: 133.58 },
          winstMarge: { mode: 'fixed', fixedAmount: 0, percentage: 0, basis: 'totaal' },
        },
      },
    } as any,
    ...overrides,
  };
}

export function runInvoicePdfUnitTests(): void {
  const withRate = buildInvoiceCostTable(baseData({ showHourlyRateOnInvoice: true }));
  const laborWithRate = withRate.rows.find((row) => row.label === 'Arbeid');
  assert.equal(laborWithRate?.calculation, '42,50 uur × € 50,00');

  const withoutRate = buildInvoiceCostTable(baseData({ showHourlyRateOnInvoice: false }));
  const laborWithoutRate = withoutRate.rows.find((row) => row.label === 'Arbeid');
  assert.equal(laborWithoutRate?.calculation, '-');

  const zeroRows = buildInvoiceCostTable(baseData({
    calculationSnapshot: {
      grootmaterialen: [],
      verbruiksartikelen: [],
      totaal_uren: 0,
      instellingen: {
        btwTarief: 21,
        uurTariefExclBtw: 50,
        extras: {
          transport: { mode: 'none' },
          winstMarge: { mode: 'fixed', fixedAmount: 0, percentage: 0, basis: 'totaal' },
        },
      },
    } as any,
    totals: {
      totaalExclBtw: 0,
      btw: 0,
      totaalInclBtw: 0,
    },
  }));
  assert.deepEqual(zeroRows.rows, []);

  const totals = buildInvoiceCostTable(baseData());
  assert.equal(totals.subtotalExclBtw, 2496.09);
  assert.equal(totals.btw, 524.18);
  assert.equal(totals.totalInclBtw, 3020.27);

  const splitLaborVat = buildInvoiceCostTable(baseData({
    showHourlyRateOnInvoice: true,
    calculationSnapshot: {
      grootmaterialen: [{ aantal: 1, product: 'Materiaal', prijs_per_stuk: 100 }],
      verbruiksartikelen: [],
      totaal_uren: 10,
      instellingen: {
        btwTarief: 21,
        uurTariefExclBtw: 50,
        arbeidBtwLaagUren: 4,
        arbeidBtwLaagTarief: 9,
        extras: {
          transport: { mode: 'none' },
          winstMarge: { mode: 'fixed', fixedAmount: 0, percentage: 0, basis: 'totaal' },
        },
      },
    } as any,
    totals: {
      totaalExclBtw: 600,
      btw: 102,
      totaalInclBtw: 702,
    },
  }));
  const highLaborVatRow = splitLaborVat.rows.find((row) => row.label === 'Arbeid 21%');
  const lowLaborVatRow = splitLaborVat.rows.find((row) => row.label === 'Arbeid 9%');
  assert.equal(highLaborVatRow?.calculation, '6 uur × € 50,00');
  assert.equal(highLaborVatRow?.amount, 300);
  assert.equal(lowLaborVatRow?.calculation, '4 uur × € 50,00');
  assert.equal(lowLaborVatRow?.amount, 200);
  assert.deepEqual(splitLaborVat.btwRows, [
    { label: 'BTW 21%', value: 84 },
    { label: 'BTW 9%', value: 18 },
  ]);
  assert.equal(splitLaborVat.totalInclBtw, 702);

  const transportDetails = buildInvoiceCostTable(baseData({
    calculationSnapshot: {
      grootmaterialen: [],
      verbruiksartikelen: [],
      totaal_uren: 28,
      transport_berekening: {
        distanceKm: 14.5,
        roundTripDistanceKm: 29,
        ratePerKm: 0.23,
      },
      instellingen: {
        btwTarief: 21,
        uurTariefExclBtw: 50,
        extras: {
          transport: { mode: 'perKm', prijsPerKm: 0.23 },
          winstMarge: { mode: 'fixed', fixedAmount: 0, percentage: 0, basis: 'totaal' },
        },
      },
    } as any,
    totals: {
      totaalExclBtw: 26.68,
      btw: 5.6,
      totaalInclBtw: 32.28,
    },
  }));
  const transportRow = transportDetails.rows.find((row) => row.label === 'Transport');
  assert.equal(transportRow?.calculation, '0,23 × 14,5km = € 3,34 × 2 = € 6,68 × 4 dagen');

  const quoteWorkdayTransportDetails = buildInvoiceCostTable(baseData({
    laborHoursPerDay: 8.5,
    calculationSnapshot: {
      grootmaterialen: [],
      verbruiksartikelen: [],
      totaal_uren: 42.5,
      transport_berekening: {
        distanceKm: 48.4,
        roundTripDistanceKm: 96.8,
        ratePerKm: 0.23,
      },
      instellingen: {
        btwTarief: 21,
        uurTariefExclBtw: 55,
        extras: {
          transport: { mode: 'perKm', prijsPerKm: 0.23 },
          winstMarge: { mode: 'fixed', fixedAmount: 0, percentage: 0, basis: 'totaal' },
        },
      },
    } as any,
    totals: {
      totaalExclBtw: 2448.82,
      btw: 514.25,
      totaalInclBtw: 2963.07,
    },
  }));
  const quoteWorkdayTransportRow = quoteWorkdayTransportDetails.rows.find((row) => row.label === 'Transport');
  assert.equal(quoteWorkdayTransportRow?.calculation, '0,23 × 48,4km = € 11,13 × 2 = € 22,26 × 5 dagen');

  const emptyAdjustmentRows = buildFinancialAdjustmentRows({
    originalTotalInclBtw: 0,
    voorschotAftrekInclBtw: 0,
    voorschotFactuurPaidAmount: 0,
  });
  assert.deepEqual(emptyAdjustmentRows, []);

  const adjustmentRows = buildFinancialAdjustmentRows({
    originalTotalInclBtw: 3126.42,
    voorschotAftrekInclBtw: 1563.21,
    voorschotFactuurPaidAmount: 1563.21,
  });
  assert.deepEqual(adjustmentRows.map((row) => row.label), [
    'Origineel totaal (incl. BTW)',
    'Voorschot in mindering',
    'Reeds betaald op voorschot (info)',
  ]);

  assert.equal(shouldShowClientTaxNumbers('Zakelijk'), true);
  assert.equal(shouldShowClientTaxNumbers('Particulier'), false);
  assert.equal(shouldShowClientTaxNumbers(null), false);
}
