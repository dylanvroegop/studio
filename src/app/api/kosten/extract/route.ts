import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import {
  archiveTaxDocument,
  createTaxDocumentSignedUrl,
  toArchivedReceiptFile,
} from '@/lib/tax-document-archive';
import {
  extractOfferteReference,
  extractOfferteReferenceFromExtraction,
  inferProjectCostCategory,
  normalizeProjectCostLineItems,
  normalizeProjectCostLineItem,
  type ProjectCostCategory,
  type ProjectCostLineItem,
  roundEuro,
  sumProjectCostLineItems,
} from '@/lib/project-costs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXTRACTION_PROMPT =
  'You are an expert at extracting data from Dutch supplier invoices and receipts for construction/carpentry materials. Extract: supplier_name, date (YYYY-MM-DD), receipt_description (short Dutch summary of the entire receipt/invoice, not just one line item), line_items (array of {description, quantity, unit, unit_price, total_price, total_incl_btw, btw_percentage, category}), subtotal_excl_btw, btw_percentage, btw_amount, total_incl_btw, and any project/offerte reference number. total_price is always the EXCL. BTW line total; total_incl_btw is the exact inclusive amount for that line. Return the project/offerte number as offerte_reference and also include reference_candidates (array of {label, value, context}) when a reference is visible. Inspect the entire document, including header fields, footer fields, memos, remarks, and text close to labels. Reference labels include Offertenr., Offertenummer, Offerte, Referentie, Reference, Uw referentie, Uw kenmerk, Memo, Projectnummer, Werknummer, and Klantreferentie. On Bouwmaat documents specifically, a line such as "Memo: 260313" is the user\'s quote number and must yield offerte_reference: "260313". The number may be six digits and may be printed on the same line or immediately after the label. Never use Factuurnr./Factuurnummer, Invoice number, Debiteurnr., order/bestelnummer, artikelnummer, barcode, POI, terminal, merchant, transaction, payment, date, or totals as offerte_reference. If no labelled reference is visible, return null rather than guessing a random number. line_items.category must be exactly one of: materiaal, autokosten, gereedschap, brandstof, hotel, telefoon, leadkosten, overig. Rules: lead-generation/lead costs => leadkosten; phone/mobile/telecom/KPN invoices => telefoon; hotel stays/overnachtingen/accommodation => hotel; vehicle maintenance, repairs, insurance, road tax, parking and car washes => autokosten; the exact line "Tijdelijke toeslag transportkosten" is always materiaal; Brandstof toeslag/brandstofkosten on a Bouwmaat invoice is always materiaal; any uitvulplaat or reinigingsdoekjes is always gereedschap; fines/boetes/bekeuringen => overig; reusable tools (measuring tools, hand tools, power tools, sets, holders, clamps, markers/pencils) => gereedschap; consumables and build inputs (screws, plugs, glue, sealant, tape, wood, plates, profiles, sanding discs, etc.) => materiaal; fuel/charging products => brandstof. Deposit/pallet charge lines (statiegeld, emballage, borg, palletborg) are real material costs: never omit them or replace them with a zero-valued placeholder. They are usually 0% VAT, so include them in subtotal_excl_btw and total_incl_btw with btw_percentage: 0 and total_incl_btw equal to total_price. Important: keep subtotal_excl_btw and total_incl_btw fiscally correct. Read explicitly printed invoice totals before inferring values. Always validate total_incl_btw = subtotal_excl_btw + btw_amount. Credit notes (creditfacturen) must retain their negative signs: return negative quantities, line totals, subtotal, VAT amount, and total exactly as printed; never convert them to zero or positive values. Invoices can contain multiple VAT rates or VAT-exempt/onbelast amounts; never apply the printed 21% rate to the entire subtotal in that case. For example, if the document prints total €139.13 and VAT €2.63, subtotal_excl_btw must be €136.50. If the receipt shows retail prices (often VAT-included), still return the correct EXCL subtotal from the VAT breakdown. Critical validation: when quantity * unit_price does not match a printed (possibly discounted) line total or receipt total, prefer the discounted/printed totals and set total_price accordingly. Return ONLY valid JSON, no markdown.';

