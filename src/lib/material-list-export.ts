import { jsPDF } from 'jspdf';

export interface MaterialListExportItem {
  key: string;
  naam: string;
  bron: string;
  eenheid: string;
  aantal: number;
  prijsExclBtw: number | null;
}

export interface MaterialListExportMeta {
  offerteNummer?: string | number | null;
  klusTitel?: string;
  klantNaam?: string;
  klantEmail?: string;
  createdAt?: Date;
}

interface BuildMaterialListTextOptions {
  includePrices: boolean;
  meta?: MaterialListExportMeta;
  greetingName?: string;
}

interface GenerateMaterialListPDFInput {
  items: MaterialListExportItem[];
  includePrices: boolean;
  meta?: MaterialListExportMeta;
}

function toDutchDate(input?: Date): string {
  const d = input instanceof Date ? input : new Date();
  return d.toLocaleDateString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function clampToPositiveInteger(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(1, Math.round(value));
}

function safeString(value: unknown): string {
  return String(value ?? '').trim();
}

export function formatMaterialListCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 'n.v.t.';
  return `EUR ${value.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function sanitizeMaterialListFilename(raw: string): string {
  const normalized = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || 'Materiaallijst';
}

export function buildDefaultMaterialListFileName(meta?: MaterialListExportMeta): string {
  const title = safeString(meta?.klusTitel);
  const nummer = safeString(meta?.offerteNummer);
  const datePart = toDutchDate(meta?.createdAt).replace(/\//g, '-');
  const parts = [
    'Materiaallijst',
    nummer ? `Offerte-${nummer}` : '',
    title || '',
    datePart,
  ].filter(Boolean);
  return sanitizeMaterialListFilename(parts.join('-'));
}

export function buildMaterialListText(
  items: MaterialListExportItem[],
  options: BuildMaterialListTextOptions,
): string {
  const includePrices = options.includePrices;
  const meta = options.meta;
  const title = safeString(meta?.klusTitel);
  const offerteNummer = safeString(meta?.offerteNummer);
  const klantNaam = safeString(meta?.klantNaam);

  const headerLines = [
    title ? `Materiaallijst - ${title}` : 'Materiaallijst',
    offerteNummer ? `Offerte: #${offerteNummer}` : '',
    klantNaam ? `Project klant: ${klantNaam}` : '',
    `Datum: ${toDutchDate(meta?.createdAt)}`,
    '',
  ].filter(Boolean);

  if (!items.length) {
    return [...headerLines, 'Geen materialen geselecteerd.'].join('\n');
  }

  const body = items.map((item, index) => {
    const aantal = clampToPositiveInteger(item.aantal);
    const eenheid = safeString(item.eenheid) || 'stuk';
    const priceLine = includePrices
      ? ` | Prijs excl. btw: ${formatMaterialListCurrency(item.prijsExclBtw)}`
      : '';
    return `${index + 1}. ${item.naam} | Aantal: ${aantal} ${eenheid} | Bron: ${item.bron}${priceLine}`;
  });

  return [...headerLines, ...body].join('\n');
}

export function buildMaterialListEmailBody(
  items: MaterialListExportItem[],
  options: BuildMaterialListTextOptions,
): string {
  const greetingName = safeString(options.greetingName);
  const introName = greetingName || 'team';
  const listText = buildMaterialListText(items, options);

  return [
    `Beste ${introName},`,
    '',
    'Hierbij sturen we de materiaallijst.',
    '',
    listText,
    '',
    'Met vriendelijke groet,',
  ].join('\n');
}

