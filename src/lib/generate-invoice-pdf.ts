import { jsPDF } from 'jspdf';
import type { DataJson } from '@/lib/quote-calculations';
import type { InvoiceType } from '@/lib/types';

export interface PDFInvoiceData {
  invoiceType: InvoiceType;
  invoiceNumberLabel: string;
  issueDate: string;
  dueDate: string;
  betreftOfferte?: string;

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
    naam: string;
    adres: string;
    postcode: string;
    plaats: string;
    telefoon: string;
    email: string;
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

  standaardFactuurTekst?: string;
  calculationSnapshot?: DataJson | null;
}

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
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(data.invoiceType === 'voorschot' ? 'VOORSCHOTFACTUUR' : 'EINDFACTUUR', pageWidth - margin, y + 5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Factuur #${data.invoiceNumberLabel}`, pageWidth - margin, y + 12, { align: 'right' });
  doc.text(`Factuurdatum: ${data.issueDate}`, pageWidth - margin, y + 17, { align: 'right' });
  doc.text(`Vervaldatum: ${data.dueDate}`, pageWidth - margin, y + 22, { align: 'right' });
  if (data.betreftOfferte) {
    doc.text(`Betreft: ${data.betreftOfferte}`, pageWidth - margin, y + 27, { align: 'right' });
  }

  y += 32;

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

  const klantLines = [
    data.klant.naam,
    data.klant.adres,
    `${data.klant.postcode} ${data.klant.plaats}`.trim(),
    '',
    `Tel: ${data.klant.telefoon}`.trim(),
    `E-mail: ${data.klant.email}`.trim(),
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
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Specificatie', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    const specRows: Array<{ label: string; value: number }> = [
      { label: 'Origineel totaal (incl. BTW)', value: data.financialAdjustments.originalTotalInclBtw },
      { label: 'Voorschot in mindering', value: -Math.abs(data.financialAdjustments.voorschotAftrekInclBtw) },
    ];

    if (typeof data.financialAdjustments.voorschotFactuurPaidAmount === 'number') {
      specRows.push({ label: 'Reeds betaald op voorschot (info)', value: data.financialAdjustments.voorschotFactuurPaidAmount });
    }

    specRows.forEach((row) => {
      doc.text(row.label, margin, y);
      const v = row.value;
      const formatted = (v < 0 ? '-' : '') + formatCurrency(Math.abs(v));
      doc.text(formatted, pageWidth - margin, y, { align: 'right' });
      y += 5;
    });

    y += 8;
  }

  // Totals
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Totaal', margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const totalRows: Array<{ label: string; value: number | undefined }> = [
    { label: 'Subtotaal (excl. BTW)', value: data.totals.totaalExclBtw },
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

  // Payment instructions
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Betalingsinformatie', margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const paymentLines: string[] = [];

  if (data.bedrijf.iban) paymentLines.push(`IBAN: ${data.bedrijf.iban}`);
  if (data.bedrijf.bankNaam) paymentLines.push(`Bank: ${data.bedrijf.bankNaam}`);
  if (data.bedrijf.bic) paymentLines.push(`BIC: ${data.bedrijf.bic}`);
  paymentLines.push(`Omschrijving: ${data.invoiceType === 'voorschot' ? 'Voorschotfactuur' : 'Eindfactuur'} #${data.invoiceNumberLabel}`);

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
