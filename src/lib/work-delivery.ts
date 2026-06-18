export type FinishLevel =
  | 'constructief_gereed'
  | 'plaatmateriaal_gemonteerd'
  | 'sausklaar'
  | 'schilderklaar'
  | 'volledig_afgewerkt'
  | 'custom';

export interface ElectricalScope {
  enabled: boolean;
  description: string;
  maxLengthMeters?: number;
  includedItems: string[];
  excludedItems: string[];
}

export interface WorkDeliveryScope {
  title: string;
  summary: string;
  work_scope: string[];
  materials: string[];
  dimensions: string[];
  included: string[];
  excluded: string[];
  internal_notes: string[];
  afvalAfvoeren: boolean;
  schilderwerkInbegrepen: boolean;
  stucwerkInbegrepen: boolean;
  electricalScope: ElectricalScope;
  finishLevel: FinishLevel;
  customFinishDescription?: string;
}

export interface WorkDeliveryValidationResult {
  valid: boolean;
  errors: string[];
}

export const WASTE_INCLUDED_TEXT = 'Afvoeren van vrijkomend afval en restmateriaal zoals overeengekomen.';
export const WASTE_EXCLUDED_TEXT = 'Afvoeren van afval, puin en restmateriaal.';
export const ELECTRICAL_EXCLUDED_TEXT = 'Elektrawerkzaamheden, verplaatsen van kabels, stopcontacten, schakelaars en werkzaamheden aan de meterkast.';
export const PAINTING_INCLUDED_TEXT = 'Schilderwerk inbegrepen zoals overeengekomen.';
export const STUCCO_INCLUDED_TEXT = 'Stucwerk inbegrepen zoals overeengekomen.';
export const WASTE_WORK_SCOPE_TEXT = 'Afvoeren van vrijkomend afval en restmateriaal.';
export const PAINTING_WORK_SCOPE_TEXT = 'Schilderen van de overeengekomen onderdelen.';
export const STUCCO_WORK_SCOPE_TEXT = 'Uitvoeren van het overeengekomen stucwerk.';
export const ELECTRICAL_WORK_SCOPE_TEXT = 'Uitvoeren van het overeengekomen elektrawerk.';

export const DEFAULT_ELECTRICAL_SCOPE: ElectricalScope = {
  enabled: false,
  description: '',
  includedItems: [],
  excludedItems: [],
};

export const DEFAULT_WORK_DELIVERY_SCOPE: WorkDeliveryScope = {
  title: '',
  summary: '',
  work_scope: [],
  materials: [],
  dimensions: [],
  included: [],
  excluded: [WASTE_EXCLUDED_TEXT, ELECTRICAL_EXCLUDED_TEXT],
  internal_notes: [],
  afvalAfvoeren: false,
  schilderwerkInbegrepen: false,
  stucwerkInbegrepen: false,
  electricalScope: DEFAULT_ELECTRICAL_SCOPE,
  finishLevel: 'constructief_gereed',
};

const WASTE_PATTERN = /afval|puin|sloopafval|restmateriaal\s+afvoeren|container|bouwafvalzakken|afvoeren/i;
const ELECTRICAL_PATTERN = /elektra|elektrisch|kabel|stopcontact|schakelaar|meterkast|wandcontactdoos|groepenkast/i;
const PAINTING_PATTERN = /schilder|sauswerk|sausen|aflak|verven/i;
const STUCCO_PATTERN = /stuc/i;
const OTHER_FINISH_PATTERN = /plamuur|kitwerk|kitten/i;
const FINISH_PATTERNS: Partial<Record<FinishLevel, RegExp>> = {
  constructief_gereed: /schilder|stuc|plamuur|kitwerk|kitten|sauswerk|sausen|aflak|verven/i,
  plaatmateriaal_gemonteerd: /schilder|stuc|plamuur|kitwerk|kitten|sauswerk|sausen|aflak|verven/i,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function rows(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === 'string') return item.trim() ? [item.trim()] : [];
    if (!isRecord(item)) return [];
    const direct = text(item.text) || text(item.description) || text(item.stap) || text(item.step);
    return direct ? [direct] : [];
  });
}

function unique(input: string[]): string[] {
  return Array.from(new Set(input.map((item) => item.trim()).filter(Boolean)));
}

