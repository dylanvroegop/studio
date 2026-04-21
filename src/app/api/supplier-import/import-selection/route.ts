import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPENAI_MODEL = 'gpt-5.1';
const BLOCKED_DB_COLUMNS = new Set(['row_id', 'order_id', 'created_at']);
const ALLOWED_CATEGORIES = [
  'Vuren hout',
  'Hardhout geschaafd',
  'Merantie',
  'Kozijnhout',
  'Constructieplaten',
  'Interieur Platen',
  'Exterieur platen',
  'Afwerking',
  'Laminaat',
  'Vloer-rabat-vellingdelen',
  'Deurbeslag',
  'Binnendeuren',
  'Buitendeuren',
  'Metalstud profielen',
  'Gipsplaten',
  'Stucwerk',
  'Brandwerende platen',
  'Rockpanel',
  'Trespa',
  'Isolatie',
  'Folieën',
  'Dpc',
  'Lood',
  'Loodvervanger',
  'Epdm',
  'Dakrollen',
  'Asfaltsingels',
  'Dakpannen',
  'Flexim',
  'Golfplaten',
  'Dakramen',
  'Lichtkoepels',
  'Daktoebehoren',
  'Ubbink',
  'Overig',
] as const;
const DEFAULT_SUB_CATEGORIES = ['Overig'] as const;
const SUB_CATEGORY_SOURCE_FILE = path.join(
  process.cwd(),
  'src/lib/material_list/material_category_name_test.json'
);

let cachedAllowedSubCategories: string[] | null = null;
const DEFAULT_COLUMNS = [
  'gebruikerid',
  'materiaalnaam',
  'eenheid',
  'prijs_excl_btw',
  'prijs_incl_btw',
  'categorie',
  'sub_categorie',
  'leverancier',
  'lengte',
  'breedte',
  'dikte',
  'hoogte',
  'afmeting',
  'materiaal',
  'toepassing',
  'profiel',
  'type',
  'diameter',
  'ai_extra_data',
];

type Body = {
  import_job_id?: unknown;
  selected_ids?: unknown;
};

type ScrapedRow = {
  id?: unknown;
  supplier?: unknown;
  sku?: unknown;
  name?: unknown;
  price_excl_btw?: unknown;
  price_per_unit?: unknown;
  unit?: unknown;
  stock_count?: unknown;
  product_url?: unknown;
  hoofdcategorie?: unknown;
  subcategorie?: unknown;
};

type CanonicalRow = {
  id: string;
  supplier: string;
  leverancier: string;
  sku: string;
  name: string;
  price_excl_btw: number | null;
  price_per_unit: number | null;
  unit: string;
  stock_count: number | null;
  product_url: string;
  hoofdcategorie: string;
  subcategorie: string;
};

type AiMappedRow = {
  index?: number;
  mapped?: Record<string, unknown>;
  confidence?: number;
  issues?: string[];
};

type AiMappingPayload = { rows?: AiMappedRow[] };

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function verifyFirebaseUid(request: Request): Promise<string | null> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) return null;
  const { auth } = initFirebaseAdmin();
  const decoded = await auth.verifyIdToken(token).catch(() => null);
  return decoded?.uid || null;
}

function parseSelectedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeString(entry)).filter(Boolean);
}

