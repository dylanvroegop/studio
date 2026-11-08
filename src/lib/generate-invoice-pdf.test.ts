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
    'Offertebedrag',
    'Voorschot in mindering',
    'Resterende eindtermijn (50%)',
  ]);
  assert.deepEqual(adjustmentRows.map((row) => row.value), [3126.42, -1563.21, 1563.21]);

  assert.equal(shouldShowClientTaxNumbers('Zakelijk'), true);
  assert.equal(shouldShowClientTaxNumbers('Particulier'), false);
  assert.equal(shouldShowClientTaxNumbers(null), false);

  const extraWork = [
    { description: 'Extra plint', amountInclBtw: 121, amountExclBtw: 100, vatAmount: 21, vatRate: 21 },
    { description: 'Schilderwerk', amountInclBtw: 109, amountExclBtw: 100, vatAmount: 9, vatRate: 9 },
  ];
  for (const totals of [
    { totaalInclBtw: 3250.27 },
    { totaalInclBtw: 3250.27, totaalExclBtw: 2696.09, btw: 554.18 },
  ]) {
    const base = buildInvoiceCostTable({ ...baseData(), totals: totals.totaalExclBtw === undefined ? { totaalInclBtw: 3020.27 } : baseData().totals });
    const withExtraWork = buildInvoiceCostTable({ ...baseData(), totals, extraWork });
    assert.equal(withExtraWork.totalInclBtw, 3250.27);
    assert.equal(withExtraWork.subtotalExclBtw, Math.round((base.subtotalExclBtw + 200) * 100) / 100, 'meerwerk niet dubbel tellen bij opgeslagen subtotalen');
    assert.equal(withExtraWork.btw, Math.round((base.btw + 30) * 100) / 100);
    assert.equal(withExtraWork.rows.find((row) => row.label === 'Meerwerk')?.amount, 200);
    assert.equal(Math.round(withExtraWork.btwRows!.reduce((sum, row) => sum + row.value, 0) * 100) / 100, withExtraWork.btw);
  }
  const withoutCalculation = buildInvoiceCostTable({
    totals: { totaalInclBtw: 230, totaalExclBtw: 200, btw: 30 },
    extraWork: [extraWork[1]],
  });
  assert.deepEqual(withoutCalculation.btwRows, [{ label: 'BTW 21%', value: 21 }, { label: 'BTW 9%', value: 9 }]);

  const extraSpec = buildFinancialAdjustmentRows({ originalTotalInclBtw: 1000, voorschotAftrekInclBtw: 500, extraWorkInclBtw: 230 });
  assert.deepEqual(extraSpec.map((row) => row.value), [1000, -500, 500], 'meerwerk verschijnt alleen bij de omschrijving');

  const customerExample = buildFinancialAdjustmentRows({ originalTotalInclBtw: 2954.53, voorschotAftrekInclBtw: 1477.27, extraWorkInclBtw: 135.80 }, 1613.06 - 135.80);
  assert.deepEqual(customerExample, [
    { label: 'Offertebedrag', value: 2954.53 },
    { label: 'Voorschot in mindering', value: -1477.27 },
    { label: 'Resterende eindtermijn (50%)', value: 1477.26, bold: true },
  ]);
  assert.equal(customerExample.at(-1)!.value + 135.80, 1613.06);
  const otherPercentage = buildFinancialAdjustmentRows({ originalTotalInclBtw: 1000, voorschotAftrekInclBtw: 400 }, 600);
  assert.equal(otherPercentage.at(-1)?.label, 'Resterende eindtermijn (60%)');
  const nonPercentage = buildFinancialAdjustmentRows({ originalTotalInclBtw: 1000, voorschotAftrekInclBtw: 333.33 }, 666.67);
  assert.equal(nonPercentage.at(-1)?.label, 'Resterende eindtermijn');
  const corrected = buildFinancialAdjustmentRows({ originalTotalInclBtw: 1000, voorschotAftrekInclBtw: 500 }, 450);
  assert.deepEqual(corrected.map((row) => row.value), [1000, -500, -50, 450], 'een handmatige correctie mag niet ongemerkt uit de opbouw verdwijnen');
  assert.equal(corrected.at(-1)?.label, 'Resterende eindtermijn');
  const noAdvance = buildFinancialAdjustmentRows({ originalTotalInclBtw: 1000, voorschotAftrekInclBtw: 0 }, 1000);
  assert.deepEqual(noAdvance, [{ label: 'Offertebedrag', value: 1000 }]);
}
