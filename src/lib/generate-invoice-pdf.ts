import { jsPDF } from 'jspdf';
import { calculateQuoteTotals } from './quote-calculations';
import type { DataJson } from './quote-calculations';
import type { InvoiceType } from './types';

export interface PDFInvoiceData {
  invoiceType: InvoiceType;
  invoiceNumberLabel: string;
  issueDate: string;
  dueDate: string;
  paymentTermDays?: number;
  betreftOfferte?: string;
  invoiceDescription?: string;

  logoUrl?: string;
  logoScale?: number;

  bedrijf: {
    naam: string;
    adres: string;
    postcode: string;
    plaats: string;
    telefoon: string;
    email: string;
    kvk: string;
    btw: string;
    iban?: string;
    bankNaam?: string;
    bic?: string;
  };

  klant: {
    klanttype?: string | null;
    naam: string;
    adres: string;
    postcode: string;
    plaats: string;
    telefoon: string;
    email: string;
    kvk?: string;
    btw?: string;
  };

  totals: {
    totaalExclBtw?: number;
    btw?: number;
    totaalInclBtw: number;
  };

  financialAdjustments?: {
    originalTotalInclBtw: number;
    voorschotAftrekInclBtw: number;
    voorschotFactuurPaidAmount?: number;
  };

  showMaterialLaborBreakdown?: boolean;
  showTransportBreakdown?: boolean;
  showHourlyRateOnInvoice?: boolean;
  invoiceNotes?: string;
  standaardFactuurTekst?: string;
  laborHoursPerDay?: number;
  calculationSnapshot?: DataJson | null;
}

export type InvoiceCostTableRow = {
  label: string;
  calculation: string;
  amount: number;
};

export type InvoiceCostTable = {
  rows: InvoiceCostTableRow[];
  subtotalExclBtw: number;
  btw: number;
  btwPercentage: number | null;
  btwRows?: Array<{ label: string; value: number }>;
  totalInclBtw: number;
};

export type FinancialAdjustmentRow = {
  label: string;
  value: number;
};

async function urlToBase64(url: string): Promise<string> {
  const response = await fetch(`/api/logo-to-base64?url=${encodeURIComponent(url)}`);
  if (!response.ok) throw new Error('Kon logo niet ophalen via API');
  const json = await response.json();
  if (!json?.dataUrl) throw new Error('Geen dataUrl ontvangen voor logo');
  return json.dataUrl as string;
}

function getImageFormatFromDataUrl(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/i);
  const subtype = match?.[1]?.toLowerCase() || 'png';
  if (subtype === 'jpeg' || subtype === 'jpg') return 'JPEG';
  if (subtype === 'webp') return 'WEBP';
  return 'PNG';
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);
}

function isPositiveAmount(value: number | undefined | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) > 0.004;
}

export function shouldShowClientTaxNumbers(klanttype?: string | null): boolean {
  return String(klanttype || '').trim().toLowerCase() === 'zakelijk';
}

export function buildFinancialAdjustmentRows(financialAdjustments?: PDFInvoiceData['financialAdjustments']): FinancialAdjustmentRow[] {
  if (!financialAdjustments) return [];
  const rows: Array<FinancialAdjustmentRow | null> = [
    isPositiveAmount(financialAdjustments.originalTotalInclBtw)
      ? { label: 'Origineel totaal (incl. BTW)', value: financialAdjustments.originalTotalInclBtw }
      : null,
    isPositiveAmount(financialAdjustments.voorschotAftrekInclBtw)
      ? { label: 'Voorschot in mindering', value: -Math.abs(financialAdjustments.voorschotAftrekInclBtw) }
      : null,
    isPositiveAmount(financialAdjustments.voorschotFactuurPaidAmount)
      ? { label: 'Reeds betaald op voorschot (info)', value: financialAdjustments.voorschotFactuurPaidAmount }
      : null,
  ];
  return rows.filter(Boolean) as FinancialAdjustmentRow[];
}

function toFiniteNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function readPath(source: unknown, path: string): unknown {
  if (!source || typeof source !== 'object') return undefined;
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
}

function firstNumber(source: unknown, paths: string[]): number | null {
  for (const path of paths) {
    const value = toFiniteNumber(readPath(source, path));
    if (value !== null) return value;
  }
  return null;
}