const REFERENCE_ONLY_PROMPT =
  'Inspect this Dutch invoice or receipt only for the customer\'s project/offerte number. Return ONLY valid JSON with {"offerte_reference": string|null, "reference_candidates": [{"label": string, "value": string, "context": string}]}. Inspect all visible text, including headers, footers, memo/remark fields, and labels near numbers. Valid labels include Offertenr., Offertenummer, Offerte, Referentie, Reference, Uw referentie, Uw kenmerk, Memo, Projectnummer, Werknummer, and Klantreferentie. On Bouwmaat invoices, "Memo: 260313" means offerte_reference "260313". Match a number on the same line or immediately following the label. Do NOT return Factuurnr./Factuurnummer, invoice number, Debiteurnr., order/bestelnummer, artikelnummer, barcode, POI, terminal, merchant, transaction, payment, date, VAT, or total numbers. If no labelled project/offerte reference is visible, return null. Do not guess.';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function resolveAutomationUid(
  request: Request,
  formData: FormData
): string | null {
  const expectedSecret = safeString(process.env.N8N_HEADER_SECRET);
  if (!expectedSecret) return null;

  const providedSecret = safeString(request.headers.get('x-offertehulp-secret'));
  if (!providedSecret || providedSecret !== expectedSecret) return null;

  const uidFromForm = safeString(formData.get('user_id'));
  if (uidFromForm) return uidFromForm;

  const uidFromHeader = safeString(request.headers.get('x-offertehulp-user-id'));
  return uidFromHeader || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function safePercentage(value: unknown): number {
  const numeric = roundEuro(safeNumber(value));
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, numeric));
}

function readPathValue(source: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = source;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function pickFirstNonZeroNumber(source: Record<string, unknown>, paths: string[]): number {
  for (const path of paths) {
    const value = roundEuro(safeNumber(readPathValue(source, path)));
    if (value !== 0) return value;
  }
  return 0;
}

function nearlyEqual(left: number, right: number, tolerance = 0.05): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= tolerance;
}

async function resolveOfferteIdFromReference(reference: string | null, uid: string): Promise<string | null> {
  const normalizedReference = safeString(reference);
  const extractedNumber = normalizedReference.match(/\d{2,}/)?.[0] || '';
  if (!extractedNumber) return null;

  const quoteNumber = Number(extractedNumber);
  if (!Number.isFinite(quoteNumber)) return null;

  const { firestore } = initFirebaseAdmin();
  for (const candidate of [quoteNumber, String(quoteNumber)]) {
    const snapshot = await firestore
      .collection('quotes')
      .where('userId', '==', uid)
      .where('offerteNummer', '==', candidate)
      .limit(1)
      .get();
    if (!snapshot.empty) return snapshot.docs[0].id;
  }

  return null;
}

function euroToCents(value: number): number {
  return Math.round(roundEuro(value) * 100);
}

function centsToEuro(value: number): number {
  return roundEuro(value / 100);
}

function rebalanceLineItemsToTargetSubtotal(
  items: ProjectCostLineItem[],
  targetSubtotalExcl: number
): ProjectCostLineItem[] {
  if (items.length === 0) return items;
  const targetCents = euroToCents(targetSubtotalExcl);
  if (targetCents === 0) return items;

  const working = items.map((item) => {
    const quantity = safeNumber(item.quantity);
    const unitCents = Math.round(roundEuro(safeNumber(item.unit_price)) * 100);
    const totalCents = euroToCents(roundEuro((unitCents / 100) * quantity));
    return {
      item,
      quantity,
      unitCents,
      totalCents,
    };
  });

  const sumCents = (): number => working.reduce((sum, line) => sum + line.totalCents, 0);
  let diff = targetCents - sumCents();
  if (diff === 0) {
    return working.map((line) =>
      normalizeProjectCostLineItem({
        ...line.item,
        unit_price: centsToEuro(line.unitCents),
        total_price: centsToEuro(line.totalCents),
      })
    );
  }

  const maxIterations = 2000;
  let iteration = 0;

  while (diff !== 0 && iteration < maxIterations) {
    iteration += 1;
    const direction = diff > 0 ? 1 : -1;
    let bestIndex = -1;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (let index = 0; index < working.length; index += 1) {
      const line = working[index];
      const nextUnitCents = line.unitCents + direction;
      if (nextUnitCents < 0) continue;

      const nextTotalCents = euroToCents(roundEuro((nextUnitCents / 100) * line.quantity));
      const delta = nextTotalCents - line.totalCents;
      if (delta === 0) continue;
      if (Math.sign(delta) !== Math.sign(diff)) continue;
      if (Math.abs(delta) > Math.abs(diff)) continue;

      const absDelta = Math.abs(delta);
      if (absDelta < bestDelta) {
        bestDelta = absDelta;
        bestIndex = index;
      }
    }

    if (bestIndex < 0) break;

    const selected = working[bestIndex];
    const nextUnitCents = selected.unitCents + direction;
    const nextTotalCents = euroToCents(roundEuro((nextUnitCents / 100) * selected.quantity));
    const delta = nextTotalCents - selected.totalCents;
    if (delta === 0) break;

    selected.unitCents = nextUnitCents;
    selected.totalCents = nextTotalCents;
    diff -= delta;
  }

  return working.map((line) =>
    normalizeProjectCostLineItem({
      ...line.item,
      unit_price: centsToEuro(line.unitCents),
      total_price: centsToEuro(line.totalCents),
    })
  );
}

