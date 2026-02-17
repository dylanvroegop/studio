import { jsPDF } from 'jspdf';

import type {
  MeerwerkbonApproval,
  MeerwerkbonLineItem,
  MeerwerkbonTemplateSettings,
  MeerwerkbonTotals,
} from '@/lib/types';
import { formatCurrency } from '@/lib/meerwerkbon-utils';

export interface PDFMeerwerkbonData {
  numberLabel: string;
  issueDate: string;
  statusLabel: string;
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
  };
  klant: {
    naam: string;
    adres: string;
    postcode: string;
    plaats: string;
    telefoon: string;
    email: string;
  };
  linkedQuotes: Array<{
    quoteId: string;
    offerteNummer?: number;
    titel?: string;
  }>;
  lineItems: MeerwerkbonLineItem[];
  totals: MeerwerkbonTotals;
  introText?: string;
  voorwaardenText?: string;
  approval?: MeerwerkbonApproval | null;
  template: MeerwerkbonTemplateSettings;
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

function drawRow(
  doc: jsPDF,
  y: number,
  columns: Array<{ x: number; text: string; align?: 'left' | 'right' | 'center' }>
): number {
  columns.forEach((column) => {
    doc.text(column.text, column.x, y, { align: column.align || 'left' });
  });
  return y + 5;
}

