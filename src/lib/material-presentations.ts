import type { MaterialPresentation, MaterialPresentationVisibleSpecification } from '@/lib/types';

const FORBIDDEN_LINE_PATTERNS = [
  /\b(ean|gtin)\b\s*[:#-]?\s*[0-9 -]{6,}/gi,
  /\b(artikelnummer|art\.?\s*nr\.?|artnr|sku|productcode|bestelnummer)\b\s*[:#-]?\s*[\w.-]+/gi,
  /\b(url|link|website)\b\s*[:#-]?\s*\S+/gi,
  /https?:\/\/\S+/gi,
  /\bwww\.[^\s]+/gi,
  /\b(prijs|inkoopprijs|verkoopprijs|actieprijs|korting|marge|staffelprijs|leverancier|voorraad|levertijd|bouwmaat|hornbach|gamma|karwei|praxis|stiho|jongeneel)\b\s*[:#-]?\s*[^,\n.;]*/gi,
  /€\s*\d+(?:[.,]\d{1,2})?/g,
];

const FORBIDDEN_SPEC_LABELS = [
  'ean',
  'gtin',
  'artikel',
  'art.nr',
  'artnr',
  'sku',
  'productcode',
  'bestelnummer',
  'url',
  'link',
  'website',
  'prijs',
  'inkoop',
  'verkoop',
  'korting',
  'marge',
  'leverancier',
  'voorraad',
  'levertijd',
];

function safeString(value: unknown, maxLength = 600): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function sanitizeClientText(value: unknown, maxLength = 900): string {
  let text = safeString(value, maxLength * 2);
  FORBIDDEN_LINE_PATTERNS.forEach((pattern) => {
    text = text.replace(pattern, '');
  });
  return text.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim().slice(0, maxLength);
}

function isForbiddenSpecLabel(label: string): boolean {
  const normalized = label.toLowerCase();
  return FORBIDDEN_SPEC_LABELS.some((forbidden) => normalized.includes(forbidden));
}

function sanitizeKeyProperties(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeClientText(item, 90))
    .filter(Boolean)
    .slice(0, 12);
}

function sanitizeVisibleSpecifications(value: unknown): MaterialPresentationVisibleSpecification[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const label = sanitizeClientText(row.label, 70);
      const specValue = sanitizeClientText(row.value, 120);
      if (!label || !specValue || isForbiddenSpecLabel(label)) return null;
      return { label, value: specValue };
    })
    .filter((item): item is MaterialPresentationVisibleSpecification => item !== null)
    .slice(0, 12);
}

export function createMaterialPresentation(quoteId: string, sortOrder: number): MaterialPresentation {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `material-presentation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();
  return {
    id,
    quoteId,
    title: '',
    application: '',
    productImageUrl: '',
    productImageStoragePath: '',
    specsImageUrl: '',
    specsImageStoragePath: '',
    clientDescription: '',
    whyChosen: '',
    keyProperties: [],
    visibleSpecifications: [],
    showInQuote: true,
    showProductImage: true,
    showTechnicalDetails: true,
    allowEquivalentAlternative: true,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
}

export function sanitizeMaterialPresentation(input: unknown, quoteId: string, index = 0): MaterialPresentation | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  const id = safeString(row.id, 120) || `material-presentation-${index + 1}`;
  const createdAt = row.createdAt || new Date().toISOString();
  const updatedAt = row.updatedAt || createdAt;
  const sortOrderRaw = Number(row.sortOrder);

  return {
    id,
    quoteId: safeString(row.quoteId, 120) || quoteId,
    title: sanitizeClientText(row.title, 120),
    application: sanitizeClientText(row.application, 180),
    productImageUrl: safeString(row.productImageUrl, 1200),
    productImageStoragePath: safeString(row.productImageStoragePath, 1200),
    specsImageUrl: safeString(row.specsImageUrl, 1200),
    specsImageStoragePath: safeString(row.specsImageStoragePath, 1200),
    clientDescription: sanitizeClientText(row.clientDescription, 900),
    whyChosen: sanitizeClientText(row.whyChosen, 900),
    keyProperties: sanitizeKeyProperties(row.keyProperties),
    visibleSpecifications: sanitizeVisibleSpecifications(row.visibleSpecifications),
    showInQuote: typeof row.showInQuote === 'boolean' ? row.showInQuote : true,
    showProductImage: typeof row.showProductImage === 'boolean' ? row.showProductImage : true,
    showTechnicalDetails: typeof row.showTechnicalDetails === 'boolean' ? row.showTechnicalDetails : true,
    allowEquivalentAlternative: typeof row.allowEquivalentAlternative === 'boolean' ? row.allowEquivalentAlternative : true,
    sortOrder: Number.isFinite(sortOrderRaw) ? sortOrderRaw : index,
    createdAt: createdAt as MaterialPresentation['createdAt'],
    updatedAt: updatedAt as MaterialPresentation['updatedAt'],
  };
}

export function sanitizeMaterialPresentations(value: unknown, quoteId: string): MaterialPresentation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => sanitizeMaterialPresentation(item, quoteId, index))
    .filter((item): item is MaterialPresentation => item !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index }));
}

export function redactMaterialPresentationText(value: unknown, maxLength?: number): string {
  return sanitizeClientText(value, maxLength);
}

export function redactMaterialPresentationPayload(input: unknown) {
  const row = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return {
    title: sanitizeClientText(row.title, 120),
    application: sanitizeClientText(row.application, 180),
    clientDescription: sanitizeClientText(row.clientDescription, 900),
    whyChosen: sanitizeClientText(row.whyChosen, 900),
    keyProperties: sanitizeKeyProperties(row.keyProperties),
    visibleSpecifications: sanitizeVisibleSpecifications(row.visibleSpecifications),
  };
}