function convertLineItemsFromInclToExcl(
  items: ProjectCostLineItem[],
  btwPercentage: number
): ProjectCostLineItem[] {
  const rate = Math.max(0, safeNumber(btwPercentage));
  const factor = 1 + rate / 100;
  if (factor <= 0) return items;

  return items.map((item) => {
    const quantity = safeNumber(item.quantity);
    const totalIncl = safeNumber(item.total_price);
    const unitIncl = safeNumber(item.unit_price);
    const totalExcl = roundEuro(totalIncl / factor);
    const unitExcl = quantity !== 0
      ? roundEuro(totalExcl / quantity)
      : roundEuro(unitIncl / factor);

    return normalizeProjectCostLineItem({
      description: safeString(item.description),
      quantity,
      unit: safeString(item.unit) || 'st',
      unit_price: unitExcl,
      total_price: totalExcl,
    });
  });
}

function inferLineItemCategory(description: string): 'materiaal' | 'autokosten' | 'boetes' | 'schulden' | 'afval' | 'gereedschap' | 'brandstof' | 'hotel' | 'telefoon' | 'leadkosten' | 'overig' {
  const target = safeString(description).toLowerCase();
  if (!target) return 'materiaal';

  const containsAny = (needles: string[]) => needles.some((needle) => target.includes(needle));

  const scoreContainsAny = (needles: string[], weight = 1): number =>
    needles.reduce((score, needle) => (target.includes(needle) ? score + weight : score), 0);

  if (containsAny(['schuld', 'schuldaflossing', 'aflossing lening', 'leningaflossing', 'crediteur'])) {
    return 'schulden';
  }

  if (containsAny(['afvoerbon', 'afvalstort', 'afvalstroom', 'afvalverwerking', 'bouw- en sloopafval', 'afval/afvoer', 'stortkosten', 'containerafvoer', 'puinafvoer'])) {
    return 'afval';
  }

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
    return 'boetes';
  }

  if (containsAny(['hotel', 'overnachting', 'accommodatie', 'logies'])) {
    return 'hotel';
  }

  if (containsAny(['kpn', 'telefoon', 'mobiel', 'telecom', 'belbundel'])) {
    return 'telefoon';
  }

  if (containsAny(['leadkosten', 'lead kosten', 'lead cost', 'lead generation'])) {
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
      'autogarage',
      'garagebedrijf',
      'apk',
      'autoverzekering',
      'wegenbelasting',
      'motorrijtuigenbelasting',
      'parkeerkosten',
      'parkeren',
      'bandenservice',
      'autoband',
      'auto onderhoud',
      'autoreparatie',
      'carwash',
      'wasstraat',
    ])
  ) {
    return 'autokosten';
  }

  if (
    containsAny([
      'diesel',
      'benzine',
      'brandstof',
      'adblue',
      'lpg',
      'elektrisch laden',
      'laadpas',
    ])
  ) {
    return 'brandstof';
  }

  const gereedschapStrong = scoreContainsAny([
    'gereedschap',
    'hamer',
    'zaag',
    'boor',
    'schroevendraaier',
    'schroefmachine',
    'multitool',
    'beitel',
    'rolbandmaat',
    'rolmaat',
    'meetlint',
    'plooimeter',
    'stanley',
    'accu',
    'laser',
    'tang',
    'waterpas',
    'koffer',
    'bitset',
    'boorset',
    'bithouder',
    'bittset',
    'set ',
    ' set',
    'lijmklem',
    'klem',
    'glas pen',
    'glaspen',
    'marker',
    'potlood',
    'afbreekmes',
    'stanleymes',
    'mes',
    'kniptang',
    'combitang',
    'ratel',
  ], 2);

  const gereedschapWeak = scoreContainsAny([
    'houder',
    'tool',
    'meter',
    'meet',
    'pen',
  ]);

  const materiaalStrong = scoreContainsAny([
    'schroef',
    'plug',
    'kit',
    'lijm',
    'silicon',
    'acrylaat',
    'tape',
    'folie',
    'hout',
    'plank',
    'lat',
    'plaat',
    'gips',
    'isolatie',
    'profiel',
    'rail',
    'band',
    'mortel',
    'cement',
    'stuc',
    'verf',
    'lak',
    'primer',
    'spijker',
    'bout',
    'moer',
    'ring',
    'anker',
    'schuurschijf',
    'schuurpapier',
    'slijpschijf',
  ], 2);

  const materiaalWeak = scoreContainsAny([
    'pattex',
    'power fix',
    'high tack',
    'ms polymeer',
    'polymeer',
  ]);

  const gereedschapScore = gereedschapStrong + gereedschapWeak;
  const materiaalScore = materiaalStrong + materiaalWeak;

  if (gereedschapScore > materiaalScore) return 'gereedschap';
  if (materiaalScore > gereedschapScore) return 'materiaal';

  if (containsAny(['set ', ' set', 'houder', 'klem', 'meter', 'waterpas', 'pen', 'potlood'])) {
    return 'gereedschap';
  }

  if (containsAny(['schroef', 'plug', 'kit', 'lijm', 'tape', 'schijf'])) {
    return 'materiaal';
  }

  return 'materiaal';
}