export async function generateMaterialListPDF(
  input: GenerateMaterialListPDFInput,
): Promise<Blob> {
  const items = input.items;
  const includePrices = input.includePrices;
  const meta = input.meta;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const rowPaddingY = 1.6;
  const rowLineHeight = 3.8;
  const textPaddingX = 1.6;

  const title = safeString(meta?.klusTitel)
    ? `Materiaallijst - ${safeString(meta?.klusTitel)}`
    : 'Materiaallijst';
  const offerteNummer = safeString(meta?.offerteNummer);
  const klantNaam = safeString(meta?.klantNaam);

  const columns = includePrices
    ? [
        { key: 'index', label: '#', width: 8, align: 'center' as const },
        { key: 'name', label: 'Materiaal', width: 60, align: 'left' as const },
        { key: 'source', label: 'Bron', width: 50, align: 'left' as const },
        { key: 'amount', label: 'Aantal', width: 14, align: 'right' as const },
        { key: 'unit', label: 'Eenheid', width: 20, align: 'left' as const },
        { key: 'price', label: 'Prijs excl.', width: 30, align: 'right' as const },
      ]
    : [
        { key: 'index', label: '#', width: 8, align: 'center' as const },
        { key: 'name', label: 'Materiaal', width: 78, align: 'left' as const },
        { key: 'source', label: 'Bron', width: 62, align: 'left' as const },
        { key: 'amount', label: 'Aantal', width: 14, align: 'right' as const },
        { key: 'unit', label: 'Eenheid', width: 20, align: 'left' as const },
      ];

  let y = margin;

  const drawHeader = (): void => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(title, margin, y);

    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Datum: ${toDutchDate(meta?.createdAt)}`, margin, y);
    if (offerteNummer) {
      doc.text(`Offerte: #${offerteNummer}`, pageWidth - margin, y, { align: 'right' });
    }

    y += 5;
    if (klantNaam) {
      doc.text(`Project klant: ${klantNaam}`, margin, y);
      y += 5;
    } else {
      y += 1;
    }

    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y, pageWidth - margin, y);
    y += 3;

    const headerHeight = 6.5;
    let x = margin;
    doc.setFillColor(246, 246, 246);
    doc.setDrawColor(215, 215, 215);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);

    columns.forEach((column) => {
      doc.rect(x, y, column.width, headerHeight, 'FD');
      const textY = y + 4.3;
      if (column.align === 'right') {
        doc.text(column.label, x + column.width - textPaddingX, textY, { align: 'right' });
      } else if (column.align === 'center') {
        doc.text(column.label, x + column.width / 2, textY, { align: 'center' });
      } else {
        doc.text(column.label, x + textPaddingX, textY);
      }
      x += column.width;
    });

    y += headerHeight;
  };

  const ensureSpace = (neededHeight: number): void => {
    if (y + neededHeight <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
    drawHeader();
  };

  drawHeader();

  if (!items.length) {
    ensureSpace(12);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.text('Geen materialen geselecteerd.', margin, y + 8);
    return doc.output('blob');
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  items.forEach((item, index) => {
    const materialLines = doc.splitTextToSize(item.naam || '-', columns.find((c) => c.key === 'name')!.width - textPaddingX * 2);
    const sourceLines = doc.splitTextToSize(item.bron || '-', columns.find((c) => c.key === 'source')!.width - textPaddingX * 2);
    const lineCount = Math.max(materialLines.length, sourceLines.length, 1);
    const rowHeight = rowPaddingY * 2 + lineCount * rowLineHeight;
    ensureSpace(rowHeight);

    let x = margin;
    columns.forEach((column) => {
      doc.setDrawColor(228, 228, 228);
      doc.rect(x, y, column.width, rowHeight);

      const drawSingleText = (text: string): void => {
        const textY = y + rowPaddingY + rowLineHeight - 0.8;
        if (column.align === 'right') {
          doc.text(text, x + column.width - textPaddingX, textY, { align: 'right' });
        } else if (column.align === 'center') {
          doc.text(text, x + column.width / 2, textY, { align: 'center' });
        } else {
          doc.text(text, x + textPaddingX, textY);
        }
      };

      if (column.key === 'index') {
        drawSingleText(String(index + 1));
      } else if (column.key === 'name') {
        materialLines.forEach((line: string, lineIndex: number) => {
          doc.text(line, x + textPaddingX, y + rowPaddingY + rowLineHeight * (lineIndex + 1) - 0.8);
        });
      } else if (column.key === 'source') {
        sourceLines.forEach((line: string, lineIndex: number) => {
          doc.text(line, x + textPaddingX, y + rowPaddingY + rowLineHeight * (lineIndex + 1) - 0.8);
        });
      } else if (column.key === 'amount') {
        drawSingleText(String(clampToPositiveInteger(item.aantal)));
      } else if (column.key === 'unit') {
        drawSingleText(safeString(item.eenheid) || 'stuk');
      } else if (column.key === 'price') {
        drawSingleText(formatMaterialListCurrency(item.prijsExclBtw));
      }

      x += column.width;
    });

    y += rowHeight;
  });

  return doc.output('blob');
}