function sumMaterialRows(rows: unknown): number | null {
  if (!Array.isArray(rows)) return null;
  const total = rows.reduce((sum, row) => {
    if (!row || typeof row !== 'object') return sum;
    const record = row as Record<string, unknown>;
    const rowTotal = toFiniteNumber(record.totaal)
      ?? toFiniteNumber(record.totaalExclBtw)
      ?? toFiniteNumber(record.totaal_excl_btw)
      ?? toFiniteNumber(record.subtotaal);
    if (rowTotal !== null) return sum + rowTotal;

    const amount = toFiniteNumber(record.aantal) ?? 0;
    const price = toFiniteNumber(record.prijsPerStuk)
      ?? toFiniteNumber(record.prijs_per_stuk)
      ?? toFiniteNumber(record.prijs_excl_btw)
      ?? toFiniteNumber(record.prijs);
    return price === null ? sum : sum + amount * price;
  }, 0);
  return total > 0 ? total : null;
}

function sumLaborRows(rows: unknown): number | null {
  if (!Array.isArray(rows)) return null;
  const total = rows.reduce((sum, row) => {
    if (!row || typeof row !== 'object') return sum;
    const record = row as Record<string, unknown>;
    const rowTotal = toFiniteNumber(record.totaal)
      ?? toFiniteNumber(record.totaalExclBtw)
      ?? toFiniteNumber(record.totaal_excl_btw);
    if (rowTotal !== null) return sum + rowTotal;

    const hours = toFiniteNumber(record.uren) ?? toFiniteNumber(record.hours) ?? 0;
    const rate = toFiniteNumber(record.tarief)
      ?? toFiniteNumber(record.uurtarief)
      ?? toFiniteNumber(record.uurTariefExclBtw)
      ?? toFiniteNumber(record.rate);
    return rate === null ? sum : sum + hours * rate;
  }, 0);
  return total > 0 ? total : null;
}

function formatDecimal(value: number, maximumFractionDigits: number): string {
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : Math.min(2, maximumFractionDigits),
    maximumFractionDigits,
  }).format(value);
}