function resolveLineItemCategory(
  description: string,
  extractedCategory?: ProjectCostCategory
): ProjectCostCategory {
  const inferredCategory = inferLineItemCategory(description);
  if (inferredCategory === 'boetes' || inferredCategory === 'schulden' || inferredCategory === 'afval' || inferredCategory === 'overig') return inferredCategory;
  return extractedCategory || inferredCategory;
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function normalizeComparableText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function createReceiptDescription(params: {
  extractedSummary: string;
  extractedDescription: string;
  supplierName: string;
  lineItems: Array<{ description?: string }>;
}): string {
  const explicitSummary = compactWhitespace(params.extractedSummary);
  if (explicitSummary) {
    return truncate(explicitSummary, 140);
  }

  const explicitDescription = compactWhitespace(params.extractedDescription);
  const descriptions = params.lineItems
    .map((item) => compactWhitespace(safeString(item.description)))
    .filter(Boolean);
  const uniqueDescriptions: string[] = [];
  const seen = new Set<string>();
  descriptions.forEach((description) => {
    const key = normalizeComparableText(description);
    if (!key || seen.has(key)) return;
    seen.add(key);
    uniqueDescriptions.push(description);
  });

  const firstItem = uniqueDescriptions[0] || '';
  const firstItemComparable = normalizeComparableText(firstItem);
  const explicitComparable = normalizeComparableText(explicitDescription);
  const explicitLooksLikeSingleLine =
    Boolean(explicitComparable)
    && Boolean(firstItemComparable)
    && explicitComparable === firstItemComparable
    && uniqueDescriptions.length > 1;

  if (explicitDescription && !explicitLooksLikeSingleLine) {
    return truncate(explicitDescription, 140);
  }

  if (uniqueDescriptions.length === 0) {
    if (explicitDescription) return truncate(explicitDescription, 140);
    if (params.supplierName) return `Bon ${params.supplierName}`;
    return 'Inkomende kost';
  }

  if (uniqueDescriptions.length === 1) {
    return truncate(uniqueDescriptions[0], 140);
  }

  const preview = uniqueDescriptions
    .slice(0, 3)
    .map((description) => truncate(description, 26))
    .join(', ');
  const extraCount = uniqueDescriptions.length - 3;
  const extraSuffix = extraCount > 0 ? ` +${extraCount} meer` : '';

  return truncate(`Bon met ${uniqueDescriptions.length} regels: ${preview}${extraSuffix}`, 140);
}

function normalizeDate(input: unknown): string {
  const raw = safeString(input);
  if (!raw) return new Date().toISOString().slice(0, 10);
  const datePart = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

function sanitizeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function looksLikePdf(contentType: string, filename: string): boolean {
  return contentType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
}

function looksLikeImage(contentType: string, filename: string): boolean {
  if (contentType.startsWith('image/')) return true;
  const lower = filename.toLowerCase();
  return (
    lower.endsWith('.jpg')
    || lower.endsWith('.jpeg')
    || lower.endsWith('.png')
    || lower.endsWith('.webp')
    || lower.endsWith('.heic')
    || lower.endsWith('.heif')
  );
}

function inferContentType(rawType: string, filename: string): string {
  if (rawType) return rawType;
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  return 'application/octet-stream';
}

function toImageDataUrl(contentType: string, bytes: Buffer): string {
  const type = safeString(contentType) || 'image/jpeg';
  const base64 = bytes.toString('base64');
  return `data:${type};base64,${base64}`;
}

function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const row = payload as Record<string, unknown>;

  const direct = safeString(row.output_text);
  if (direct) return direct;

  const output = Array.isArray(row.output) ? row.output : [];
  const chunks: string[] = [];
  output.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const message = entry as Record<string, unknown>;
    const content = Array.isArray(message.content) ? message.content : [];
    content.forEach((part) => {
      if (!part || typeof part !== 'object') return;
      const data = part as Record<string, unknown>;
      const text = safeString(data.text) || safeString(data.output_text);
      if (text) chunks.push(text);
    });
  });
  if (chunks.length > 0) return chunks.join('\n');

  const fallbackChoices = Array.isArray(row.choices) ? row.choices : [];
  const fallback = fallbackChoices[0];
  if (fallback && typeof fallback === 'object') {
    const message = (fallback as { message?: { content?: unknown } }).message;
    const content = safeString(message?.content);
    if (content) return content;
  }

  return '';
}