function ensureWorkScopeRows(
  scope: WorkDeliveryScope,
  pattern: RegExp,
  preferredRows: string[],
  fallback: string,
): void {
  if (scope.work_scope.some((line) => pattern.test(line))) return;
  const rowsToAdd = unique(preferredRows.filter((line) => pattern.test(line)));
  scope.work_scope = deduplicateWorkScopeRows([
    ...scope.work_scope,
    ...(rowsToAdd.length > 0 ? rowsToAdd : [fallback]),
  ]);
}

const WORK_SCOPE_STOP_WORDS = new Set([
  'aan', 'als', 'bij', 'de', 'die', 'een', 'en', 'het', 'in', 'met', 'naar', 'om',
  'onder', 'op', 'te', 'tot', 'uit', 'van', 'voor', 'wordt', 'zijn',
]);

function normalizeWorkScopeTokens(value: string): Set<string> {
  const normalized = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:weg\s*halen|weghalen|demonteren)\b/g, ' verwijderen ')
    .replace(/\b(?:verwijderd|verwijder)\b/g, ' verwijderen ')
    .replace(/\b(?:zetten|gezet|monteren|gemonteerd|aanbrengen|aangebracht)\b/g, ' plaatsen ')
    .replace(/\b(?:plek|positie)\b/g, ' locatie ')
    .replace(/\bbestaand(?:e)?\b/g, ' oude ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  return new Set(normalized
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !WORK_SCOPE_STOP_WORDS.has(token)));
}

function isEquivalentWorkScopeRow(left: string, right: string): boolean {
  const leftTokens = normalizeWorkScopeTokens(left);
  const rightTokens = normalizeWorkScopeTokens(right);
  if (leftTokens.size < 2 || rightTokens.size < 2) return false;

  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const smallerSize = Math.min(leftTokens.size, rightTokens.size);
  const largerSize = Math.max(leftTokens.size, rightTokens.size);

  // A paraphrase usually preserves nearly all meaningful words, while adding or
  // dropping a qualifier such as "nieuwe". Separate operations (for example only
  // removing a cabinet versus only placing a wall) do not meet this threshold.
  return overlap / smallerSize >= 0.8 && overlap / largerSize >= 0.65;
}

export function deduplicateWorkScopeRows(input: string[]): string[] {
  return unique(input).filter((candidate, index, rows) => (
    !rows.slice(0, index).some((existing) => isEquivalentWorkScopeRow(existing, candidate))
  ));
}

function truncateAtWord(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  const shortened = compact.slice(0, maxLength + 1);
  const wordBoundary = shortened.lastIndexOf(' ');
  return `${shortened.slice(0, wordBoundary > maxLength * 0.6 ? wordBoundary : maxLength).trim()}...`;
}

function deriveTitleFromScope(scope: WorkDeliveryScope, fallbackTitle?: string): string {
  const fallback = text(fallbackTitle);
  if (fallback && !/^offerte(?:\s+\d+)?$/i.test(fallback)) {
    return truncateAtWord(fallback, 80);
  }

  const firstScopeLine = scope.work_scope.find((line) => line.trim()) || '';
  if (!firstScopeLine) return '';

  const concise = firstScopeLine.split(/[.;]/, 1)[0].split(/\s+-\s+/, 1)[0];
  return truncateAtWord(concise, 80);
}

function deriveSummaryFromScope(scope: WorkDeliveryScope): string {
  const firstScopeLine = scope.work_scope.find((line) => line.trim()) || '';
  if (!firstScopeLine) return '';
  const summary = truncateAtWord(firstScopeLine, 240);
  return /[.!?]$/.test(summary) ? summary : `${summary}.`;
}

const MATERIAL_QUANTITY_UNIT = '(?:stuk(?:s)?|pcs?|plaat|platen|paneel|panelen|rol(?:len)?|doos|dozen|zak(?:ken)?|pak(?:ken)?|bundel(?:s)?|lengte(?:s)?|koker(?:s)?|bus(?:sen)?|blik(?:ken)?|set(?:s)?)';

export function isIgnoredWorkDeliveryMaterial(value: string): boolean {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === 'extra kosten';
}