function getInvoiceBreakdown(snapshot: DataJson | null | undefined, laborHoursPerDay?: number): {
  materials: number;
  labor: number;
  hours: number;
  hourlyRate: number | null;
  laborHighVatHours: number;
  laborLowVatHours: number;
  laborHighVatAmount: number;
  laborLowVatAmount: number;
  laborHighVatRate: number | null;
  laborLowVatRate: number | null;
  transport: number;
  transportCalculation: string;
  margin: number;
  subtotalExclBtw: number | null;
  btw: number | null;
  btwPercentage: number | null;
  btwHigh: number | null;
  btwLow: number | null;
  totalInclBtw: number | null;
} | null {
  if (!snapshot) return null;
  const source = snapshot as Record<string, unknown>;
  let calculatedTotals: Record<string, unknown> | null = null;
  try {
    const quoteSettings = (source.instellingen || {}) as any;
    if (quoteSettings && typeof quoteSettings === 'object') {
      const snapshotHoursPerDay = firstNumber(source, [
        'urenPerDag',
        'uren_per_dag',
        'planningSettings.defaultWorkdayHours',
        'instellingen.planningSettings.defaultWorkdayHours',
      ]);
      const effectiveHoursPerDay = laborHoursPerDay && laborHoursPerDay > 0
        ? laborHoursPerDay
        : snapshotHoursPerDay ?? 8;
      calculatedTotals = calculateQuoteTotals(snapshot, quoteSettings, effectiveHoursPerDay) as unknown as Record<string, unknown>;
    }
  } catch {
    calculatedTotals = null;
  }

  const materials = firstNumber({ ...source, calculatedTotals }, [
    'calculatedTotals.materialenTotaal',
    'totals.materialenTotaal',
    'totals.materialen_totaal',
    'totals.materialsTotal',
    'totalen.materialenTotaal',
    'materialenTotaal',
    'materialen_totaal',
    'materiaalTotaal',
  ]) ?? (
    (sumMaterialRows(source.grootmaterialen) ?? 0)
    + (sumMaterialRows(source.verbruiksartikelen) ?? 0)
  );

  const labor = firstNumber({ ...source, calculatedTotals }, [
    'calculatedTotals.arbeidTotaal',
    'totals.arbeidTotaal',
    'totals.arbeid_totaal',
    'totals.laborTotal',
    'totalen.arbeidTotaal',
    'arbeidTotaal',
    'arbeid_totaal',
    'totaalArbeid',
    'totaal_arbeid',
  ]) ?? sumLaborRows(source.uren_specificatie) ?? (() => {
    const hours = toFiniteNumber(source.totaal_uren);
    const rate = firstNumber(source, ['instellingen.uurTariefExclBtw', 'instellingen.uurTarief', 'settings.uurTariefExclBtw']);
    return hours !== null && rate !== null ? hours * rate : 0;
  })();

  const hours = firstNumber(source, [
    'totaal_uren',
    'totaaluren',
    'totalHours',
    'hoursTotal',
  ]) ?? (Array.isArray(source.uren_specificatie)
    ? source.uren_specificatie.reduce((sum, row) => {
      if (!row || typeof row !== 'object') return sum;
      const record = row as Record<string, unknown>;
      return sum + (toFiniteNumber(record.uren) ?? toFiniteNumber(record.hours) ?? 0);
    }, 0)
    : 0);

  const hourlyRate = firstNumber(source, [
    'instellingen.uurTariefExclBtw',
    'instellingen.uurTarief',
    'settings.uurTariefExclBtw',
    'settings.uurTarief',
  ]) ?? (hours > 0 && labor > 0 ? labor / hours : null);

  const laborLowVatHoursRaw = firstNumber({ ...source, calculatedTotals }, [
    'calculatedTotals.arbeidLaagBtwUren',
    'totals.arbeidLaagBtwUren',
    'instellingen.arbeidBtwLaagUren',
  ]) ?? 0;
  const laborLowVatRate = firstNumber({ ...source, calculatedTotals }, [
    'calculatedTotals.arbeidLaagBtwTarief',
    'totals.arbeidLaagBtwTarief',
    'instellingen.arbeidBtwLaagTarief',
  ]) ?? 9;
  const laborHighVatRate = firstNumber({ ...source, calculatedTotals }, [
    'calculatedTotals.arbeidHoogBtwTarief',
    'totals.arbeidHoogBtwTarief',
    'instellingen.btwTarief',
  ]);
  const laborLowVatHours = Math.min(Math.max(0, laborLowVatHoursRaw), Math.max(0, hours));
  const laborHighVatHours = Math.max(0, hours - laborLowVatHours);
  const laborLowVatAmount = firstNumber({ ...source, calculatedTotals }, [
    'calculatedTotals.arbeidLaagBtwTotaal',
    'totals.arbeidLaagBtwTotaal',
  ]) ?? (hourlyRate !== null ? laborLowVatHours * hourlyRate : 0);
  const laborHighVatAmount = firstNumber({ ...source, calculatedTotals }, [
    'calculatedTotals.arbeidHoogBtwTotaal',
    'totals.arbeidHoogBtwTotaal',
  ]) ?? Math.max(0, labor - laborLowVatAmount);

  const transport = firstNumber({ ...source, calculatedTotals }, [
    'totals.transportTotaal',
    'totals.transport_totaal',
    'totals.transportTotal',
    'totalen.transportTotaal',
    'transportTotaal',
    'transport_totaal',
    'transportTotal',
    'calculatedTotals.transportTotaal',
  ]) ?? (() => {
    const tunnel = firstNumber(source, [
      'instellingen.extras.transport.tunnelkosten',
      'extras.transport.tunnelkosten',
    ]) ?? 0;
    const fixed = firstNumber(source, [
      'instellingen.extras.transport.vasteTransportkosten',
      'extras.transport.vasteTransportkosten',
    ]);
    if (fixed !== null) return fixed + tunnel;

    const roundTrip = firstNumber(source, ['transport_berekening.roundTripTravelCost']);
    if (roundTrip !== null) {
      const days = Math.max(1, Math.ceil(Math.max(0, hours) / 8));
      return roundTrip * days + tunnel;
    }

    const distance = firstNumber(source, [
      'transport_berekening.roundTripDistanceKm',
      'transport_berekening.distanceKm',
      'extras.transport.afstandKm',
    ]);
    const rate = firstNumber(source, [
      'instellingen.extras.transport.prijsPerKm',
      'extras.transport.prijsPerKm',
      'instellingen.transportPrijsPerKm',
      'transport_berekening.ratePerKm',
    ]);
    if (distance !== null && rate !== null) {
      const days = Math.max(1, Math.ceil(Math.max(0, hours) / 8));
      return distance * rate * days + tunnel;
    }
    return 0;
  })();

  const snapshotHoursPerDay = firstNumber(source, [
    'urenPerDag',
    'uren_per_dag',
    'planningSettings.defaultWorkdayHours',
    'instellingen.planningSettings.defaultWorkdayHours',
  ]);
  const effectiveHoursPerDay = laborHoursPerDay && laborHoursPerDay > 0
    ? laborHoursPerDay
    : snapshotHoursPerDay ?? 8;
  const transportDays = firstNumber({ ...source, calculatedTotals }, [
    'transportAantalDagen',
    'totals.transportAantalDagen',
    'calculatedTotals.transportAantalDagen',
  ]) ?? Math.max(1, Math.ceil(Math.max(0, hours) / effectiveHoursPerDay));
  const transportRatePerKm = firstNumber({ ...source, calculatedTotals }, [
    'transportRatePerKm',
    'totals.transportRatePerKm',
    'instellingen.extras.transport.prijsPerKm',
    'extras.transport.prijsPerKm',
    'instellingen.transportPrijsPerKm',
    'transport_berekening.ratePerKm',
    'calculatedTotals.transportRatePerKm',
  ]);
  const transportDistanceOneWay = firstNumber({ ...source, calculatedTotals }, [
    'transportDistanceKmOneWay',
    'totals.transportDistanceKmOneWay',
    'transport_berekening.distanceKm',
    'calculatedTotals.transportDistanceKmOneWay',
  ]);
  const transportRoundTripDistance = firstNumber(source, [
    'transport_berekening.roundTripDistanceKm',
    'extras.transport.afstandKm',
  ]);
  const transportDistanceForDisplay = transportDistanceOneWay ?? (
    transportRoundTripDistance !== null ? transportRoundTripDistance / 2 : null
  );
  const oneWayTransportCost = transportRatePerKm !== null && transportDistanceForDisplay !== null
    ? Math.round(transportRatePerKm * transportDistanceForDisplay * 100) / 100
    : null;
  const roundTripTransportCost = oneWayTransportCost !== null
    ? Math.round(oneWayTransportCost * 2 * 100) / 100
    : null;
  const fixedTransportCosts = firstNumber(source, [
    'instellingen.extras.transport.vasteTransportkosten',
    'extras.transport.vasteTransportkosten',
  ]);
  const transportCalculation = transportRatePerKm !== null && transportRatePerKm > 0 && transportDistanceForDisplay !== null && transportDistanceForDisplay > 0
    ? `${formatDecimal(transportRatePerKm, 2)} × ${formatDecimal(transportDistanceForDisplay, 1)}km = ${formatCurrency(oneWayTransportCost ?? 0)} × 2 = ${formatCurrency(roundTripTransportCost ?? 0)} × ${formatDecimal(transportDays, 0)} dagen`
    : fixedTransportCosts !== null && fixedTransportCosts > 0
      ? `${formatCurrency(fixedTransportCosts)} × ${formatDecimal(transportDays, 0)} dagen`
      : '-';

  const margin = firstNumber({ ...source, calculatedTotals }, [
    'calculatedTotals.winstMarge',
    'totals.winstMarge',
    'totals.margin',
    'winstMarge',
    'winst_marge',
  ]) ?? 0;

  const subtotalExclBtw = firstNumber({ ...source, calculatedTotals }, [
    'calculatedTotals.totaalExclBtw',
    'totals.totaalExclBtw',
    'totals.totaal_excl_btw',
    'totaalExclBtw',
    'totaal_excl_btw',
  ]);

  const btw = firstNumber({ ...source, calculatedTotals }, [
    'calculatedTotals.btw',
    'totals.btw',
    'btw',
    'btwBedrag',
  ]);
  const btwHigh = firstNumber({ ...source, calculatedTotals }, [
    'calculatedTotals.btwHoog',
    'totals.btwHoog',
  ]);
  const btwLow = firstNumber({ ...source, calculatedTotals }, [
    'calculatedTotals.btwLaag',
    'totals.btwLaag',
  ]);

  const totalInclBtw = firstNumber({ ...source, calculatedTotals }, [
    'calculatedTotals.totaalInclBtw',
    'totals.totaalInclBtw',
    'totals.totaal_incl_btw',
    'totaalInclBtw',
    'totaal_incl_btw',
  ]);

  const btwPercentage = firstNumber({ ...source, calculatedTotals }, [
    'instellingen.btwTarief',
    'settings.btwTarief',
    'calculatedTotals.btwPercentage',
    'totals.btwPercentage',
  ]);

  const roundedMaterials = Math.round(materials * 100) / 100;
  const roundedLabor = Math.round(labor * 100) / 100;
  const roundedHours = Math.round(hours * 100) / 100;
  const roundedTransport = Math.round(transport * 100) / 100;
  const roundedMargin = Math.round(margin * 100) / 100;
  const roundedSubtotalExclBtw = subtotalExclBtw === null ? null : Math.round(subtotalExclBtw * 100) / 100;
  const roundedBtw = btw === null ? null : Math.round(btw * 100) / 100;
  const roundedTotalInclBtw = totalInclBtw === null ? null : Math.round(totalInclBtw * 100) / 100;
  if (roundedMaterials <= 0 && roundedLabor <= 0 && roundedHours <= 0 && roundedTransport <= 0 && roundedMargin <= 0) return null;
  return {
    materials: roundedMaterials,
    labor: roundedLabor,
    hours: roundedHours,
    hourlyRate: hourlyRate !== null && hourlyRate > 0 ? Math.round(hourlyRate * 100) / 100 : null,
    laborHighVatHours: Math.round(laborHighVatHours * 100) / 100,
    laborLowVatHours: Math.round(laborLowVatHours * 100) / 100,
    laborHighVatAmount: Math.round(Math.max(0, laborHighVatAmount) * 100) / 100,
    laborLowVatAmount: Math.round(Math.max(0, laborLowVatAmount) * 100) / 100,
    laborHighVatRate: laborHighVatRate !== null && laborHighVatRate > 0 ? Math.round(laborHighVatRate * 100) / 100 : null,
    laborLowVatRate: laborLowVatRate !== null && laborLowVatRate > 0 ? Math.round(laborLowVatRate * 100) / 100 : null,
    transport: roundedTransport,
    transportCalculation,
    margin: roundedMargin,
    subtotalExclBtw: roundedSubtotalExclBtw,
    btw: roundedBtw,
    btwPercentage: btwPercentage !== null && btwPercentage > 0 ? Math.round(btwPercentage * 100) / 100 : null,
    btwHigh: btwHigh !== null ? Math.round(btwHigh * 100) / 100 : null,
    btwLow: btwLow !== null ? Math.round(btwLow * 100) / 100 : null,
    totalInclBtw: roundedTotalInclBtw,
  };
}