function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) return trimmed;

  return trimmed
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function parseExtractionJson(rawOutput: string): Record<string, unknown> {
  const cleaned = stripCodeFences(rawOutput);
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const firstCurly = cleaned.indexOf('{');
    const lastCurly = cleaned.lastIndexOf('}');
    if (firstCurly !== -1 && lastCurly > firstCurly) {
      const embedded = cleaned.slice(firstCurly, lastCurly + 1);
      return JSON.parse(embedded) as Record<string, unknown>;
    }
    throw new Error('OpenAI output bevat geen geldig JSON-object.');
  }
}

function hasPositiveProvidedTotal(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const row = input as Record<string, unknown>;
  const direct = safeNumber(row.total_price);
  if (direct > 0) return true;

  const aliases = [
    row.total,
    row.line_total,
    row.amount,
    row.net_amount,
    row.subtotal,
  ];

  return aliases.some((value) => safeNumber(value) !== 0);
}

async function uploadFileToOpenAi(params: {
  apiKey: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
}): Promise<string> {
  const form = new FormData();

  form.append('purpose', 'user_data');

  const arrayBuffer = params.bytes.buffer.slice(
  params.bytes.byteOffset,
  params.bytes.byteOffset + params.bytes.byteLength
) as ArrayBuffer;

const fileBlob = new Blob([arrayBuffer], {
  type: params.contentType || 'application/octet-stream',
});

  form.append('file', fileBlob, params.filename);

  const response = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: form,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      safeString((payload as { error?: { message?: unknown } }).error?.message) ||
      'OpenAI file upload mislukt.';
    throw new Error(message);
  }

  const fileId = safeString((payload as { id?: unknown }).id);

  if (!fileId) {
    throw new Error('OpenAI gaf geen file-id terug.');
  }

  return fileId;
}

