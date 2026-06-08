import type { Firestore, Timestamp } from 'firebase/firestore';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export type MaterialListStatus = 'draft' | 'active' | 'completed' | 'archived';

export interface MaterialList {
  id: string;
  company_id: string;
  userId: string;
  quote_id: string | null;
  quote_number?: number | string | null;
  quote_client_name?: string | null;
  title: string;
  notes: string;
  status: MaterialListStatus;
  created_at: Timestamp | Date | string;
  updated_at: Timestamp | Date | string;
  created_by: string;
  item_count?: number;
}

export interface MaterialListItem {
  id: string;
  material_list_id: string;
  product_name: string;
  quantity: number;
  unit: string;
  supplier: string;
  category: string;
  checked: boolean;
  notes: string;
  sort_order: number;
  created_at: Timestamp | Date | string;
}

export interface ParsedMaterialLine {
  quantity: number;
  unit: string;
  product_name: string;
  supplier?: string;
  category?: string;
  notes?: string;
}

export interface QuoteLinkSnapshot {
  id: string;
  quote_number?: number | string | null;
  quote_client_name?: string | null;
}

export const MATERIAL_LIST_STATUS_LABELS: Record<MaterialListStatus, string> = {
  draft: 'Concept',
  active: 'Actief',
  completed: 'Compleet',
  archived: 'Archief',
};

export function parseMaterialQuickAdd(input: string): ParsedMaterialLine | null {
  const raw = input.trim().replace(/\s+/g, ' ');
  if (!raw) return null;

  const compactMatch = raw.match(/^(\d+(?:[,.]\d+)?)\s*x\s+(.+)$/i);
  if (compactMatch) {
    return {
      quantity: Number(compactMatch[1].replace(',', '.')),
      unit: 'st',
      product_name: compactMatch[2].trim(),
    };
  }

  const unitMatch = raw.match(/^(\d+(?:[,.]\d+)?)\s+([a-zA-Z]+)\s+(.+)$/);
  if (unitMatch) {
    return {
      quantity: Number(unitMatch[1].replace(',', '.')),
      unit: unitMatch[2].trim(),
      product_name: unitMatch[3].trim(),
    };
  }

  const numberMatch = raw.match(/^(\d+(?:[,.]\d+)?)\s+(.+)$/);
  if (numberMatch) {
    return {
      quantity: Number(numberMatch[1].replace(',', '.')),
      unit: 'st',
      product_name: numberMatch[2].trim(),
    };
  }

  return {
    quantity: 1,
    unit: 'st',
    product_name: raw,
  };
}

const KNOWN_UNITS = new Set([
  'st',
  'stuk',
  'stuks',
  'plaat',
  'platen',
  'pak',
  'pakken',
  'zak',
  'zakken',
  'rol',
  'rollen',
  'bus',
  'bussen',
  'tube',
  'tubes',
  'emmer',
  'emmers',
  'doos',
  'dozen',
  'm',
  'meter',
  'm1',
  'm2',
  'm3',
  'kg',
  'liter',
  'ltr',
  'l',
]);

function normalizeParsedUnit(value: string): string {
  const unit = value.trim().toLowerCase();
  const map: Record<string, string> = {
    stuk: 'st',
    stuks: 'st',
    plaat: 'st',
    platen: 'st',
    pakken: 'pak',
    zakken: 'zak',
    rollen: 'rol',
    bussen: 'bus',
    tubes: 'tube',
    emmers: 'emmer',
    dozen: 'doos',
    meter: 'm',
    ltr: 'l',
    liter: 'l',
  };
  return map[unit] || unit || 'st';
}