/** Material descriptions may contain product dimensions, but never order quantities. */
export function sanitizeMaterialDescription(value: string): string {
  const sanitized = value
    .replace(new RegExp(`\\s*\\(\\s*\\d+(?:[.,]\\d+)?\\s*${MATERIAL_QUANTITY_UNIT}\\s*\\)`, 'gi'), '')
    .replace(new RegExp(`^\\s*\\d+(?:[.,]\\d+)?\\s*${MATERIAL_QUANTITY_UNIT}\\s*(?:[-–—:]\\s*)?`, 'gi'), '')
    .replace(new RegExp(`\\s*(?:[-–—,:]|\\bx)?\\s*\\d+(?:[.,]\\d+)?\\s*${MATERIAL_QUANTITY_UNIT}\\s*$`, 'gi'), '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/[\s,;:–—-]+$/g, '')
    .trim();

  return isIgnoredWorkDeliveryMaterial(sanitized) ? '' : sanitized;
}

function sanitizeMaterialRows(input: string[]): string[] {
  return unique(input.map(sanitizeMaterialDescription));
}

function normalizeFinishLevel(value: unknown): FinishLevel {
  const allowed: FinishLevel[] = [
    'constructief_gereed',
    'plaatmateriaal_gemonteerd',
    'sausklaar',
    'schilderklaar',
    'volledig_afgewerkt',
    'custom',
  ];
  return allowed.includes(value as FinishLevel) ? value as FinishLevel : 'constructief_gereed';
}

function normalizeElectricalScope(value: unknown): ElectricalScope {
  if (!isRecord(value)) return { ...DEFAULT_ELECTRICAL_SCOPE };
  const maxLength = Number(value.maxLengthMeters);
  return {
    enabled: value.enabled === true,
    description: text(value.description),
    ...(Number.isFinite(maxLength) && maxLength >= 0 ? { maxLengthMeters: maxLength } : {}),
    includedItems: rows(value.includedItems),
    excludedItems: rows(value.excludedItems),
  };
}

function getLegacyInternalNotes(input: Record<string, unknown>): string[] {
  const sections = isRecord(input.sections) ? input.sections : {};
  return unique([
    ...rows(sections.voorbereiding ?? input.voorbereiding ?? input.preparation),
    ...rows(sections.uitvoering ?? input.uitvoering ?? input.execution),
    ...rows(sections.afwerking ?? input.afwerking ?? input.finishing),
    ...rows(input.steps ?? input.stappen ?? input.fullWorkDescription),
    ...rows(input.legacyNotes),
  ]);
}

export function sanitizeWorkDeliveryScope(input: unknown): WorkDeliveryScope {
  if (!isRecord(input)) return { ...DEFAULT_WORK_DELIVERY_SCOPE, electricalScope: { ...DEFAULT_ELECTRICAL_SCOPE } };

  const electricalScope = normalizeElectricalScope(input.electricalScope);
  const result: WorkDeliveryScope = {
    title: text(input.title ?? input.korteTitel ?? input.korte_titel),
    summary: text(input.summary ?? input.context ?? input.korteBeschrijving ?? input.korte_beschrijving),
    work_scope: rows(input.work_scope ?? input.workScope ?? input.werkzaamheden),
    materials: sanitizeMaterialRows(rows(input.materials ?? input.materialen)),
    dimensions: rows(input.dimensions ?? input.maatvoering),
    included: rows(input.included ?? input.inbegrepen),
    excluded: rows(input.excluded ?? input.niet_inbegrepen ?? input.nietInbegrepen),
    internal_notes: unique([
      ...rows(input.internal_notes ?? input.internalNotes),
      ...getLegacyInternalNotes(input),
    ]),
    afvalAfvoeren: input.afvalAfvoeren === true,
    schilderwerkInbegrepen: input.schilderwerkInbegrepen === true,
    stucwerkInbegrepen: input.stucwerkInbegrepen === true,
    electricalScope,
    finishLevel: normalizeFinishLevel(input.finishLevel),
    customFinishDescription: text(input.customFinishDescription),
  };

  return enforceWorkDeliverySafety(result);
}

export function completeWorkDeliveryScope(
  input: unknown,
  fallbackTitle?: string,
): WorkDeliveryScope {
  const scope = sanitizeWorkDeliveryScope(input);
  const title = scope.title || deriveTitleFromScope(scope, fallbackTitle);
  const summary = scope.summary || deriveSummaryFromScope(scope);
  return enforceWorkDeliverySafety({ ...scope, title, summary });
}

export function enforceWorkDeliverySafety(input: WorkDeliveryScope): WorkDeliveryScope {
  const scope: WorkDeliveryScope = {
    ...input,
    title: isIgnoredWorkDeliveryMaterial(input.title) ? '' : input.title,
    summary: isIgnoredWorkDeliveryMaterial(input.summary) ? '' : input.summary,
    work_scope: deduplicateWorkScopeRows(input.work_scope).filter((line) => !isIgnoredWorkDeliveryMaterial(line)),
    materials: sanitizeMaterialRows(input.materials),
    dimensions: unique(input.dimensions).filter((line) => !isIgnoredWorkDeliveryMaterial(line)),
    included: unique(input.included).filter((line) => !isIgnoredWorkDeliveryMaterial(line)),
    excluded: unique(input.excluded).filter((line) => !isIgnoredWorkDeliveryMaterial(line)),
    internal_notes: unique(input.internal_notes).filter((line) => !isIgnoredWorkDeliveryMaterial(line)),
    electricalScope: normalizeElectricalScope(input.electricalScope),
  };
  const customerKeys: Array<keyof Pick<WorkDeliveryScope, 'work_scope' | 'materials' | 'dimensions' | 'included' | 'excluded'>> = [
    'work_scope', 'materials', 'dimensions', 'included', 'excluded',
  ];

  if (!scope.afvalAfvoeren) {
    customerKeys.forEach((key) => { scope[key] = scope[key].filter((line) => !WASTE_PATTERN.test(line)); });
    if (WASTE_PATTERN.test(scope.summary)) scope.summary = '';
    if (WASTE_PATTERN.test(scope.title)) scope.title = '';
    scope.excluded = unique([...scope.excluded, WASTE_EXCLUDED_TEXT]);
  } else {
    const wasteRows = scope.included.filter((line) => WASTE_PATTERN.test(line) && line !== WASTE_INCLUDED_TEXT);
    scope.included = scope.included.filter((line) => !WASTE_PATTERN.test(line));
    scope.excluded = scope.excluded.filter((line) => !WASTE_PATTERN.test(line));
    ensureWorkScopeRows(scope, WASTE_PATTERN, wasteRows, WASTE_WORK_SCOPE_TEXT);
  }

  if (!scope.electricalScope.enabled) {
    customerKeys.forEach((key) => { scope[key] = scope[key].filter((line) => !ELECTRICAL_PATTERN.test(line)); });
    if (ELECTRICAL_PATTERN.test(scope.summary)) scope.summary = '';
    if (ELECTRICAL_PATTERN.test(scope.title)) scope.title = '';
    scope.excluded = unique([...scope.excluded, ELECTRICAL_EXCLUDED_TEXT]);
  } else {
    const electricalRows = [
      ...scope.included.filter((line) => ELECTRICAL_PATTERN.test(line)),
      scope.electricalScope.description,
      ...scope.electricalScope.includedItems,
    ];
    scope.materials = scope.materials.filter((line) => !ELECTRICAL_PATTERN.test(line));
    scope.dimensions = scope.dimensions.filter((line) => !ELECTRICAL_PATTERN.test(line));
    scope.included = scope.included.filter((line) => !ELECTRICAL_PATTERN.test(line));
    scope.excluded = unique([...scope.excluded.filter((line) => line !== ELECTRICAL_EXCLUDED_TEXT), ...scope.electricalScope.excludedItems]);
    ensureWorkScopeRows(scope, ELECTRICAL_PATTERN, electricalRows, ELECTRICAL_WORK_SCOPE_TEXT);
    scope.work_scope = unique([
      ...scope.work_scope,
      Number.isFinite(scope.electricalScope.maxLengthMeters)
        ? `Kabellengte maximaal ${scope.electricalScope.maxLengthMeters} meter.`
        : '',
    ]);
  }

  const finishPattern = FINISH_PATTERNS[scope.finishLevel];
  if (finishPattern) {
    const disallowedFinishPattern = new RegExp([
      !scope.schilderwerkInbegrepen ? PAINTING_PATTERN.source : '',
      !scope.stucwerkInbegrepen ? STUCCO_PATTERN.source : '',
      OTHER_FINISH_PATTERN.source,
    ].filter(Boolean).join('|'), 'i');
    customerKeys.forEach((key) => {
      scope[key] = scope[key].filter((line) => !disallowedFinishPattern.test(line));
    });
    if (disallowedFinishPattern.test(scope.summary)) scope.summary = '';
    if (disallowedFinishPattern.test(scope.title)) scope.title = '';

    scope.excluded = scope.excluded.filter((line) => !finishPattern.test(line));
    const excludedFinishParts = [
      !scope.schilderwerkInbegrepen ? 'schilderwerk en sauswerk' : '',
      !scope.stucwerkInbegrepen ? 'stucwerk' : '',
      'plamuurwerk en kitwerk',
    ].filter(Boolean);
    if (excludedFinishParts.length > 0) {
      const suffix = scope.finishLevel === 'plaatmateriaal_gemonteerd'
        ? ' na montage van het plaatmateriaal'
        : '';
      const exclusion = `${excludedFinishParts.join(', ')}${suffix}.`;
      scope.excluded = unique([...scope.excluded, exclusion.charAt(0).toUpperCase() + exclusion.slice(1)]);
    }
  }

  if (scope.schilderwerkInbegrepen) {
    const paintingRows = scope.included.filter((line) => PAINTING_PATTERN.test(line) && line !== PAINTING_INCLUDED_TEXT);
    scope.included = scope.included.filter((line) => !PAINTING_PATTERN.test(line));
    scope.excluded = scope.excluded.filter((line) => !PAINTING_PATTERN.test(line));
    ensureWorkScopeRows(scope, PAINTING_PATTERN, paintingRows, PAINTING_WORK_SCOPE_TEXT);
  }

  if (scope.stucwerkInbegrepen) {
    const stuccoRows = scope.included.filter((line) => STUCCO_PATTERN.test(line) && line !== STUCCO_INCLUDED_TEXT);
    scope.included = scope.included.filter((line) => !STUCCO_PATTERN.test(line));
    scope.excluded = scope.excluded.filter((line) => !STUCCO_PATTERN.test(line));
    ensureWorkScopeRows(scope, STUCCO_PATTERN, stuccoRows, STUCCO_WORK_SCOPE_TEXT);
  }

  return scope;
}

export function flattenWorkDeliveryScope(input: unknown): string[] {
  const scope = sanitizeWorkDeliveryScope(input);
  return unique([
    ...scope.work_scope,
    ...scope.dimensions,
    ...scope.included,
    ...scope.excluded,
  ]);
}

export function validateWorkDeliveryScope(
  input: unknown,
): WorkDeliveryValidationResult {
  const scope = sanitizeWorkDeliveryScope(input);
  const errors: string[] = [];
  const raw = isRecord(input) ? input : {};
  const customerText = [
    text(raw.title ?? raw.korteTitel),
    text(raw.summary ?? raw.context),
    ...rows(raw.work_scope),
    ...rows(raw.dimensions),
    ...rows(raw.included),
    ...rows(raw.excluded),
  ].join('\n');

  if (!scope.title) errors.push('Vul een titel in.');
  if (scope.work_scope.length === 0) errors.push('Voeg minimaal één regel toe onder Werkzaamheden.');
  if (scope.excluded.length === 0) errors.push('Niet inbegrepen mag niet leeg zijn.');
  if (scope.finishLevel === 'custom' && !scope.customFinishDescription) {
    errors.push('Beschrijf het maatwerk afwerkingsniveau.');
  }
  if (!scope.afvalAfvoeren && WASTE_PATTERN.test(customerText.replace(WASTE_EXCLUDED_TEXT, ''))) {
    errors.push('Afval afvoeren staat uit, maar klanttekst bevat afval- of afvoerwerk.');
  }
  if (!scope.electricalScope.enabled && ELECTRICAL_PATTERN.test(customerText.replace(ELECTRICAL_EXCLUDED_TEXT, ''))) {
    errors.push('Elektrawerk staat uit, maar klanttekst bevat elektrawerk.');
  }
  const finishPattern = FINISH_PATTERNS[scope.finishLevel];
  const finishValidationText = customerText
    .replace(/Schilderwerk, stucwerk, plamuurwerk, kitwerk en sauswerk[^.]*\./i, '')
    .replace(PAINTING_INCLUDED_TEXT, '')
    .replace(STUCCO_INCLUDED_TEXT, '');
  if (
    finishPattern
    && (
      (!scope.schilderwerkInbegrepen && PAINTING_PATTERN.test(finishValidationText))
      || (!scope.stucwerkInbegrepen && STUCCO_PATTERN.test(finishValidationText))
      || OTHER_FINISH_PATTERN.test(finishValidationText)
    )
  ) {
    errors.push('De klanttekst bevat afwerking die niet past bij het gekozen afwerkingsniveau.');
  }

  return { valid: errors.length === 0, errors };
}

export function getFinishLevelLabel(value: FinishLevel): string {
  return ({
    constructief_gereed: 'Constructief gereed',
    plaatmateriaal_gemonteerd: 'Plaatmateriaal gemonteerd',
    sausklaar: 'Sausklaar',
    schilderklaar: 'Schilderklaar',
    volledig_afgewerkt: 'Volledig afgewerkt',
    custom: 'Maatwerk',
  } as Record<FinishLevel, string>)[value];
}
