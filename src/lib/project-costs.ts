export const PROJECT_COST_CATEGORIES = [
  'materiaal',
  'brandstof',
  'gereedschap',
  'overig',
] as const;

export type ProjectCostCategory = (typeof PROJECT_COST_CATEGORIES)[number];

export interface ProjectCostLineItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
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
  status: string;
  created_at: string;
  updated_at: string;
}

export const PROJECT_COST_CATEGORY_LABELS: Record<ProjectCostCategory, string> = {
  materiaal: 'Materiaal',
  brandstof: 'Brandstof',
  gereedschap: 'Gereedschap',
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
  if (normalized === 'brandstof') return 'brandstof';
  if (normalized === 'gereedschap') return 'gereedschap';
  return 'overig';
}

export function normalizeProjectCostLineItem(input: unknown): ProjectCostLineItem {
  const row = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const quantity = Math.max(0, safeNumber(row.quantity));
  const unitPrice = Math.max(0, safeNumber(row.unit_price));
  const explicitTotal = safeNumber(row.total_price);
  const totalPrice = roundEuro(explicitTotal > 0 ? explicitTotal : quantity * unitPrice);

  return {
    description: safeString(row.description),
    quantity,
    unit: safeString(row.unit) || 'st',
    unit_price: roundEuro(unitPrice),
    total_price: totalPrice,
  };
}

export function normalizeProjectCostLineItems(input: unknown): ProjectCostLineItem[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => normalizeProjectCostLineItem(item))
    .filter((item) => item.description || item.total_price > 0 || item.quantity > 0);
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

  const numberMatch = value.match(/(?:offerte|ref|project|order)?\s*#?\s*(\d{3,})/i);
  if (numberMatch?.[1]) {
    return numberMatch[1];
  }

  return value.length >= 3 ? value : null;
}

export function mapProjectCostRow(input: unknown): ProjectCostRow {
  const row = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const lineItems = normalizeProjectCostLineItems(row.line_items);
  const amountExcl = roundEuro(safeNumber(row.amount_excl_btw));
  const btwPercentage = roundEuro(safeNumber(row.btw_percentage) || 21);
  const btwAmount = roundEuro(safeNumber(row.btw_amount));
  const amountIncl = roundEuro(safeNumber(row.amount_incl_btw));

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
    receipt_url: safeString(row.receipt_url) || null,
    status: safeString(row.status) || 'confirmed',
    created_at: safeString(row.created_at),
    updated_at: safeString(row.updated_at),
  };
}