export async function generateMeerwerkbonPDF(data: PDFMeerwerkbonData): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  let y = margin;

  const drawDivider = () => {
    doc.setDrawColor(70);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
  };

  const ensureSpace = (needed = 24) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  if (data.logoUrl) {
    try {
      const base64 = await urlToBase64(data.logoUrl);
      const format = getImageFormatFromDataUrl(base64);
      const scale = typeof data.logoScale === 'number' && Number.isFinite(data.logoScale) ? data.logoScale : 1;
      const width = 30 * scale;
      const height = 14 * scale;
      doc.addImage(base64, format, margin, y, width, height);
    } catch {
      // PDF should still render when logo fails.
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('MEERWERKBON', pageWidth - margin, y + 5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Nummer: ${data.numberLabel}`, pageWidth - margin, y + 11, { align: 'right' });
  doc.text(`Datum: ${data.issueDate}`, pageWidth - margin, y + 16, { align: 'right' });
  doc.text(`Status: ${data.statusLabel}`, pageWidth - margin, y + 21, { align: 'right' });
  y += 28;
  drawDivider();

  const colGap = 8;
  const colWidth = (pageWidth - margin * 2 - colGap) / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Opdrachtnemer', margin, y);
  doc.text('Opdrachtgever', margin + colWidth + colGap, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  const companyLines = [
    data.bedrijf.naam,
    data.bedrijf.adres,
    `${data.bedrijf.postcode} ${data.bedrijf.plaats}`.trim(),
    `Tel: ${data.bedrijf.telefoon}`.trim(),
    `E-mail: ${data.bedrijf.email}`.trim(),
    `KVK: ${data.bedrijf.kvk}`.trim(),
    `BTW: ${data.bedrijf.btw}`.trim(),
  ].filter(Boolean);
  const customerLines = [
    data.klant.naam,
    data.klant.adres,
    `${data.klant.postcode} ${data.klant.plaats}`.trim(),
    `Tel: ${data.klant.telefoon}`.trim(),
    `E-mail: ${data.klant.email}`.trim(),
  ].filter(Boolean);

  const blockTop = y;
  companyLines.forEach((line, index) => doc.text(line, margin, blockTop + index * 4.6));
  customerLines.forEach((line, index) => doc.text(line, margin + colWidth + colGap, blockTop + index * 4.6));
  y += Math.max(companyLines.length, customerLines.length) * 4.6 + 2;
  drawDivider();

  if (data.template.showLinkedQuotes && data.linkedQuotes.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('Gekoppelde offertes', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    data.linkedQuotes.forEach((row) => {
      ensureSpace(8);
      const label = typeof row.offerteNummer === 'number'
        ? `Offerte #${row.offerteNummer}`
        : `Offerte ${row.quoteId.slice(0, 8)}`;
      const title = (row.titel || '').toString().trim();
      const line = title ? `${label} - ${title}` : label;
      const parts = doc.splitTextToSize(line, pageWidth - margin * 2);
      doc.text(parts, margin, y);
      y += parts.length * 4.2 + 1;
    });
    drawDivider();
  }

  if (data.template.showIntroText && (data.introText || '').trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.8);
    const intro = doc.splitTextToSize(data.introText!.trim(), pageWidth - margin * 2);
    intro.forEach((line: string) => {
      ensureSpace(6);
      doc.text(line, margin, y);
      y += 4.5;
    });
    y += 2;
    drawDivider();
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Meerwerk specificatie', margin, y);
  y += 6;

  doc.setFontSize(8.8);
  doc.setFont('helvetica', 'bold');
  const hasVatColumn = data.template.showVatColumn;

  // Keep deterministic column widths + gutters so numbers don't visually collide.
  const columnGap = 2;
  const omschrijvingWidth = hasVatColumn ? 74 : 78;
  const aantalWidth = hasVatColumn ? 14 : 16;
  const eenheidWidth = hasVatColumn ? 20 : 24;
  const prijsWidth = hasVatColumn ? 22 : 24;
  const btwWidth = hasVatColumn ? 10 : 0;
  const totaalWidth = hasVatColumn ? 28 : 28;

  const xOmschrijving = margin;
  const xAantal = xOmschrijving + omschrijvingWidth + columnGap;
  const xEenheid = xAantal + aantalWidth + columnGap;
  const xPrijs = xEenheid + eenheidWidth + columnGap;
  const xBtw = xPrijs + prijsWidth + columnGap;
  const xTotaalLeft = hasVatColumn
    ? xBtw + btwWidth + columnGap
    : xPrijs + prijsWidth + columnGap;
  const xTotaal = xTotaalLeft + totaalWidth - 1;

  const xAantalRight = xAantal + aantalWidth - 1;
  const xPrijsRight = xPrijs + prijsWidth - 1;
  const xBtwRight = xBtw + btwWidth - 1;

  y = drawRow(doc, y, [
    { x: xOmschrijving, text: 'Omschrijving' },
    { x: xAantalRight, text: 'Aantal', align: 'right' },
    { x: xEenheid + 1, text: 'Eenheid' },
    { x: xPrijsRight, text: 'Prijs excl.', align: 'right' },
    ...(hasVatColumn ? [{ x: xBtwRight, text: 'BTW', align: 'right' as const }] : []),
    { x: xTotaal, text: 'Totaal incl.', align: 'right' },
  ]);
  doc.setDrawColor(100);
  doc.line(margin, y - 1.5, pageWidth - margin, y - 1.5);
  y += 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.7);
  data.lineItems.forEach((item) => {
    ensureSpace(10);
    const descLines = doc.splitTextToSize(item.omschrijving || '-', omschrijvingWidth - 2);
    const rows = Math.max(1, descLines.length);
    for (let i = 0; i < rows; i += 1) {
      const isFirst = i === 0;
      drawRow(doc, y, [
        { x: xOmschrijving, text: descLines[i] || '' },
        ...(isFirst
          ? [
            { x: xAantalRight, text: String(item.aantal || 0), align: 'right' as const },
            { x: xEenheid + 1, text: item.eenheid || '-' },
            { x: xPrijsRight, text: formatCurrency(item.prijsPerEenheidExclBtw || 0), align: 'right' as const },
            ...(hasVatColumn
              ? [{ x: xBtwRight, text: `${item.btwTarief || 0}%`, align: 'right' as const }]
              : []),
            { x: xTotaal, text: formatCurrency(item.totaalInclBtw || 0), align: 'right' as const },
          ]
          : []),
      ]);
      y += 4.8;
    }
  });

  y += 2;
  doc.setDrawColor(100);
  doc.line(pageWidth - 75, y, pageWidth - margin, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  drawRow(doc, y, [
    { x: pageWidth - 75, text: 'Subtotaal excl.' },
    { x: xTotaal, text: formatCurrency(data.totals.subtotaalExclBtw), align: 'right' },
  ]);
  y += 5;
  drawRow(doc, y, [
    { x: pageWidth - 75, text: 'BTW totaal' },
    { x: xTotaal, text: formatCurrency(data.totals.btwTotaal), align: 'right' },
  ]);
  y += 5;
  drawRow(doc, y, [
    { x: pageWidth - 75, text: 'Totaal incl.' },
    { x: xTotaal, text: formatCurrency(data.totals.totaalInclBtw), align: 'right' },
  ]);
  y += 8;

  if (data.template.showVoorwaarden && (data.voorwaardenText || '').trim()) {
    ensureSpace(30);
    drawDivider();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Voorwaarden', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const rules = doc.splitTextToSize(data.voorwaardenText!.trim(), pageWidth - margin * 2);
    rules.forEach((line: string) => {
      ensureSpace(6);
      doc.text(line, margin, y);
      y += 4.2;
    });
  }

  if (data.template.showSignatureBlocks) {
    ensureSpace(48);
    y += 3;
    drawDivider();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Akkoordverklaring opdrachtgever', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const akkoordText =
      'Ondergetekende opdrachtgever verklaart akkoord te gaan met bovenstaande meerwerkzaamheden en bijbehorende kosten.';
    const akkoordLines = doc.splitTextToSize(akkoordText, pageWidth - margin * 2);
    akkoordLines.forEach((line: string) => {
      doc.text(line, margin, y);
      y += 4.2;
    });

    y += 2;
    const sigLeft = margin;
    const sigRight = margin + 98;
    doc.text(`Naam opdrachtgever: ${data.approval?.naam || ''}`, sigLeft, y);
    doc.text(`Plaats: ${data.approval?.plaats || ''}`, sigRight, y);
    y += 6;
    doc.text(`Datum: ${data.approval?.datum || ''}`, sigLeft, y);
    doc.text('Handtekening opdrachtgever:', sigRight, y);
    y += 12;
    doc.line(sigRight, y, pageWidth - margin, y);
    y += 8;
    doc.text('Handtekening opdrachtnemer:', sigLeft, y);
    y += 12;
    doc.line(sigLeft, y, sigLeft + 70, y);
  }

  return doc.output('blob');
}