function mapUnit(value: string): string {
  const unit = value.toLowerCase();
  if (!unit) return 'stuk';
  if (unit.includes('m2') || unit.includes('m²')) return 'p/m2';
  if (unit.includes('m1') || unit === 'm' || unit === 'p/m') return 'p/m1';
  if (unit.includes('stuk') || unit === 'st' || unit.includes('stuks')) return 'stuk';
  if (unit.includes('set')) return 'set';
  if (unit.includes('doos')) return 'doos';
  return unit;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundToCents(value: number): number {
  return Number(value.toFixed(2));
}

function toIntOrNull(value: unknown): number | null {
  const n = toNumberOrNull(value);
  return n == null ? null : Math.round(n);
}

function normalizeSupplier(value: unknown): string {
  const supplier = normalizeString(value).toLowerCase();
  if (!supplier) return 'bouwmaat';
  return supplier;
}

function normalizeCategoryValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pickAllowedCategory(value: string): string | null {
  const candidate = normalizeString(value);
  if (!candidate) return null;
  const normalized = normalizeCategoryValue(candidate);
  if (!normalized) return null;

  for (const category of ALLOWED_CATEGORIES) {
    if (normalizeCategoryValue(category) === normalized) return category;
  }
  for (const category of ALLOWED_CATEGORIES) {
    const catNorm = normalizeCategoryValue(category);
    if (catNorm.includes(normalized) || normalized.includes(catNorm)) return category;
  }
  return null;
}

function inferCategoryFromName(name: string): string {
  const value = normalizeCategoryValue(name);

  if (value.includes('vuren')) return 'Vuren hout';
  if (value.includes('hardhout')) return 'Hardhout geschaafd';
  if (value.includes('merantie')) return 'Merantie';
  if (value.includes('kozijn')) return 'Kozijnhout';
  if (value.includes('osb') || value.includes('constructieplaat')) return 'Constructieplaten';
  if (value.includes('multiplex') || value.includes('mdf') || value.includes('underlayment')) {
    return 'Interieur Platen';
  }
  if (value.includes('betonplex') || value.includes('exterieur')) return 'Exterieur platen';
  if (value.includes('laminaat')) return 'Laminaat';
  if (value.includes('deurbeslag')) return 'Deurbeslag';
  if (value.includes('binnendeur')) return 'Binnendeuren';
  if (value.includes('buitendeur')) return 'Buitendeuren';
  if (value.includes('metalstud')) return 'Metalstud profielen';
  if (value.includes('gips')) return 'Gipsplaten';
  if (value.includes('stuc')) return 'Stucwerk';
  if (value.includes('brandwerend')) return 'Brandwerende platen';
  if (value.includes('rockpanel')) return 'Rockpanel';
  if (value.includes('trespa')) return 'Trespa';
  if (value.includes('isolat')) return 'Isolatie';
  if (value.includes('folie')) return 'Folieën';
  if (value.includes('dpc')) return 'Dpc';
  if (value.includes('loodvervanger')) return 'Loodvervanger';
  if (value.includes('lood')) return 'Lood';
  if (value.includes('epdm')) return 'Epdm';
  if (value.includes('dakrol')) return 'Dakrollen';
  if (value.includes('asfaltsingel')) return 'Asfaltsingels';
  if (value.includes('dakpan')) return 'Dakpannen';
  if (value.includes('flexim')) return 'Flexim';
  if (value.includes('golfplaat')) return 'Golfplaten';
  if (value.includes('dakraam')) return 'Dakramen';
  if (value.includes('lichtkoepel')) return 'Lichtkoepels';
  if (value.includes('daktoebehor')) return 'Daktoebehoren';
  if (value.includes('ubbink')) return 'Ubbink';

  return 'Overig';
}

async function getAllowedSubCategories(): Promise<string[]> {
  if (cachedAllowedSubCategories) return cachedAllowedSubCategories;

  try {
    const raw = await readFile(SUB_CATEGORY_SOURCE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : [];
    const set = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const sub = normalizeString((row as Record<string, unknown>).sub_categorie);
      if (sub) set.add(sub);
    }
    if (set.size === 0) {
      cachedAllowedSubCategories = [...DEFAULT_SUB_CATEGORIES];
      return cachedAllowedSubCategories;
    }
    if (!set.has('Overig')) set.add('Overig');
    cachedAllowedSubCategories = [...set];
    return cachedAllowedSubCategories;
  } catch {
    cachedAllowedSubCategories = [...DEFAULT_SUB_CATEGORIES];
    return cachedAllowedSubCategories;
  }
}

function pickAllowedSubCategory(value: string, allowed: string[]): string | null {
  const candidate = normalizeString(value);
  if (!candidate) return null;
  const normalized = normalizeCategoryValue(candidate);
  if (!normalized) return null;

  for (const item of allowed) {
    if (normalizeCategoryValue(item) === normalized) return item;
  }
  for (const item of allowed) {
    const itemNorm = normalizeCategoryValue(item);
    if (itemNorm.includes(normalized) || normalized.includes(itemNorm)) return item;
  }
  return null;
}

function inferSubCategoryFromName(name: string, allowed: string[]): string {
  const value = normalizeCategoryValue(name);
  const find = (query: string, fallback?: string) => {
    const direct = allowed.find((item) => normalizeCategoryValue(item) === normalizeCategoryValue(query));
    if (direct) return direct;
    if (fallback) {
      const contains = allowed.find((item) => normalizeCategoryValue(item).includes(normalizeCategoryValue(fallback)));
      if (contains) return contains;
    }
    return null;
  };

  if (value.includes('osb')) return find('Osb') || find('Plaat') || 'Overig';
  if (value.includes('underlayment')) return find('Underlayment') || find('Plaat') || 'Overig';
  if (value.includes('multiplex')) return find('Multiplex') || find('Plaat') || 'Overig';
  if (value.includes('mdf')) return find('Mdf') || find('Plaat') || 'Overig';
  if (value.includes('spaanplaat')) return find('Spaanplaat') || find('Plaat') || 'Overig';
  if (value.includes('vuren')) return find('Vuren') || find('Balken') || 'Overig';
  if (value.includes('meranti') || value.includes('merantie')) return find('Meranti') || find('Merantie') || 'Overig';
  if (value.includes('balk')) return find('Balken') || 'Overig';
  if (value.includes('schroef')) return find('Schroeven') || 'Overig';
  if (value.includes('nagel')) return find('Nagels') || 'Overig';
  if (value.includes('deur')) return find('Stomp') || find('Opdek') || 'Overig';
  if (value.includes('dakraam')) return find('Dakraam') || find('Velux') || 'Overig';

  return allowed.includes('Overig') ? 'Overig' : allowed[0] || 'Overig';
}

function supplierDisplayName(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Bouwmaat';
}

function normalizeScrapedRow(raw: ScrapedRow): CanonicalRow | null {
  const name = normalizeString(raw.name);
  if (!name) return null;

  const supplier = normalizeSupplier(raw.supplier);
  const unit = mapUnit(normalizeString(raw.unit));
  const priceExclRaw = toNumberOrNull(raw.price_excl_btw);
  const pricePerUnit = toNumberOrNull(raw.price_per_unit);

  return {
    id: normalizeString(raw.id),
    supplier,
    leverancier: supplierDisplayName(supplier),
    sku: normalizeString(raw.sku),
    name,
    price_excl_btw: priceExclRaw ?? pricePerUnit,
    price_per_unit: pricePerUnit,
    unit,
    stock_count: toIntOrNull(raw.stock_count),
    product_url: normalizeString(raw.product_url),
    hoofdcategorie: normalizeString(raw.hoofdcategorie),
    subcategorie: normalizeString(raw.subcategorie),
  };
}

function parseJsonLoose<T>(text: string): T | null {
  const raw = text.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || raw;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const root = payload as Record<string, unknown>;
  const outputText = root.output_text;
  if (typeof outputText === 'string' && outputText.trim()) return outputText.trim();
  const output = Array.isArray(root.output) ? root.output : [];
  const chunks: string[] = [];
  output.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const content = Array.isArray((entry as Record<string, unknown>).content)
      ? ((entry as Record<string, unknown>).content as Array<Record<string, unknown>>)
      : [];
    content.forEach((part) => {
      const text = part?.text;
      if (typeof text === 'string' && text.trim()) chunks.push(text.trim());
    });
  });
  return chunks.join('\n').trim();
}

