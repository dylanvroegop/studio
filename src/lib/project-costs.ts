export const PROJECT_COST_CATEGORIES = [
  'materiaal',
  'brandstof',
  'gereedschap',
  'eigen_verbruik',
  'hotel',
  'telefoon',
  'leadkosten',
  'overig',
] as const;

export type ProjectCostCategory = (typeof PROJECT_COST_CATEGORIES)[number];

export interface ProjectCostLineItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  total_incl_btw?: number;
  /** Optional per-line VAT rate for mixed-rate invoices, such as VAT-free deposits. */
  btw_percentage?: number;
  category?: ProjectCostCategory;
  offerte_id?: string | null;
}

export interface ProjectCostReceiptFile {
  url: string;
  path: string | null;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface ProjectCostRow {
  id: string;
  user_id: string;
  offerte_id: string | null;
  category: ProjectCostCategory;
  supplier_name: string;
  description: string;
  line_items: ProjectCostLineItem[];
  amount_excl_btw: number;
  btw_percentage: number;
  btw_amount: number;
  amount_incl_btw: number;
  date: string;
  receipt_url: string | null;
  receipt_files: ProjectCostReceiptFile[];
  status: string;
  created_at: string;
  updated_at: string;
}

export const PROJECT_COST_CATEGORY_LABELS: Record<ProjectCostCategory, string> = {
  materiaal: 'Materiaal',
  brandstof: 'Autokosten',
  gereedschap: 'Gereedschap',
  eigen_verbruik: 'Eigen verbruik',
  hotel: 'Hotel',
  telefoon: 'Telefoon',
  leadkosten: 'Leadkosten',
  overig: 'Overig',
};

function safeNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function roundEuro(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function normalizeProjectCostCategory(value: unknown): ProjectCostCategory {
  const normalized = safeString(value).toLowerCase();
  if (normalized === 'materiaal') return 'materiaal';
  if (normalized === 'brandstof' || normalized === 'autokosten' || normalized === 'auto kosten') return 'brandstof';
  if (normalized === 'gereedschap') return 'gereedschap';
  if (normalized === 'eigen_verbruik' || normalized === 'eigen verbruik') return 'eigen_verbruik';
  if (normalized === 'hotel' || normalized === 'overnachting') return 'hotel';
  if (normalized === 'telefoon' || normalized === 'phone') return 'telefoon';
  if (normalized === 'leadkosten' || normalized === 'lead kosten' || normalized === 'lead cost') return 'leadkosten';
  return 'overig';
}

export function normalizeProjectCostLineItem(input: unknown): ProjectCostLineItem {
  const row = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  // Credit notes use negative quantities/totals; do not coerce them to zero.
  const quantity = safeNumber(row.quantity);
  const unitPrice = safeNumber(row.unit_price);
  const explicitTotal = safeNumber(row.total_price);
  const explicitTotalIncl = safeNumber(row.total_incl_btw);
  const rawBtwPercentage = row.btw_percentage ?? row.vat_percentage;
  const hasExplicitBtwPercentage =
    rawBtwPercentage !== undefined
    && rawBtwPercentage !== null
    && String(rawBtwPercentage).trim() !== ''
    && Number.isFinite(Number(rawBtwPercentage));
  const totalPrice = roundEuro(explicitTotal !== 0 ? explicitTotal : quantity * unitPrice);
  const rawCategory = safeString(row.category);
  const category = rawCategory ? normalizeProjectCostCategory(rawCategory) : undefined;
  const offerteId = safeString(row.offerte_id ?? row.offerteId) || null;

  return {
    description: safeString(row.description),
    quantity,
    unit: safeString(row.unit) || 'st',
    unit_price: roundEuro(unitPrice),
    total_price: totalPrice,
    ...(explicitTotalIncl !== 0 ? { total_incl_btw: roundEuro(explicitTotalIncl) } : {}),
    ...(hasExplicitBtwPercentage ? { btw_percentage: roundEuro(Number(rawBtwPercentage)) } : {}),
    category,
    offerte_id: offerteId,
  };
}

export function normalizeProjectCostLineItems(input: unknown): ProjectCostLineItem[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => normalizeProjectCostLineItem(item))
    .filter((item) => item.description || item.total_price !== 0 || item.quantity !== 0);
}

function fallbackReceiptFileFromUrl(receiptUrl: string | null): ProjectCostReceiptFile[] {
  const url = safeString(receiptUrl);
  if (!url) return [];
  const filename = url.split('/').pop() || 'bon';
  return [
    {
      url,
      path: null,
      filename,
      content_type: '',
      size_bytes: 0,
      uploaded_at: '',
    },
  ];
}

export function normalizeProjectCostReceiptFiles(input: unknown, fallbackUrl?: string | null): ProjectCostReceiptFile[] {
  if (!Array.isArray(input)) {
    return fallbackReceiptFileFromUrl(fallbackUrl || null);
  }

  const files = input
    .map((raw): ProjectCostReceiptFile | null => {
      const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      const url = safeString(item.url);
      if (!url) return null;
      const filename = safeString(item.filename) || url.split('/').pop() || 'bon';
      return {
        url,
        path: safeString(item.path) || null,
        filename,
        content_type: safeString(item.content_type),
        size_bytes: Math.max(0, Math.round(safeNumber(item.size_bytes))),
        uploaded_at: safeString(item.uploaded_at),
      };
    })
    .filter((item): item is ProjectCostReceiptFile => Boolean(item));

  if (files.length > 0) return files;
  return fallbackReceiptFileFromUrl(fallbackUrl || null);
}

export function sumProjectCostLineItems(items: ProjectCostLineItem[]): number {
  return roundEuro(items.reduce((sum, item) => sum + safeNumber(item.total_price), 0));
}

export function inferProjectCostCategory(params: {
  supplierName?: string;
  description?: string;
  lineItems?: ProjectCostLineItem[];
}): ProjectCostCategory {
  const supplier = safeString(params.supplierName).toLowerCase();
  const description = safeString(params.description).toLowerCase();
  const lines =
    (params.lineItems || [])
      .map((item) => `${safeString(item.description)} ${safeString(item.unit)}`.toLowerCase())
      .join(' ')
      .trim() || '';

  const target = `${supplier} ${description} ${lines}`;

  const containsAny = (needles: string[]) => needles.some((needle) => target.includes(needle));

  if (
    containsAny([
      'boete',
      'bekeuring',
      'verkeersovertreding',
      'snelheidsovertreding',
      'naheffingsaanslag parkeren',
      'cjib',
    ])
  ) {
    return 'overig';
  }

  if (containsAny(['hotel', 'overnachting', 'accommodatie', 'logies'])) {
    return 'hotel';
  }

  if (containsAny(['kpn', 'telefoon', 'mobiel', 'telecom', 'belbundel'])) {
    return 'telefoon';
  }

  if (containsAny(['leadkosten', 'lead kosten', 'lead cost', 'leadkosten'])) {
    return 'leadkosten';
  }

  if (containsAny(['uitvulplaat', 'reinigingsdoekjes', 'reinigings doekjes'])) {
    return 'gereedschap';
  }

  if (containsAny(['tijdelijke toeslag transportkosten'])) {
    return 'materiaal';
  }

  if (containsAny(['brandstof toeslag', 'brandstofkosten'])) {
    return 'materiaal';
  }

  if (
    containsAny([
      'shell',
      'bp',
      'esso',
      'total',
      'tango',
      'q8',
      'avia',
      'texaco',
      'tankstation',
      'diesel',
      'benzine',
      'brandstof',
      'tinq',
    ])
  ) {
    return 'brandstof';
  }

  if (
    containsAny([
      'toolstation',
      'hilti',
      'wurth',
      'wurth',
      'makita',
      'festool',
      'bosch',
      'gereedschap',
      'boor',
      'zaag',
      'schroefmachine',
    ])
  ) {
    return 'gereedschap';
  }

  if (
    containsAny([
      'houthandel',
      'bouwmaat',
      'gamma',
      'praxis',
      'karwei',
      'pontmeyer',
      'bouwmaterial',
      'isolatie',
      'hout',
      'gips',
      'materiaal',
      'multiplex',
      'schroef',
    ])
  ) {
    return 'materiaal';
  }

  return 'overig';
}

export function extractOfferteReference(raw: unknown): string | null {
  const value = safeString(raw);
  if (!value) return null;

  const numberMatch = value.match(/(?:offerte(?:nummer|nr)?|referentie|reference|ref|memo|project(?:nummer|nr)?|werk(?:nummer|nr)?)\s*(?:nummer|nr\.?|no\.?)?\s*[:=#-]?\s*(\d{3,8})/i);
  if (numberMatch?.[1]) {
    return numberMatch[1];
  }

  const standaloneNumber = value.match(/^#?\s*(\d{3,8})\s*$/);
  return standaloneNumber?.[1] || null;
}

type OfferteReferenceCandidate = {
  value: string;
  score: number;
  order: number;
};

const POSITIVE_REFERENCE_LABEL = /(?:offerte(?:nummer|nr)?|offerte\s*#?|referentie|reference|ref|memo|project(?:nummer|nr)?|werk(?:nummer|nr)?|uw\s+(?:referentie|kenmerk)|klant(?:referentie|kenmerk))/i;
const NEGATIVE_REFERENCE_LABEL = /(?:factuur|invoice|debiteur|debtor|order(?:nummer|nr)?|bestel(?:nummer|nr)?|artikel|barcode|poi|terminal|merchant|transaction|transactie|period|periode|iban|btw|datum|date|telefoon|postcode)/i;

function normalizeReferenceCandidate(value: unknown): string | null {
  const text = safeString(value);
  if (!text) return null;

  const standalone = text.match(/^#?\s*(\d{3,8})\s*$/);
  if (standalone?.[1]) return standalone[1];

  return extractOfferteReference(text);
}

/**
 * Resolves a quote number from the complete AI extraction payload.
 *
 * Invoice formats differ widely. In particular, Bouwmaat prints the quote
 * number as `Memo: 260313`, while other suppliers use `Referentie`,
 * `Offertenr.`, `Uw kenmerk`, or `Projectnummer`. We prefer these labelled
 * values and only use an unlabelled six-digit value when it is unambiguous.
 */
export function extractOfferteReferenceFromExtraction(raw: unknown): string | null {
  const candidates: OfferteReferenceCandidate[] = [];
  let order = 0;

  const addCandidate = (value: unknown, score: number): void => {
    const normalized = normalizeReferenceCandidate(value);
    if (!normalized) return;
    candidates.push({ value: normalized, score, order: order++ });
  };

  const addLabeledTextCandidates = (value: string, path: string): void => {
    const labeledPattern = /(?:offerte(?:nummer|nr)?|referentie|reference|ref|memo|project(?:nummer|nr)?|werk(?:nummer|nr)?|uw\s+(?:referentie|kenmerk)|klant(?:referentie|kenmerk))\s*(?:nummer|nr\.?|no\.?)?\s*[:=#-]?\s*(\d{3,8})/gi;
    let match: RegExpExecArray | null;
    while ((match = labeledPattern.exec(value)) !== null) {
      addCandidate(match[1], 100);
    }

    // A six-digit quote number is useful as a fallback, but not when it
    // appears in a known invoice/line-item field where false positives are
    // common (invoice numbers, article numbers, dates, and totals).
    if (!POSITIVE_REFERENCE_LABEL.test(value) && !NEGATIVE_REFERENCE_LABEL.test(path)) {
      const unlabelledNumbers = value.match(/\b\d{6}\b/g) || [];
      unlabelledNumbers.forEach((number) => addCandidate(number, 10));
    }
  };

  const walk = (value: unknown, path: string, depth: number): void => {
    if (depth > 8 || value === null || value === undefined) return;

    if (typeof value === 'string') {
      addLabeledTextCandidates(value, path);
      const key = path.split('.').pop() || '';
      if (POSITIVE_REFERENCE_LABEL.test(key)) addCandidate(value, 90);
      return;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      const key = path.split('.').pop() || '';
      if (POSITIVE_REFERENCE_LABEL.test(key)) addCandidate(String(value), 90);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
      return;
    }

    if (typeof value !== 'object') return;

    const row = value as Record<string, unknown>;
    const label = safeString(row.label ?? row.name ?? row.key ?? row.type);
    const labelledValue = row.value ?? row.number ?? row.reference ?? row.offerte_reference;
    if (label && POSITIVE_REFERENCE_LABEL.test(label) && labelledValue !== undefined) {
      addCandidate(labelledValue, 100);
    }

    Object.entries(row).forEach(([key, item]) => {
      walk(item, path ? `${path}.${key}` : key, depth + 1);
    });
  };

  walk(raw, '', 0);

  const best = candidates
    .filter((candidate) => !NEGATIVE_REFERENCE_LABEL.test(candidate.value))
    .sort((left, right) => right.score - left.score || left.order - right.order)[0];
  if (best) return best.value;

  return null;
}

export function mapProjectCostRow(input: unknown): ProjectCostRow {
  const row = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const lineItems = normalizeProjectCostLineItems(row.line_items);
  const amountExcl = roundEuro(safeNumber(row.amount_excl_btw));
  const btwPercentage = roundEuro(safeNumber(row.btw_percentage) || 21);
  const btwAmount = roundEuro(safeNumber(row.btw_amount));
  const amountIncl = roundEuro(safeNumber(row.amount_incl_btw));
  const receiptUrl = safeString(row.receipt_url) || null;
  const receiptFiles = normalizeProjectCostReceiptFiles(row.receipt_files, receiptUrl);

  return {
    id: safeString(row.id),
    user_id: safeString(row.user_id),
    offerte_id: safeString(row.offerte_id) || null,
    category: normalizeProjectCostCategory(row.category),
    supplier_name: safeString(row.supplier_name),
    description: safeString(row.description),
    line_items: lineItems,
    amount_excl_btw: amountExcl,
    btw_percentage: btwPercentage,
    btw_amount: btwAmount,
    amount_incl_btw: amountIncl,
    date: safeString(row.date),
    receipt_url: receiptUrl,
    receipt_files: receiptFiles,
    status: safeString(row.status) || 'confirmed',
    created_at: safeString(row.created_at),
    updated_at: safeString(row.updated_at),
  };
}
