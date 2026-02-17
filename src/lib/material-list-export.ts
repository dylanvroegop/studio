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
  senderCompanyName?: string;
  senderContactName?: string;
  senderAddress?: string;
  senderStreet?: string;
  senderHouseNumber?: string;
  senderPostalCode?: string;
  senderCity?: string;
  senderPhone?: string;
  senderKvk?: string;
  senderBtw?: string;
  createdAt?: Date;
}

interface BuildMaterialListTextOptions {
  includePrices: boolean;
  meta?: MaterialListExportMeta;
  greetingName?: string;
  includeSource?: boolean;
}

interface BuildMaterialListEmailOptions extends BuildMaterialListTextOptions {
  emailTemplate?: string;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceTemplateToken(template: string, aliases: string[], replacement: string): string {
  let out = template;
  aliases.forEach((alias) => {
    const escapedAlias = escapeRegExp(alias);
    const pattern = new RegExp(`\\{\\{\\s*${escapedAlias}\\s*\\}\\}`, 'gi');
    out = out.replace(pattern, replacement);
  });
  return out;
}

interface SenderSignatureData {
  contactName: string;
  companyName: string;
  addressLine: string;
  postalCityLine: string;
  phone: string;
  kvk: string;
  btw: string;
  signatureLines: string[];
}

function buildSenderSignatureData(meta?: MaterialListExportMeta): SenderSignatureData {
  const contactName = safeString(meta?.senderContactName);
  const companyName = safeString(meta?.senderCompanyName);
  const street = safeString(meta?.senderStreet);
  const houseNumber = safeString(meta?.senderHouseNumber);
  const addressLine = safeString(meta?.senderAddress) || [street, houseNumber].filter(Boolean).join(' ').trim();
  const postalCityLine = [safeString(meta?.senderPostalCode), safeString(meta?.senderCity)].filter(Boolean).join(' ').trim();
  const phone = safeString(meta?.senderPhone);
  const kvk = safeString(meta?.senderKvk);
  const btw = safeString(meta?.senderBtw);

  const signatureBlocks = [
    [contactName].filter(Boolean),
    [companyName, addressLine, postalCityLine].filter(Boolean),
    [
      phone ? `Tel.: ${phone}` : '',
      kvk ? `KVK nr. ${kvk}` : '',
      btw ? `BTW nr.: ${btw}` : '',
    ].filter(Boolean),
  ].filter((block) => block.length > 0);

  const signatureLines: string[] = [];
  signatureBlocks.forEach((block, index) => {
    if (index > 0) signatureLines.push('');
    signatureLines.push(...block);
  });

  return {
    contactName,
    companyName,
    addressLine,
    postalCityLine,
    phone,
    kvk,
    btw,
    signatureLines,
  };
}

interface BuildMaterialListRowsOptions {
  includePrices: boolean;
  includeSource?: boolean;
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
  const rowsText = buildMaterialListRowsText(items, {
    includePrices: options.includePrices,
    includeSource: options.includeSource,
  });
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

  return [...headerLines, rowsText].join('\n');
}

export function buildMaterialListRowsText(
  items: MaterialListExportItem[],
  options: BuildMaterialListRowsOptions,
): string {
  const includePrices = options.includePrices;
  const includeSource = options.includeSource !== false;

  if (!items.length) {
    return 'Geen materialen geselecteerd.';
  }

  const body = items.map((item, index) => {
    const aantal = clampToPositiveInteger(item.aantal);
    const eenheid = safeString(item.eenheid) || 'stuk';
    const sourcePart = includeSource ? ` | Bron: ${item.bron}` : '';
    const priceLine = includePrices
      ? ` | Prijs excl. btw: ${formatMaterialListCurrency(item.prijsExclBtw)}`
      : '';
    return `${index + 1}. ${item.naam} | Aantal: ${aantal} ${eenheid}${sourcePart}${priceLine}`;
  });

  return body.join('\n');
}

export function buildMaterialListEmailBody(
  items: MaterialListExportItem[],
  options: BuildMaterialListEmailOptions,
): string {
  const greetingName = safeString(options.greetingName);
  const introName = greetingName || 'team';
  const senderSignature = buildSenderSignatureData(options.meta);
  const listText = buildMaterialListText(items, {
    ...options,
    includeSource: false,
  });
  const listRowsText = buildMaterialListRowsText(items, {
    includePrices: options.includePrices,
    includeSource: false,
  });
  const offerteNummer = safeString(options.meta?.offerteNummer);
  const klusTitel = safeString(options.meta?.klusTitel);
  const projectKlant = safeString(options.meta?.klantNaam);
  const datum = toDutchDate(options.meta?.createdAt);
  const emailTemplate = safeString(options.emailTemplate);

  if (emailTemplate) {
    const hasListToken = /\{\{\s*(materiaallijst|material_list)\s*\}\}/i.test(emailTemplate);
    let rendered = emailTemplate;
    rendered = replaceTemplateToken(rendered, ['aanhef', 'greeting_name'], introName);
    rendered = replaceTemplateToken(rendered, ['materiaallijst', 'material_list'], listRowsText);
    rendered = replaceTemplateToken(rendered, ['offerte_nummer', 'quote_number'], offerteNummer);
    rendered = replaceTemplateToken(rendered, ['klus_titel', 'job_title'], klusTitel);
    rendered = replaceTemplateToken(rendered, ['project_klant', 'client_name'], projectKlant);
    rendered = replaceTemplateToken(rendered, ['datum', 'date'], datum);
    rendered = replaceTemplateToken(rendered, ['bedrijfsnaam', 'sender_company'], senderSignature.companyName);
    rendered = replaceTemplateToken(rendered, ['contactnaam', 'sender_contact'], senderSignature.contactName);
    rendered = replaceTemplateToken(rendered, ['adresregel', 'address_line'], senderSignature.addressLine);
    rendered = replaceTemplateToken(rendered, ['postcode_plaats', 'postal_city'], senderSignature.postalCityLine);
    rendered = replaceTemplateToken(rendered, ['telefoon', 'phone'], senderSignature.phone);
    rendered = replaceTemplateToken(rendered, ['kvk_nummer', 'kvk'], senderSignature.kvk);
    rendered = replaceTemplateToken(rendered, ['btw_nummer', 'btw'], senderSignature.btw);

    if (!hasListToken && !rendered.includes(listRowsText)) {
      rendered = `${rendered.trim()}\n\n${listRowsText}`;
    }

    return rendered.trim();
  }

  return [
    `Beste ${introName},`,
    '',
    'Hierbij sturen we onze materiaallijst.',
    'Zou u voor onderstaande materialen uw actuele prijzen (excl. btw) en verwachte levertijd met ons kunnen delen?',
    '',
    listText,
    '',
    'Met vriendelijke groet,',
    ...senderSignature.signatureLines,
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