async function getTableColumns(): Promise<Set<string>> {
  const response = await supabaseAdmin.from('main_material_list').select('*').limit(1);
  if (response.error) return new Set(DEFAULT_COLUMNS);
  const firstRow = Array.isArray(response.data) ? response.data[0] : null;
  if (!firstRow || typeof firstRow !== 'object') return new Set(DEFAULT_COLUMNS);
  return new Set(Object.keys(firstRow));
}

function parseDimensionsFromName(name: string): {
  lengte: string;
  breedte: string;
  dikte: string;
  afmeting: string;
} {
  const text = normalizeString(name);
  const regex = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?))?\s*(mm|cm|m)\b/i;
  const m = text.match(regex);
  if (!m) return { lengte: '', breedte: '', dikte: '', afmeting: '' };

  const d1 = m[1]?.replace(',', '.') || '';
  const d2 = m[2]?.replace(',', '.') || '';
  const d3 = m[3]?.replace(',', '.') || '';
  const unit = (m[4] || 'mm').toLowerCase();
  const unitSuffix = unit === 'm' ? 'm' : unit === 'cm' ? 'cm' : 'mm';
  const afmeting = [d1, d2, d3].filter(Boolean).join('x') + unitSuffix;

  if (!d3) {
    return {
      lengte: `${d1}${unitSuffix}`,
      breedte: `${d2}${unitSuffix}`,
      dikte: '',
      afmeting,
    };
  }

  const n3 = Number.parseFloat(d3);
  if (Number.isFinite(n3) && n3 <= 100) {
    // Typical plaat format: LxBxD (e.g. 2440x1220x18mm)
    return {
      lengte: `${d1}${unitSuffix}`,
      breedte: `${d2}${unitSuffix}`,
      dikte: `${d3}${unitSuffix}`,
      afmeting,
    };
  }

  // Typical balk/lat format: D x B x L (e.g. 44x69x2700mm)
  return {
    lengte: `${d3}${unitSuffix}`,
    breedte: `${d2}${unitSuffix}`,
    dikte: `${d1}${unitSuffix}`,
    afmeting,
  };
}

