import type { ProfitDayPoint, ProfitKpis, ProfitMonthPoint, ProfitStatusDistribution, ProfitTopItem } from '@/lib/profit-metrics';

export interface ProfitExportPayload {
  periodLabel: string;
  generatedAt: Date;
  kpis: ProfitKpis;
  monthSeries: ProfitMonthPoint[];
  daySeries: ProfitDayPoint[];
  topOffers: ProfitTopItem[];
  topOpenInvoices: ProfitTopItem[];
  statusDistribution: ProfitStatusDistribution;
}

function euro(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number.isFinite(amount) ? amount : 0);
}

function percent(value: number): string {
  return `${(Number.isFinite(value) ? value : 0).toFixed(1)}%`;
}

function dateLabel(date: Date): string {
  return new Intl.DateTimeFormat('nl-NL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function escapeCsvValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvLine(values: string[]): string {
  return values.map(escapeCsvValue).join(',');
}

export function buildProfitCsv(payload: ProfitExportPayload): string {
  const lines: string[] = [];
  lines.push(csvLine(['Sectie', 'Metric', 'Waarde']));
  lines.push(csvLine(['Metadata', 'Periode', payload.periodLabel]));
  lines.push(csvLine(['Metadata', 'Gegenereerd op', dateLabel(payload.generatedAt)]));
  lines.push(csvLine(['KPI', 'Geprognotiseerde winst', euro(payload.kpis.forecastProfit)]));
  lines.push(csvLine(['KPI', 'Ontvangen betalingen', euro(payload.kpis.receivedPayments)]));
  lines.push(csvLine(['KPI', 'Openstaand bedrag', euro(payload.kpis.openAmount)]));
  lines.push(csvLine(['KPI', 'Te laat risico', euro(payload.kpis.overdueAmount)]));
  lines.push(csvLine(['KPI', 'Cash-in ratio', percent(payload.kpis.cashInRatio * 100)]));
  lines.push(csvLine(['KPI', 'Gem. winst per geaccepteerde offerte', euro(payload.kpis.averageForecastPerAcceptedQuote)]));
  lines.push(csvLine(['KPI', 'Gem. factuurwaarde', euro(payload.kpis.averageInvoiceValue)]));
  lines.push(csvLine(['KPI', 'Top 5 winstconcentratie', percent(payload.kpis.top5ProfitConcentrationPct)]));

  lines.push('');
  lines.push(csvLine(['Maandtrend', 'Maand', 'Forecast winst', 'Ontvangen', 'Openstaand', 'Te laat']));
  payload.monthSeries.forEach((row) => {
    lines.push(csvLine(['Maandtrend', row.maand, euro(row.forecastProfit), euro(row.received), euro(row.open), euro(row.overdue)]));
  });

  lines.push('');
  lines.push(csvLine(['Dagtrend (30d)', 'Dag', 'Ontvangen']));
  payload.daySeries.forEach((row) => {
    lines.push(csvLine(['Dagtrend (30d)', row.dag, euro(row.received)]));
  });

  lines.push('');
  lines.push(csvLine(['Top Offertes', 'Label', 'Winst']));
  payload.topOffers.forEach((row) => {
    lines.push(csvLine(['Top Offertes', row.label, euro(row.value)]));
  });

  lines.push('');
  lines.push(csvLine(['Top Openstaand', 'Label', 'Openstaand']));
  payload.topOpenInvoices.forEach((row) => {
    lines.push(csvLine(['Top Openstaand', row.label, euro(row.value)]));
  });

  lines.push('');
  lines.push(csvLine(['Statusverdeling', 'Status', 'Aantal']));
  lines.push(csvLine(['Statusverdeling', 'Concept', String(payload.statusDistribution.concept)]));
  lines.push(csvLine(['Statusverdeling', 'Openstaand', String(payload.statusDistribution.openstaand)]));
  lines.push(csvLine(['Statusverdeling', 'Gedeeltelijk betaald', String(payload.statusDistribution.gedeeltelijkBetaald)]));
  lines.push(csvLine(['Statusverdeling', 'Betaald', String(payload.statusDistribution.betaald)]));
  lines.push(csvLine(['Statusverdeling', 'Te laat', String(payload.statusDistribution.teLaat)]));

  return lines.join('\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function exportProfitPdf(filename: string, payload: ProfitExportPayload): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  let y = 52;
  const left = 40;
  const lineGap = 18;

  const addLine = (text: string, bold = false): void => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(text, left, y);
    y += lineGap;
    if (y > 790) {
      doc.addPage();
      y = 52;
    }
  };

  addLine('Winst rapport', true);
  addLine(`Periode: ${payload.periodLabel}`);
  addLine(`Gegenereerd op: ${dateLabel(payload.generatedAt)}`);
  y += 8;

  addLine('KPI', true);
  addLine(`Geprognotiseerde winst: ${euro(payload.kpis.forecastProfit)}`);
  addLine(`Ontvangen betalingen: ${euro(payload.kpis.receivedPayments)}`);
  addLine(`Openstaand bedrag: ${euro(payload.kpis.openAmount)}`);
  addLine(`Te laat risico: ${euro(payload.kpis.overdueAmount)}`);
  addLine(`Cash-in ratio: ${percent(payload.kpis.cashInRatio * 100)}`);
  addLine(`Gem. winst per geaccepteerde offerte: ${euro(payload.kpis.averageForecastPerAcceptedQuote)}`);
  addLine(`Gem. factuurwaarde: ${euro(payload.kpis.averageInvoiceValue)}`);
  addLine(`Top 5 winstconcentratie: ${percent(payload.kpis.top5ProfitConcentrationPct)}`);
  y += 8;

  addLine('Maandtrend', true);
  payload.monthSeries.forEach((row) => {
    addLine(`${row.maand}: forecast ${euro(row.forecastProfit)} | ontvangen ${euro(row.received)} | open ${euro(row.open)} | te laat ${euro(row.overdue)}`);
  });
  y += 8;

  addLine('Top 5 winstgevende offertes', true);
  if (payload.topOffers.length === 0) {
    addLine('Geen data');
  } else {
    payload.topOffers.forEach((item, index) => addLine(`${index + 1}. ${item.label} - ${euro(item.value)}`));
  }
  y += 8;

  addLine('Top 5 hoogste openstaand', true);
  if (payload.topOpenInvoices.length === 0) {
    addLine('Geen data');
  } else {
    payload.topOpenInvoices.forEach((item, index) => addLine(`${index + 1}. ${item.label} - ${euro(item.value)}`));
  }

  doc.save(filename);
}