function formatHours(hours: number): string {
  const formatted = new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: Number.isInteger(hours) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(hours);
  return `${formatted} uur`;
}

export function buildInvoiceCostTable(data: Pick<PDFInvoiceData, 'calculationSnapshot' | 'totals' | 'showMaterialLaborBreakdown' | 'showTransportBreakdown' | 'showHourlyRateOnInvoice' | 'laborHoursPerDay'>): InvoiceCostTable {
  const breakdown = getInvoiceBreakdown(data.calculationSnapshot, data.laborHoursPerDay);
  const rows: InvoiceCostTableRow[] = [];

  if (breakdown && data.showMaterialLaborBreakdown) {
    if (breakdown.materials > 0) {
      rows.push({ label: 'Materiaal', calculation: '-', amount: breakdown.materials });
    }
    if (breakdown.labor > 0) {
      const showHourlyRate = data.showHourlyRateOnInvoice === true && breakdown.hours > 0 && breakdown.hourlyRate !== null;
      const hourlyRate = breakdown.hourlyRate ?? 0;
      const hasLaborVatSplit = breakdown.laborLowVatHours > 0 && breakdown.laborLowVatAmount > 0;
      if (hasLaborVatSplit) {
        rows.push({
          label: `Arbeid ${formatDecimal(breakdown.laborHighVatRate ?? breakdown.btwPercentage ?? 21, 2)}%`,
          calculation: showHourlyRate
            ? `${formatHours(breakdown.laborHighVatHours)} × ${formatCurrency(hourlyRate)}`
            : '-',
          amount: breakdown.laborHighVatAmount,
        });
        rows.push({
          label: `Arbeid ${formatDecimal(breakdown.laborLowVatRate ?? 9, 2)}%`,
          calculation: showHourlyRate
            ? `${formatHours(breakdown.laborLowVatHours)} × ${formatCurrency(hourlyRate)}`
            : '-',
          amount: breakdown.laborLowVatAmount,
        });
      } else {
        rows.push({
          label: 'Arbeid',
          calculation: showHourlyRate
            ? `${formatHours(breakdown.hours)} × ${formatCurrency(hourlyRate)}`
            : '-',
          amount: breakdown.labor,
        });
      }
    }
  }

  if (breakdown && data.showTransportBreakdown && breakdown.transport > 0) {
    rows.push({ label: 'Transport', calculation: breakdown.transportCalculation, amount: breakdown.transport });
  }

  const rowSubtotal = Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
  const knownSubtotal = data.totals.totaalExclBtw ?? breakdown?.subtotalExclBtw ?? null;
  const marginFromBreakdown = breakdown?.margin ?? 0;
  const missingSubtotal = knownSubtotal !== null ? Math.round((knownSubtotal - rowSubtotal) * 100) / 100 : 0;
  const otherCosts = marginFromBreakdown > 0 ? marginFromBreakdown : (missingSubtotal > 0.01 ? missingSubtotal : 0);
  if (otherCosts > 0.01) {
    rows.push({ label: 'Opslag', calculation: '-', amount: Math.round(otherCosts * 100) / 100 });
  }

  const subtotalExclBtw = Math.round((data.totals.totaalExclBtw ?? breakdown?.subtotalExclBtw ?? rows.reduce((sum, row) => sum + row.amount, 0)) * 100) / 100;
  const totalInclBtw = Math.round(data.totals.totaalInclBtw * 100) / 100;
  const btw = Math.round((data.totals.btw ?? breakdown?.btw ?? Math.max(0, totalInclBtw - subtotalExclBtw)) * 100) / 100;
  const btwPercentage = breakdown?.btwPercentage ?? (
    subtotalExclBtw > 0 && btw > 0 ? Math.round((btw / subtotalExclBtw) * 10000) / 100 : null
  );
  const btwRows = breakdown && breakdown.btwHigh !== null && breakdown.btwLow !== null && breakdown.btwLow > 0
    ? [
      {
        label: `BTW ${formatDecimal(breakdown.laborHighVatRate ?? btwPercentage ?? 21, 2)}%`,
        value: breakdown.btwHigh ?? 0,
      },
      {
        label: `BTW ${formatDecimal(breakdown.laborLowVatRate ?? 9, 2)}%`,
        value: breakdown.btwLow ?? 0,
      },
    ].filter((row) => row.value > 0)
    : undefined;

  return {
    rows,
    subtotalExclBtw,
    btw,
    btwPercentage,
    btwRows,
    totalInclBtw,
  };
}