async function runAiMapper(
  rows: CanonicalRow[],
  tableColumns: string[],
  allowedSubCategories: string[]
): Promise<Map<number, AiMappedRow>> {
  const apiKey = normalizeString(process.env.OPENAI_API_KEY);
  if (!apiKey || rows.length === 0) return new Map();

  const payloadRows = rows.map((row, index) => ({
    index,
    materiaalnaam: row.name,
    sku: row.sku,
    leverancier: row.leverancier,
    hoofdcategorie: row.hoofdcategorie,
    subcategorie: row.subcategorie,
    eenheid: row.unit,
    prijs_excl_btw: row.price_excl_btw,
    product_url: row.product_url,
  }));

  const prompt = [
    'Je mapt scraped bouwmaterialen naar Supabase kolommen van main_material_list.',
    'Antwoord uitsluitend met JSON.',
    `Beschikbare kolommen: ${JSON.stringify(tableColumns)}`,
    `Toegestane categorie waardes (exact een hiervan): ${JSON.stringify(ALLOWED_CATEGORIES)}`,
    `Toegestane sub_categorie waardes (exact een hiervan): ${JSON.stringify(allowedSubCategories)}`,
    'Belangrijk:',
    '- materiaalnaam moet schoon zijn (geen losse (35) aantallen, geen rommel).',
    '- Vul categorie en sub_categorie logisch.',
    '- Vul lengte/breedte/dikte/hoogte/diameter/afmeting wanneer afleidbaar uit naam.',
    '- prijs_excl_btw blijft EXCL btw.',
    '- Laat onbekende velden leeg.',
    'Output:',
    '{"rows":[{"index":0,"mapped":{"materiaalnaam":"...","categorie":"...","sub_categorie":"...","lengte":"2700mm","breedte":"69mm","dikte":"44mm","afmeting":"44x69x2700mm"},"confidence":0.9,"issues":["..."]}]}',
    `Input rows: ${JSON.stringify(payloadRows)}`,
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
      input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) return new Map();
  const text = extractResponseText(json);
  if (!text) return new Map();
  const parsed = parseJsonLoose<AiMappingPayload>(text);
  if (!parsed || !Array.isArray(parsed.rows)) return new Map();

  const result = new Map<number, AiMappedRow>();
  parsed.rows.forEach((row) => {
    if (typeof row.index !== 'number' || !Number.isFinite(row.index)) return;
    result.set(row.index, row);
  });
  return result;
}