async function deleteOpenAiFile(apiKey: string, fileId: string): Promise<void> {
  await fetch(`https://api.openai.com/v1/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  }).catch(() => null);
}

async function callOpenAiExtraction(params: {
  apiKey: string;
  model: string;
  prompt: string;
  imageDataUrl?: string;
  fileId?: string;
}): Promise<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [
    { type: 'input_text', text: params.prompt },
  ];

  if (params.imageDataUrl) {
    content.push({ type: 'input_image', image_url: params.imageDataUrl });
  } else if (params.fileId) {
    content.push({ type: 'input_file', file_id: params.fileId });
  } else {
    throw new Error('Geen bronbestand om te analyseren.');
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0,
      input: [
        {
          role: 'user',
          content,
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = safeString((payload as { error?: { message?: unknown } }).error?.message) || 'OpenAI analyse mislukt.';
    throw new Error(message);
  }

  const outputText = extractResponseText(payload);
  if (!outputText) {
    throw new Error('OpenAI gaf geen leesbare output terug.');
  }

  return parseExtractionJson(outputText);
}

export async function POST(request: Request) {
  let archivedFallback: {
    receiptUrl: string;
    receiptFile: ReturnType<typeof toArchivedReceiptFile>;
  } | null = null;

  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    const formData = await request.formData();
    let uid = '';
    if (token) {
      const { auth } = initFirebaseAdmin();
      const decoded = await auth.verifyIdToken(token);
      uid = decoded?.uid || '';
    } else {
      uid = resolveAutomationUid(request, formData) || '';
    }

    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const sourceFile = formData.get('file');
    if (!(sourceFile instanceof File)) {
      return NextResponse.json({ ok: false, message: 'Bestand ontbreekt.' }, { status: 400 });
    }

    const rawContentType = safeString(sourceFile.type);
    const filename = sanitizeFilename(sourceFile.name || `receipt-${Date.now()}`);
    const contentType = inferContentType(rawContentType, filename);
    const isPdf = looksLikePdf(contentType, filename);
    const isImage = looksLikeImage(contentType, filename);
    if (!isPdf && !isImage) {
      return NextResponse.json({ ok: false, message: 'Alleen PDF of afbeelding is toegestaan.' }, { status: 400 });
    }

    const bytes = Buffer.from(await sourceFile.arrayBuffer());
    const archivedRecord = await archiveTaxDocument({
      userId: uid,
      bytes,
      originalFilename: filename,
      contentType,
      source: 'manual_upload',
      metadata: {
        extraction: 'openai_receipt_extraction',
      },
    });
    const receiptUrl = await createTaxDocumentSignedUrl(archivedRecord);
    const archivedReceiptFile = toArchivedReceiptFile(archivedRecord, receiptUrl);
    archivedFallback = {
      receiptUrl,
      receiptFile: archivedReceiptFile,
    };

    const apiKey = safeString(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY ontbreekt op de server.');
    }

    const model = safeString(process.env.OPENAI_RECEIPTS_MODEL) || 'gpt-5.2';

    let parsedExtraction: Record<string, unknown>;
    if (isImage) {
      const imageDataUrl = toImageDataUrl(contentType, bytes);
      parsedExtraction = await callOpenAiExtraction({
        apiKey,
        model,
        prompt: EXTRACTION_PROMPT,
        imageDataUrl,
      });

      if (!extractOfferteReferenceFromExtraction(parsedExtraction)) {
        try {
          const referenceExtraction = await callOpenAiExtraction({
            apiKey,
            model,
            prompt: REFERENCE_ONLY_PROMPT,
            imageDataUrl,
          });
          parsedExtraction = { ...parsedExtraction, ...referenceExtraction };
        } catch (referenceError) {
          console.warn('[kosten/extract] Gerichte referentiecontrole mislukt:', referenceError);
        }
      }
    } else {
      const fileId = await uploadFileToOpenAi({
        apiKey,
        filename,
        contentType,
        bytes,
      });

      try {
        parsedExtraction = await callOpenAiExtraction({
          apiKey,
          model,
          prompt: EXTRACTION_PROMPT,
          fileId,
        });

        if (!extractOfferteReferenceFromExtraction(parsedExtraction)) {
          try {
            const referenceExtraction = await callOpenAiExtraction({
              apiKey,
              model,
              prompt: REFERENCE_ONLY_PROMPT,
              fileId,
            });
            parsedExtraction = { ...parsedExtraction, ...referenceExtraction };
          } catch (referenceError) {
            console.warn('[kosten/extract] Gerichte referentiecontrole mislukt:', referenceError);
          }
        }
      } finally {
        await deleteOpenAiFile(apiKey, fileId);
      }
    }

    const supplierName =
      safeString(parsedExtraction.supplier_name)
      || safeString(parsedExtraction.supplier)
      || safeString(parsedExtraction.vendor_name)
      || 'Onbekende leverancier';

    const rawLineItems = Array.isArray(parsedExtraction.line_items) ? parsedExtraction.line_items : [];
    const rawLineItemsFallback = Array.isArray(parsedExtraction.items) ? parsedExtraction.items : [];
    const lineItems = normalizeProjectCostLineItems(rawLineItems);
    const lineItemsFallback = normalizeProjectCostLineItems(rawLineItemsFallback);
    let normalizedLineItems = lineItems.length > 0 ? lineItems : lineItemsFallback;
    const selectedRawLineItems = lineItems.length > 0 ? rawLineItems : rawLineItemsFallback;
    const hasAnyProvidedLineTotals = selectedRawLineItems.some((item) => hasPositiveProvidedTotal(item));

    if (normalizedLineItems.length === 0) {
      const fallbackDescription = safeString(parsedExtraction.description) || 'Factuurregel';
      const fallbackSubtotal = safeNumber(parsedExtraction.subtotal_excl_btw);
      const extractedQuantity = safeNumber(parsedExtraction.quantity);
      const fallbackQuantity = extractedQuantity || (fallbackSubtotal < 0 ? -1 : 1);
      const fallbackUnitPrice = safeNumber(parsedExtraction.unit_price) || Math.abs(fallbackSubtotal);
      normalizedLineItems.push(
        normalizeProjectCostLineItem({
          description: fallbackDescription,
          quantity: fallbackQuantity,
          unit: safeString(parsedExtraction.unit) || 'st',
          unit_price: fallbackUnitPrice,
        })
      );
    }

    normalizedLineItems = normalizedLineItems.map((item) =>
      normalizeProjectCostLineItem({
        ...item,
        category: resolveLineItemCategory(item.description, item.category),
        offerte_id: item.offerte_id ?? null,
      })
    );

    const lineItemsTotalBeforeBtwFix = sumProjectCostLineItems(normalizedLineItems);

    const parsedBtwPercentage =
      safePercentage(parsedExtraction.btw_percentage)
      || safePercentage(parsedExtraction.vat_percentage)
      || safePercentage(parsedExtraction.btw)
      || 21;

    const parsedSubtotalExcl = pickFirstNonZeroNumber(parsedExtraction, [
      'subtotal_excl_btw',
      'amount_excl_btw',
      'subtotal_excl_vat',
      'subtotal_excl',
      'total_excl_btw',
      'total_excl_vat',
      'net_amount',
      'totals.subtotal_excl_btw',
      'totals.amount_excl_btw',
      'totals.subtotal_excl',
      'totals.net_amount',
    ]);

    const parsedBtwAmount = pickFirstNonZeroNumber(parsedExtraction, [
      'btw_amount',
      'vat_amount',
      'tax_amount',
      'totals.btw_amount',
      'totals.vat_amount',
      'totals.tax_amount',
      'btw_specification.total.btw',
      'btw_specification.btw',
    ]);

    const parsedTotalIncl = pickFirstNonZeroNumber(parsedExtraction, [
      'total_incl_btw',
      'amount_incl_btw',
      'total_incl_vat',
      'gross_amount',
      'grand_total',
      'amount_total',
      'total',
      'totaal',
      'te_betalen',
      'totals.total_incl_btw',
      'totals.amount_incl_btw',
      'totals.total',
      'totals.gross_amount',
      'btw_specification.total.incl',
      'btw_specification.incl',
    ]);

    let subtotalExcl = parsedSubtotalExcl;
    let btwPercentage = parsedBtwPercentage || 21;
    let btwAmount = parsedBtwAmount;
    let totalIncl = parsedTotalIncl;

    if (subtotalExcl === 0 && totalIncl !== 0 && btwAmount !== 0) {
      subtotalExcl = roundEuro(totalIncl - btwAmount);
    }
    if (subtotalExcl === 0 && totalIncl !== 0 && btwPercentage > 0) {
      subtotalExcl = roundEuro(totalIncl / (1 + btwPercentage / 100));
    }
    if (btwAmount === 0 && subtotalExcl !== 0 && totalIncl !== 0) {
      btwAmount = roundEuro(totalIncl - subtotalExcl);
    }
    if (btwAmount === 0 && subtotalExcl !== 0 && btwPercentage > 0) {
      btwAmount = roundEuro((subtotalExcl * btwPercentage) / 100);
    }
    if (totalIncl === 0 && subtotalExcl !== 0 && btwAmount !== 0) {
      totalIncl = roundEuro(subtotalExcl + btwAmount);
    }

    // Printed gross and VAT totals are more reliable than an AI-labelled subtotal.
    // This also handles mixed-rate invoices containing VAT-exempt amounts.
    if (totalIncl !== 0 && btwAmount !== 0 && Math.abs(totalIncl) >= Math.abs(btwAmount)) {
      const subtotalFromPrintedTotals = roundEuro(totalIncl - btwAmount);
      if (!nearlyEqual(subtotalExcl, subtotalFromPrintedTotals)) {
        subtotalExcl = subtotalFromPrintedTotals;
      }

      const vatAtReportedRate = roundEuro((subtotalExcl * btwPercentage) / 100);
      if (!nearlyEqual(vatAtReportedRate, btwAmount)) {
        btwPercentage = roundEuro((btwAmount / subtotalExcl) * 100);
      }
    }

    const diffToParsedIncl = parsedTotalIncl !== 0
      ? Math.abs(lineItemsTotalBeforeBtwFix - parsedTotalIncl)
      : Number.POSITIVE_INFINITY;
    const diffToParsedExcl = subtotalExcl !== 0
      ? Math.abs(lineItemsTotalBeforeBtwFix - subtotalExcl)
      : Number.POSITIVE_INFINITY;
    const lineItemsLikelyInclBtw =
      lineItemsTotalBeforeBtwFix !== 0
      && parsedTotalIncl !== 0
      && diffToParsedIncl <= 0.05
      && (
        subtotalExcl === 0
        || diffToParsedIncl + 0.01 < diffToParsedExcl
      );

    if (lineItemsLikelyInclBtw && btwPercentage > 0) {
      normalizedLineItems = convertLineItemsFromInclToExcl(normalizedLineItems, btwPercentage).map((item) =>
        normalizeProjectCostLineItem({
          ...item,
          category: resolveLineItemCategory(item.description, item.category),
          offerte_id: item.offerte_id ?? null,
        })
      );
    }

    let lineItemsTotalExcl = sumProjectCostLineItems(normalizedLineItems);
    const subtotalDiff = Math.abs(subtotalExcl - lineItemsTotalExcl);
    const shouldForceRebalanceToSubtotal =
      subtotalExcl !== 0
      && normalizedLineItems.length > 0
      && subtotalDiff > 0.001
      && (
        subtotalDiff <= 0.15
        || !hasAnyProvidedLineTotals
      );

    if (shouldForceRebalanceToSubtotal) {
      normalizedLineItems = rebalanceLineItemsToTargetSubtotal(normalizedLineItems, subtotalExcl).map((item) =>
        normalizeProjectCostLineItem({
          ...item,
          category: resolveLineItemCategory(item.description, item.category),
          offerte_id: item.offerte_id ?? null,
        })
      );
      lineItemsTotalExcl = sumProjectCostLineItems(normalizedLineItems);
    }

    if (subtotalExcl === 0) subtotalExcl = lineItemsTotalExcl;
    if (btwAmount === 0) btwAmount = roundEuro((subtotalExcl * btwPercentage) / 100);
    if (totalIncl === 0) totalIncl = roundEuro(subtotalExcl + btwAmount);

    const manualAmountOverride =
      subtotalExcl !== 0
      && lineItemsTotalExcl !== 0
      && !nearlyEqual(subtotalExcl, lineItemsTotalExcl);

    const description = createReceiptDescription({
      extractedSummary:
        safeString(parsedExtraction.receipt_description)
        || safeString(parsedExtraction.invoice_description)
        || safeString(parsedExtraction.summary),
      extractedDescription: safeString(parsedExtraction.description),
      supplierName,
      lineItems: normalizedLineItems,
    });
    const extractedDate = normalizeDate(parsedExtraction.date);

    const offerteReference = extractOfferteReferenceFromExtraction(parsedExtraction)
      || extractOfferteReference(
        parsedExtraction.offerte_reference
        || parsedExtraction.project_reference
        || parsedExtraction.reference
        || parsedExtraction.reference_number
        || parsedExtraction.offerte_nummer
      );
    const matchedOfferteId = await resolveOfferteIdFromReference(offerteReference, uid);

    const suggestedCategory = inferProjectCostCategory({
      supplierName,
      description,
      lineItems: normalizedLineItems,
    });

    return NextResponse.json({
      ok: true,
      data: {
        supplier_name: supplierName,
        description,
        line_items: normalizedLineItems,
        amount_excl_btw: subtotalExcl,
        btw_percentage: btwPercentage,
        btw_amount: btwAmount,
        amount_incl_btw: totalIncl,
        manual_amount_override: manualAmountOverride,
        date: extractedDate,
        offerte_reference: offerteReference,
        offerte_id: matchedOfferteId,
        suggested_category: suggestedCategory,
        receipt_url: receiptUrl,
        receipt_files: [archivedReceiptFile],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Extractie mislukt.';
    if (archivedFallback) {
      return NextResponse.json({
        ok: true,
        message: 'De bon is veilig opgeslagen, maar kon niet automatisch worden uitgelezen.',
        data: {
          supplier_name: '',
          description: '',
          line_items: [],
          amount_excl_btw: 0,
          btw_percentage: 21,
          btw_amount: 0,
          amount_incl_btw: 0,
          manual_amount_override: true,
          receipt_url: archivedFallback.receiptUrl,
          receipt_files: [archivedFallback.receiptFile],
          extraction_warning: message,
        },
      });
    }
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