export async function generateInvoicePDF(data: PDFInvoiceData): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = margin;

  // Logo (optional)
  if (data.logoUrl) {
    try {
      const dataUrl = await urlToBase64(data.logoUrl);
      const fmt = getImageFormatFromDataUrl(dataUrl);
      const scale = typeof data.logoScale === 'number' && Number.isFinite(data.logoScale) ? data.logoScale : 1.0;
      const logoW = 32 * scale;
      const logoH = 16 * scale;
      doc.addImage(dataUrl, fmt, margin, y, logoW, logoH);
    } catch {
      // bewust: PDF moet alsnog werken zonder logo
    }
  }

  // Header right
  const isVoorschotInvoice = data.invoiceType === 'voorschot';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(isVoorschotInvoice ? 'VOORSCHOTFACTUUR' : 'EINDFACTUUR', pageWidth - margin, y + 5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Factuur #${data.invoiceNumberLabel}`, pageWidth - margin, y + 12, { align: 'right' });
  doc.text(`Factuurdatum: ${data.issueDate}`, pageWidth - margin, y + 17, { align: 'right' });
  doc.text(`Vervaldatum: ${data.dueDate}`, pageWidth - margin, y + 22, { align: 'right' });
  if (isVoorschotInvoice) {
    doc.text('Betaaltermijn: Direct', pageWidth - margin, y + 27, { align: 'right' });
  } else if (typeof data.paymentTermDays === 'number' && Number.isFinite(data.paymentTermDays)) {
    doc.text(`Betaaltermijn: ${Math.max(1, Math.round(data.paymentTermDays))} dagen`, pageWidth - margin, y + 27, { align: 'right' });
  }
  if (data.betreftOfferte) {
    doc.text(`Betreft: ${data.betreftOfferte}`, pageWidth - margin, y + 32, { align: 'right' });
  }
  const description = (data.invoiceDescription || '').trim();
  let headerExtraHeight = 0;
  if (description) {
    doc.setFontSize(9);
    const descriptionLines = doc.splitTextToSize(`Omschrijving: ${description}`, 85) as string[];
    descriptionLines.forEach((line, idx) => {
      doc.text(line, pageWidth - margin, y + 37 + idx * 5, { align: 'right' });
    });
    headerExtraHeight = descriptionLines.length * 5;
    doc.setFontSize(10);
  }

  y += 37 + headerExtraHeight;

  // Company + customer blocks
  const colGap = 10;
  const colW = (pageWidth - margin * 2 - colGap) / 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Van', margin, y);
  doc.text('Aan', margin + colW + colGap, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const bedrijfLines = [
    data.bedrijf.naam,
    data.bedrijf.adres,
    `${data.bedrijf.postcode} ${data.bedrijf.plaats}`.trim(),
    '',
    `Tel: ${data.bedrijf.telefoon}`.trim(),
    `E-mail: ${data.bedrijf.email}`.trim(),
    `KVK: ${data.bedrijf.kvk}`.trim(),
    `BTW: ${data.bedrijf.btw}`.trim(),
  ].filter(Boolean);

  const isZakelijkeKlant = shouldShowClientTaxNumbers(data.klant.klanttype);
  const klantKvk = String(data.klant.kvk || '').trim();
  const klantBtw = String(data.klant.btw || '').trim();
  const klantLines = [
    data.klant.naam,
    data.klant.adres,
    `${data.klant.postcode} ${data.klant.plaats}`.trim(),
    '',
    `Tel: ${data.klant.telefoon}`.trim(),
    `E-mail: ${data.klant.email}`.trim(),
    isZakelijkeKlant && klantKvk ? `KVK: ${klantKvk}` : '',
    isZakelijkeKlant && klantBtw ? `BTW: ${klantBtw}` : '',
  ].filter(Boolean);

  const startY = y + 6;
  bedrijfLines.forEach((line, idx) => doc.text(line, margin, startY + idx * 5));
  klantLines.forEach((line, idx) => doc.text(line, margin + colW + colGap, startY + idx * 5));

  const blockHeight = Math.max(bedrijfLines.length, klantLines.length) * 5 + 6;
  y += blockHeight + 6;

  // Divider
  doc.setDrawColor(210);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // Specificatie (eindfactuur)
  if (data.invoiceType === 'eind' && data.financialAdjustments) {
    const specRows = buildFinancialAdjustmentRows(data.financialAdjustments);

    if (specRows.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Specificatie', margin, y);
      y += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);

      specRows.forEach((row) => {
        doc.text(row.label, margin, y);
        const v = row.value;
        const formatted = (v < 0 ? '-' : '') + formatCurrency(Math.abs(v));
        doc.text(formatted, pageWidth - margin, y, { align: 'right' });
        y += 5;
      });

      y += 8;
    }
  }

  const invoiceCostTable = data.showMaterialLaborBreakdown || data.showTransportBreakdown
    ? buildInvoiceCostTable(data)
    : null;
  const hasCostTable = !!invoiceCostTable;
  if (invoiceCostTable) {
    if (y > 245) {
      doc.addPage();
      y = margin;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Specificatie kosten', margin, y);
    y += 8;

    const tableLeft = margin;
    const tableRight = pageWidth - margin;
    const descX = tableLeft;
    const calcX = tableLeft + 54;
    const amountX = tableRight;
    const rowHeight = 6;

    doc.setFontSize(9);
    doc.setTextColor(95);
    doc.text('Omschrijving', descX, y);
    doc.text('Aantal / berekening', calcX, y);
    doc.text('Bedrag excl. BTW', amountX, y, { align: 'right' });
    y += 3;

    doc.setDrawColor(210);
    doc.line(tableLeft, y, tableRight, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(0);
    invoiceCostTable.rows.forEach((row) => {
      if (y > 270) {
        doc.addPage();
        y = margin;
      }
      doc.text(row.label, descX, y);
      doc.text(row.calculation, calcX, y);
      doc.text(formatCurrency(row.amount), amountX, y, { align: 'right' });
      y += rowHeight;
    });

    y += 2;
    doc.setDrawColor(210);
    doc.line(tableLeft, y, tableRight, y);
    y += 6;

    const totalRows: Array<{ label: string; value: number; bold?: boolean }> = [
      { label: 'Subtotaal excl. BTW', value: invoiceCostTable.subtotalExclBtw },
      ...(invoiceCostTable.btwRows && invoiceCostTable.btwRows.length > 0
        ? invoiceCostTable.btwRows
        : [{
        label: invoiceCostTable.btwPercentage !== null
          ? `BTW ${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 }).format(invoiceCostTable.btwPercentage)}%`
          : 'BTW',
        value: invoiceCostTable.btw,
      }]),
      { label: 'Totaal incl. BTW', value: invoiceCostTable.totalInclBtw, bold: true },
    ];

    totalRows.forEach((row) => {
      doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
      doc.text(row.label, calcX, y);
      doc.text(formatCurrency(row.value), amountX, y, { align: 'right' });
      y += rowHeight;
    });

    doc.setFont('helvetica', 'normal');
    y += 6;
  }

  // Totals
  if (!hasCostTable) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Totaal', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const totalRows: Array<{ label: string; value: number | undefined }> = [
      { label: 'Totaal (excl. BTW)', value: data.totals.totaalExclBtw },
      { label: 'BTW', value: data.totals.btw },
      { label: 'Totaal (incl. BTW)', value: data.totals.totaalInclBtw },
    ];

    totalRows.forEach((row) => {
      if (row.value === undefined || row.value === null) return;
      doc.text(row.label, margin, y);
      doc.text(formatCurrency(row.value), pageWidth - margin, y, { align: 'right' });
      y += 5;
    });

    y += 8;
  }

  const invoiceNotes = (data.invoiceNotes || '').trim();
  if (invoiceNotes) {
    if (y > 245) {
      doc.addPage();
      y = margin;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Notities', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const noteLines = invoiceNotes
      .split(/\r?\n/)
      .flatMap((line) => {
        const cleaned = line.trimEnd();
        if (!cleaned.trim()) return [''];
        return doc.splitTextToSize(cleaned, pageWidth - margin * 2) as string[];
      });

    noteLines.forEach((line) => {
      if (y > 270) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += line ? 5 : 3;
    });

    y += 5;
  }

  // Payment instructions
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Betalingsinformatie', margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const paymentLines: string[] = [];

  if (data.bedrijf.iban) paymentLines.push(`IBAN: ${data.bedrijf.iban}`);
  if (data.bedrijf.bic) paymentLines.push(`BIC: ${data.bedrijf.bic}`);
  paymentLines.push(`Omschrijving: ${isVoorschotInvoice ? 'Voorschotfactuur' : 'Eindfactuur'} #${data.invoiceNumberLabel}`);

  const standaardTekst = (data.standaardFactuurTekst || '').trim();
  if (standaardTekst) {
    paymentLines.push('');
    paymentLines.push(...doc.splitTextToSize(standaardTekst, pageWidth - margin * 2));
  }

  paymentLines.forEach((line) => {
    if (y > 270) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += 5;
  });

  return doc.output('blob');
}