function cleanMaterialName(name: string): string {
  let value = normalizeString(name);
  value = value.replace(/\(\s*\d+\s*\)\s*$/g, '').trim();
  value = value.replace(/\s+/g, ' ').trim();
  return value;
}

function isAllowedColumn(key: string, columns: Set<string>): boolean {
  return columns.has(key) && !BLOCKED_DB_COLUMNS.has(key);
}

function setIfAllowed(
  payload: Record<string, unknown>,
  columns: Set<string>,
  key: string,
  value: unknown
) {
  if (!isAllowedColumn(key, columns)) return;
  if (value == null) return;
  if (typeof value === 'string' && !value.trim()) return;
  payload[key] = value;
}

function buildPayloadFromRow(params: {
  uid: string;
  importJobId: string;
  row: CanonicalRow;
  aiRow?: AiMappedRow;
  tableColumns: Set<string>;
  allowedSubCategories: string[];
}): { payload: Record<string, unknown> | null; issues: string[] } {
  const { uid, importJobId, row, aiRow, tableColumns, allowedSubCategories } = params;
  const mapped = aiRow?.mapped && typeof aiRow.mapped === 'object' ? aiRow.mapped : {};
  const issues = [...(Array.isArray(aiRow?.issues) ? aiRow.issues : [])].filter(
    (item): item is string => typeof item === 'string'
  );

  const mappedName = cleanMaterialName(normalizeString((mapped as Record<string, unknown>).materiaalnaam));
  const materialName = mappedName || cleanMaterialName(row.name);
  if (!materialName) issues.push('materiaalnaam ontbreekt');

  const prijsExcl = toNumberOrNull((mapped as Record<string, unknown>).prijs_excl_btw) ?? row.price_excl_btw;
  if (prijsExcl == null) issues.push('prijs_excl_btw ontbreekt');
  const prijsIncl = prijsExcl == null ? null : roundToCents(prijsExcl * 1.21);

  const mappedCategorieRaw = normalizeString((mapped as Record<string, unknown>).categorie);
  const mappedSubCategorieRaw = normalizeString((mapped as Record<string, unknown>).sub_categorie);
  const mappedEenheid = mapUnit(normalizeString((mapped as Record<string, unknown>).eenheid));
  const selectedCategory =
    pickAllowedCategory(mappedCategorieRaw) ||
    pickAllowedCategory(row.hoofdcategorie) ||
    inferCategoryFromName(materialName);
  const selectedSubCategory =
    pickAllowedSubCategory(mappedSubCategorieRaw, allowedSubCategories) ||
    pickAllowedSubCategory(row.subcategorie, allowedSubCategories) ||
    inferSubCategoryFromName(materialName, allowedSubCategories);

  const parsedDims = parseDimensionsFromName(materialName);
  const mappedLengte = normalizeString((mapped as Record<string, unknown>).lengte);
  const mappedBreedte = normalizeString((mapped as Record<string, unknown>).breedte);
  const mappedDikte = normalizeString((mapped as Record<string, unknown>).dikte);
  const mappedHoogte = normalizeString((mapped as Record<string, unknown>).hoogte);
  const mappedAfmeting = normalizeString((mapped as Record<string, unknown>).afmeting);

  const payload: Record<string, unknown> = {};
  setIfAllowed(payload, tableColumns, 'gebruikerid', uid);
  setIfAllowed(payload, tableColumns, 'materiaalnaam', materialName);
  setIfAllowed(payload, tableColumns, 'eenheid', mappedEenheid || row.unit || 'stuk');
  setIfAllowed(payload, tableColumns, 'prijs_excl_btw', prijsExcl);
  setIfAllowed(payload, tableColumns, 'prijs_incl_btw', prijsIncl);
  setIfAllowed(payload, tableColumns, 'categorie', selectedCategory);
  setIfAllowed(payload, tableColumns, 'sub_categorie', selectedSubCategory);
  setIfAllowed(payload, tableColumns, 'leverancier', row.leverancier);

  setIfAllowed(payload, tableColumns, 'lengte', mappedLengte || parsedDims.lengte);
  setIfAllowed(payload, tableColumns, 'breedte', mappedBreedte || parsedDims.breedte);
  setIfAllowed(payload, tableColumns, 'dikte', mappedDikte || parsedDims.dikte);
  setIfAllowed(payload, tableColumns, 'hoogte', mappedHoogte);
  setIfAllowed(payload, tableColumns, 'afmeting', mappedAfmeting || parsedDims.afmeting);

  // Allow AI to set extra known columns when relevant.
  Object.entries(mapped as Record<string, unknown>).forEach(([key, value]) => {
    if (!isAllowedColumn(key, tableColumns)) return;
    if (key === 'prijs_excl_btw' || key === 'prijs_incl_btw') return;
    if (key === 'materiaalnaam' || key === 'categorie' || key === 'sub_categorie') return;
    if (key === 'lengte' || key === 'breedte' || key === 'dikte' || key === 'hoogte' || key === 'afmeting')
      return;
    if (key === 'gebruikerid' || key === 'leverancier' || key === 'eenheid') return;
    setIfAllowed(payload, tableColumns, key, value);
  });

  setIfAllowed(payload, tableColumns, 'ai_extra_data', {
    source: 'supplier_import_async_ai_mapping',
    import_job_id: importJobId,
    scraped_material_id: row.id || null,
    source_supplier: row.supplier,
    source_product_id: row.sku || null,
    source_url: row.product_url || null,
    stock_count: row.stock_count,
    mapping_confidence: typeof aiRow?.confidence === 'number' ? aiRow.confidence : null,
    mapping_issues: issues,
    parsed_dimensions: parsedDims,
    selected_sub_categorie: selectedSubCategory,
    imported_at: new Date().toISOString(),
  });

  if (!materialName || prijsExcl == null) return { payload: null, issues };
  return { payload, issues };
}