function splitMessyMaterialInput(input: string): string[] {
  return input
    .replace(/\r/g, '\n')
    .split(/\n|;|\s+\+\s+|\s+en\s+(?=\d)/i)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseMessyMaterialQuickAdd(input: string): ParsedMaterialLine[] {
  const rows: ParsedMaterialLine[] = [];
  const lines = splitMessyMaterialInput(input);

  lines.forEach((line) => {
    const normalized = line
      .replace(/\b(ik\s+heb\s+nodig|heb\s+nodig|bestel|meenemen|pak|haal|nodig)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return;

    const matches = Array.from(normalized.matchAll(/(\d+(?:[,.]\d+)?)\s*(?:x|×)?\s*([^\d]+?)(?=(?:\s+\d+(?:[,.]\d+)?\s*(?:x|×)?\s*[^\d])|$)/gi));
    if (matches.length > 1) {
      matches.forEach((match) => {
        const parsed = parseMessyMaterialQuickAdd(`${match[1]} ${match[2]}`);
        rows.push(...parsed);
      });
      return;
    }

    const match = normalized.match(/^(\d+(?:[,.]\d+)?)\s*(?:x|×)?\s*(?:(\p{L}+)\s+)?(.+)$/iu);
    if (!match) {
      rows.push({ quantity: 1, unit: 'st', product_name: normalized });
      return;
    }

    const quantity = Number(match[1].replace(',', '.'));
    const possibleUnit = (match[2] || '').trim();
    let productName = (match[3] || '').trim();
    let unit = 'st';

    if (possibleUnit && KNOWN_UNITS.has(possibleUnit.toLowerCase())) {
      unit = normalizeParsedUnit(possibleUnit);
    } else if (possibleUnit) {
      productName = `${possibleUnit} ${productName}`.trim();
    }

    rows.push({
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unit,
      product_name: productName || normalized,
    });
  });

  return rows.length > 0 ? rows : (parseMaterialQuickAdd(input) ? [parseMaterialQuickAdd(input)!] : []);
}

export async function createMaterialList(
  firestore: Firestore,
  params: {
    userId: string;
    title: string;
    notes?: string;
    quote?: QuoteLinkSnapshot | null;
    status?: MaterialListStatus;
  }
): Promise<string> {
  const docRef = await addDoc(collection(firestore, 'material_lists'), {
    company_id: params.userId,
    userId: params.userId,
    quote_id: params.quote?.id ?? null,
    quote_number: params.quote?.quote_number ?? null,
    quote_client_name: params.quote?.quote_client_name ?? null,
    title: params.title.trim(),
    notes: params.notes?.trim() ?? '',
    status: params.status ?? 'draft',
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    created_by: params.userId,
  });
  return docRef.id;
}

interface CheckboxPdfDoc {
  rect: (x: number, y: number, w: number, h: number) => void;
  setLineWidth: (width: number) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
}

function drawCheckbox(doc: CheckboxPdfDoc, x: number, y: number, checked: boolean): void {
  doc.rect(x, y - 4, 4.5, 4.5);
  if (checked) {
    doc.setLineWidth(0.7);
    doc.line(x + 0.8, y - 1.8, x + 2, y - 0.5);
    doc.line(x + 2, y - 0.5, x + 4, y - 3.4);
    doc.setLineWidth(0.2);
  }
}

export async function exportMaterialListPdf(params: {
  list: MaterialList;
  items: MaterialListItem[];
}): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  let y = 18;

  const addHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(params.list.title || 'Materiaallijst', margin, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const meta = [
      params.list.quote_number ? `Offerte #${params.list.quote_number}` : null,
      params.list.quote_client_name || null,
      MATERIAL_LIST_STATUS_LABELS[params.list.status],
    ].filter(Boolean).join('  |  ');
    if (meta) {
      doc.text(meta, margin, y);
      y += 7;
    }
    if (params.list.notes) {
      const notes = doc.splitTextToSize(params.list.notes, pageWidth - margin * 2);
      doc.text(notes, margin, y);
      y += notes.length * 5 + 3;
    }
    doc.setDrawColor(70);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;
  };

  addHeader();
  params.items.forEach((item) => {
    if (y > pageHeight - 24) {
      doc.addPage();
      y = 18;
      addHeader();
    }

    const title = `${item.quantity.toLocaleString('nl-NL')} ${item.unit || 'st'} ${item.product_name}`;
    const details = [item.supplier, item.category, item.notes].filter(Boolean).join('  |  ');
    drawCheckbox(doc, margin, y, item.checked);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const titleLines = doc.splitTextToSize(title, pageWidth - margin * 2 - 9);
    doc.text(titleLines, margin + 8, y);
    y += titleLines.length * 5.5;
    if (details) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(95);
      doc.text(doc.splitTextToSize(details, pageWidth - margin * 2 - 8), margin + 8, y);
      doc.setTextColor(0);
      y += 5;
    }
    doc.setDrawColor(220);
    doc.line(margin, y + 2, pageWidth - margin, y + 2);
    y += 8;
  });

  doc.save(`${params.list.title || 'Materiaallijst'}.pdf`);
}
