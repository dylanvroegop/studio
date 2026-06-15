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
  electricalScope: DEFAULT_ELECTRICAL_SCOPE,
  finishLevel: 'constructief_gereed',
};

const WASTE_PATTERN = /afval|puin|sloopafval|restmateriaal\s+afvoeren|container|bouwafvalzakken|afvoeren/i;
const ELECTRICAL_PATTERN = /elektra|elektrisch|kabel|stopcontact|schakelaar|meterkast|wandcontactdoos|groepenkast/i;
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
    electricalScope,
    finishLevel: normalizeFinishLevel(input.finishLevel),
    customFinishDescription: text(input.customFinishDescription),
  };

  return enforceWorkDeliverySafety(result);
}

export function enforceWorkDeliverySafety(input: WorkDeliveryScope): WorkDeliveryScope {
  const scope: WorkDeliveryScope = {
    ...input,
    title: isIgnoredWorkDeliveryMaterial(input.title) ? '' : input.title,
    summary: isIgnoredWorkDeliveryMaterial(input.summary) ? '' : input.summary,
    work_scope: unique(input.work_scope).filter((line) => !isIgnoredWorkDeliveryMaterial(line)),
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
    scope.included = unique([...scope.included.filter((line) => !WASTE_PATTERN.test(line)), WASTE_INCLUDED_TEXT]);
    scope.excluded = scope.excluded.filter((line) => !WASTE_PATTERN.test(line));
  }

  if (!scope.electricalScope.enabled) {
    customerKeys.forEach((key) => { scope[key] = scope[key].filter((line) => !ELECTRICAL_PATTERN.test(line)); });
    if (ELECTRICAL_PATTERN.test(scope.summary)) scope.summary = '';
    if (ELECTRICAL_PATTERN.test(scope.title)) scope.title = '';
    scope.excluded = unique([...scope.excluded, ELECTRICAL_EXCLUDED_TEXT]);
  } else {
    customerKeys.forEach((key) => { scope[key] = scope[key].filter((line) => !ELECTRICAL_PATTERN.test(line)); });
    scope.excluded = unique([...scope.excluded.filter((line) => line !== ELECTRICAL_EXCLUDED_TEXT), ...scope.electricalScope.excludedItems]);
    scope.included = unique([
      ...scope.included,
      scope.electricalScope.description,
      ...scope.electricalScope.includedItems,
      Number.isFinite(scope.electricalScope.maxLengthMeters)
        ? `Kabellengte maximaal ${scope.electricalScope.maxLengthMeters} meter.`
        : '',
    ]);
  }

  const finishPattern = FINISH_PATTERNS[scope.finishLevel];
  if (finishPattern) {
    customerKeys.forEach((key) => { scope[key] = scope[key].filter((line) => !finishPattern.test(line)); });
    if (finishPattern.test(scope.summary)) scope.summary = '';
    if (finishPattern.test(scope.title)) scope.title = '';
    const finishExclusions = scope.finishLevel === 'constructief_gereed'
      ? 'Schilderwerk, stucwerk, plamuurwerk, kitwerk en sauswerk.'
      : 'Schilderwerk, stucwerk, plamuurwerk, kitwerk en sauswerk na montage van het plaatmateriaal.';
    scope.excluded = unique([...scope.excluded, finishExclusions]);
  }

  return scope;
}

export function flattenWorkDeliveryScope(input: unknown): string[] {
  const scope = sanitizeWorkDeliveryScope(input);
  return unique([
    ...scope.work_scope,
    ...scope.materials,
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
    ...rows(raw.materials),
    ...rows(raw.dimensions),
    ...rows(raw.included),
    ...rows(raw.excluded),
  ].join('\n');

  if (!scope.title) errors.push('Vul een titel in.');
  const sentenceCount = scope.summary.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean).length;
  if (sentenceCount > 2) errors.push('Korte omschrijving mag maximaal twee zinnen bevatten.');
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
  if (finishPattern && finishPattern.test(customerText.replace(/Schilderwerk, stucwerk, plamuurwerk, kitwerk en sauswerk[^.]*\./i, ''))) {
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