export async function POST(request: Request) {
  try {
    const uid = await verifyFirebaseUid(request);
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Niet ingelogd.' }, { status: 401 });
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const body = (await request.json().catch(() => ({}))) as Body;
    const importJobId = normalizeString(body.import_job_id);
    const selectedIds = parseSelectedIds(body.selected_ids);

    if (!importJobId) {
      return NextResponse.json({ ok: false, message: 'import_job_id ontbreekt.' }, { status: 400 });
    }
    if (selectedIds.length === 0) {
      return NextResponse.json({ ok: false, message: 'Geen geselecteerde producten.' }, { status: 400 });
    }

    const jobResult = await supabaseAdmin
      .from('import_jobs')
      .select('*')
      .eq('id', importJobId)
      .eq('user_id', uid)
      .maybeSingle();

    if (jobResult.error) {
      throw new Error(jobResult.error.message || 'Kon import job niet ophalen.');
    }
    if (!jobResult.data) {
      return NextResponse.json({ ok: false, message: 'Import job niet gevonden.' }, { status: 404 });
    }

    const scrapedResult = await supabaseAdmin
      .from('scraped_materials')
      .select('*')
      .eq('user_id', uid)
      .eq('import_job_id', importJobId)
      .in('id', selectedIds);

    if (scrapedResult.error) {
      throw new Error(scrapedResult.error.message || 'Kon geselecteerde producten niet ophalen.');
    }

    const scrapedRowsRaw = Array.isArray(scrapedResult.data) ? scrapedResult.data : [];
    const scrapedRows = scrapedRowsRaw
      .map((row) => normalizeScrapedRow(row as ScrapedRow))
      .filter((row): row is CanonicalRow => Boolean(row));

    if (scrapedRows.length === 0) {
      return NextResponse.json({ ok: false, message: 'Geen geselecteerde producten gevonden.' }, { status: 400 });
    }

    const tableColumns = await getTableColumns();
    const allowedSubCategories = await getAllowedSubCategories();
    const aiMappedRows = await runAiMapper(scrapedRows, [...tableColumns], allowedSubCategories).catch(
      () => new Map<number, AiMappedRow>()
    );

    let inserted = 0;
    let updated = 0;
    const skipped: Array<{ name: string; reason: string }> = [];

    for (let index = 0; index < scrapedRows.length; index += 1) {
      const row = scrapedRows[index];
      const mapping = buildPayloadFromRow({
        uid,
        importJobId,
        row,
        aiRow: aiMappedRows.get(index),
        tableColumns,
        allowedSubCategories,
      });

      if (!mapping.payload) {
        skipped.push({ name: row.name, reason: mapping.issues.join('; ') || 'Mapping mislukt.' });
        continue;
      }

      const payload = mapping.payload;
      const name = normalizeString(payload.materiaalnaam);
      const sku = row.sku;
      let existingRowId: string | null = null;

      if (sku) {
        const existingBySku = await supabaseAdmin
          .from('main_material_list')
          .select('row_id')
          .eq('gebruikerid', uid)
          .eq('leverancier', payload.leverancier as string)
          .contains('ai_extra_data', { source_product_id: sku })
          .limit(1)
          .maybeSingle();
        if (!existingBySku.error && existingBySku.data?.row_id) {
          existingRowId = normalizeString(existingBySku.data.row_id);
        }
      }

      if (!existingRowId) {
        const existingByName = await supabaseAdmin
          .from('main_material_list')
          .select('row_id')
          .eq('gebruikerid', uid)
          .eq('materiaalnaam', name)
          .limit(1)
          .maybeSingle();
        if (!existingByName.error && existingByName.data?.row_id) {
          existingRowId = normalizeString(existingByName.data.row_id);
        }
      }

      if (existingRowId) {
        const update = await supabaseAdmin
          .from('main_material_list')
          .update(payload)
          .eq('gebruikerid', uid)
          .eq('row_id', existingRowId);
        if (update.error) {
          skipped.push({ name: row.name, reason: update.error.message || 'Update mislukt.' });
          continue;
        }
        updated += 1;
      } else {
        const insert = await supabaseAdmin.from('main_material_list').insert(payload).select('row_id').single();
        if (insert.error) {
          skipped.push({ name: row.name, reason: insert.error.message || 'Insert mislukt.' });
          continue;
        }
        inserted += 1;
      }
    }

    const deleteSelected = await supabaseAdmin
      .from('scraped_materials')
      .delete()
      .eq('user_id', uid)
      .eq('import_job_id', importJobId)
      .in('id', selectedIds);

    if (deleteSelected.error) {
      throw new Error(deleteSelected.error.message || 'Kon preview-rijen niet opschonen.');
    }

    const remainingResult = await supabaseAdmin
      .from('scraped_materials')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid)
      .eq('import_job_id', importJobId);

    if (remainingResult.error) {
      throw new Error(remainingResult.error.message || 'Kon resterende preview niet bepalen.');
    }
    const remaining = typeof remainingResult.count === 'number' ? remainingResult.count : 0;

    const jobPatch: Record<string, unknown> = {
      total_products: remaining,
      error_message: null,
    };
    if (remaining === 0) {
      jobPatch.status = 'imported';
      jobPatch.completed_at = new Date().toISOString();
    }

    const updateJob = await supabaseAdmin
      .from('import_jobs')
      .update(jobPatch)
      .eq('id', importJobId)
      .eq('user_id', uid);

    if (updateJob.error) {
      throw new Error(updateJob.error.message || 'Kon import job niet bijwerken.');
    }

    return NextResponse.json({
      ok: true,
      inserted,
      updated,
      skipped,
      remaining_preview_rows: remaining,
      import_job_id: importJobId,
      mapped_with_ai: aiMappedRows.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Importeer selectie mislukt.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
