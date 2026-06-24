export type FinishLevel =
  | 'constructief_gereed'
  | 'plaatmateriaal_gemonteerd'
  | 'sausklaar'
  | 'schilderklaar'
  | 'volledig_afgewerkt'
  | 'custom';

export type NadenVullenAfwerkingsniveau = 'behangklaar' | 'schilderklaar';

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
  plamuurwerkInbegrepen: boolean;
  kitwerkInbegrepen: boolean;
  steigerInbegrepen: boolean;
  sloopwerkInbegrepen: boolean;
  nadenVullenInbegrepen: boolean;
  nadenVullenAfwerkingsniveau?: NadenVullenAfwerkingsniveau;
  schroefgatenPlamurenInbegrepen: boolean;
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
export const ELECTRICAL_INCLUDED_TEXT = 'Elektrawerk inbegrepen zoals overeengekomen.';
export const PAINTING_EXCLUDED_TEXT = 'Schilderwerk en sauswerk niet inbegrepen.';
export const PAINTING_INCLUDED_TEXT = 'Schilderwerk inbegrepen zoals overeengekomen.';
export const STUCCO_EXCLUDED_TEXT = 'Stucwerk niet inbegrepen.';
export const STUCCO_INCLUDED_TEXT = 'Stucwerk inbegrepen zoals overeengekomen.';
export const FILLING_EXCLUDED_TEXT = 'Plamuurwerk niet inbegrepen.';
export const FILLING_INCLUDED_TEXT = 'Plamuurwerk inbegrepen zoals overeengekomen.';
export const SEALING_EXCLUDED_TEXT = 'Kitwerk niet inbegrepen.';
export const SEALING_INCLUDED_TEXT = 'Kitwerk inbegrepen zoals overeengekomen.';
export const SCAFFOLD_EXCLUDED_TEXT = 'Steigerwerk en steigerhuur niet inbegrepen.';
export const SCAFFOLD_INCLUDED_TEXT = 'Steigerwerk inbegrepen zoals overeengekomen.';
export const DEMOLITION_EXCLUDED_TEXT = 'Sloopwerk niet inbegrepen.';
export const DEMOLITION_INCLUDED_TEXT = 'Sloopwerk inbegrepen zoals overeengekomen.';
export const SEAM_FILLING_EXCLUDED_TEXT = 'Naden vullen en afwerken niet inbegrepen.';
export const SEAM_FILLING_Q2_INCLUDED_TEXT = 'Afwerkingsniveau: Q2 (Behangklaar).';
export const SEAM_FILLING_Q4_INCLUDED_TEXT = 'Afwerkingsniveau: Q4 (Schilderklaar).';
export const SCREW_HOLE_FILLING_EXCLUDED_TEXT = 'Schroefgaten plamuren niet inbegrepen.';
export const SCREW_HOLE_FILLING_INCLUDED_TEXT = 'Schroefgaten plamuren inbegrepen zoals overeengekomen.';

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
  plamuurwerkInbegrepen: false,
  kitwerkInbegrepen: false,
  steigerInbegrepen: false,
  sloopwerkInbegrepen: false,
  nadenVullenInbegrepen: false,
  nadenVullenAfwerkingsniveau: undefined,
  schroefgatenPlamurenInbegrepen: false,
  electricalScope: DEFAULT_ELECTRICAL_SCOPE,
  finishLevel: 'constructief_gereed',
};

const WASTE_PATTERN = /afval|puin|sloopafval|restmateriaal\s+afvoeren|container|bouwafvalzakken|afvoeren/i;
const ELECTRICAL_PATTERN = /elektra|elektrisch|kabel|stopcontact|schakelaar|meterkast|wandcontactdoos|groepenkast/i;
const PAINTING_PATTERN = /schilder|sauswerk|sausen|aflak|verven/i;
const STUCCO_PATTERN = /stuc/i;
const FILLING_PATTERN = /plamuur/i;
const SEAM_FILLING_PATTERN = /nad(?:en|e)\s+(?:vullen|afwerken)|voeg(?:en)?\s+(?:vullen|afwerken)/i;
const SCREW_HOLE_FILLING_PATTERN = /schroefgat(?:en)?\s+(?:plamuren|vullen|afwerken)|(?:plamuren|vullen|afwerken)\s+van\s+(?:de\s+)?schroefgat(?:en)?/i;
const SCAFFOLD_PATTERN = /steiger|steigerwerk|steigerhuur/i;
const DEMOLITION_PATTERN = /sloopwerk|slopen|demonteren/i;
const FINISH_PATTERNS: Partial<Record<FinishLevel, RegExp>> = {
  constructief_gereed: /schilder|plamuur|sauswerk|sausen|aflak|verven/i,
  plaatmateriaal_gemonteerd: /schilder|plamuur|sauswerk|sausen|aflak|verven/i,
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

const MANAGED_INCLUDED_TEXTS = [
  WASTE_INCLUDED_TEXT,
  ELECTRICAL_INCLUDED_TEXT,
  PAINTING_INCLUDED_TEXT,
  STUCCO_INCLUDED_TEXT,
  FILLING_INCLUDED_TEXT,
  SEALING_INCLUDED_TEXT,
  SCAFFOLD_INCLUDED_TEXT,
  DEMOLITION_INCLUDED_TEXT,
  SEAM_FILLING_Q2_INCLUDED_TEXT,
  SEAM_FILLING_Q4_INCLUDED_TEXT,
  SCREW_HOLE_FILLING_INCLUDED_TEXT,
];

const MANAGED_EXCLUDED_TEXTS = [
  WASTE_EXCLUDED_TEXT,
  ELECTRICAL_EXCLUDED_TEXT,
  PAINTING_EXCLUDED_TEXT,
  STUCCO_EXCLUDED_TEXT,
  FILLING_EXCLUDED_TEXT,
  SEALING_EXCLUDED_TEXT,
  SCAFFOLD_EXCLUDED_TEXT,
  DEMOLITION_EXCLUDED_TEXT,
  SEAM_FILLING_EXCLUDED_TEXT,
  SCREW_HOLE_FILLING_EXCLUDED_TEXT,
];

function isLegacyManagedFinishExclusion(value: string): boolean {
  const normalized = value
    .toLowerCase()
    .replace(/\s+na montage van het plaatmateriaal\.?$/, '')
    .replace(/[.]$/, '')
    .trim();
  if (!normalized) return false;

  const managedParts = new Set([
    'schilderwerk en sauswerk',
    'stucwerk',
    'overig plamuurwerk',
    'kitwerk',
    'naden vullen',
    'schroefgaten plamuren',
  ]);
  const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 && parts.every((part) => managedParts.has(part));
}

export function isRemovedLegacyToggleText(value: string): boolean {
  const normalized = value
    .toLowerCase()
    .replace(/[.]$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized === 'stucwerk niet inbegrepen'
    || normalized === 'stucwerk inbegrepen zoals overeengekomen'
    || normalized === 'kitwerk niet inbegrepen'
    || normalized === 'kitwerk inbegrepen zoals overeengekomen';
}

function synchronizeToggleLists(scope: WorkDeliveryScope): void {
  const managedIncluded = new Set(MANAGED_INCLUDED_TEXTS);
  const managedExcluded = new Set(MANAGED_EXCLUDED_TEXTS);
  scope.included = scope.included.filter((line) => !managedIncluded.has(line) && !isRemovedLegacyToggleText(line));
  scope.excluded = scope.excluded.filter((line) => (
    !managedExcluded.has(line) && !isLegacyManagedFinishExclusion(line) && !isRemovedLegacyToggleText(line)
  ));

  const rules = [
    { enabled: scope.afvalAfvoeren, included: WASTE_INCLUDED_TEXT, excluded: WASTE_EXCLUDED_TEXT },
    { enabled: scope.electricalScope.enabled, included: ELECTRICAL_INCLUDED_TEXT, excluded: ELECTRICAL_EXCLUDED_TEXT },
    { enabled: scope.schilderwerkInbegrepen, included: PAINTING_INCLUDED_TEXT, excluded: PAINTING_EXCLUDED_TEXT },
    { enabled: scope.plamuurwerkInbegrepen, included: FILLING_INCLUDED_TEXT, excluded: FILLING_EXCLUDED_TEXT },
    { enabled: scope.steigerInbegrepen, included: SCAFFOLD_INCLUDED_TEXT, excluded: '' },
    { enabled: scope.sloopwerkInbegrepen, included: DEMOLITION_INCLUDED_TEXT, excluded: DEMOLITION_EXCLUDED_TEXT },
    {
      enabled: scope.nadenVullenInbegrepen,
      included: scope.nadenVullenAfwerkingsniveau === 'schilderklaar'
        ? SEAM_FILLING_Q4_INCLUDED_TEXT
        : SEAM_FILLING_Q2_INCLUDED_TEXT,
      excluded: SEAM_FILLING_EXCLUDED_TEXT,
    },
    { enabled: scope.schroefgatenPlamurenInbegrepen, included: SCREW_HOLE_FILLING_INCLUDED_TEXT, excluded: SCREW_HOLE_FILLING_EXCLUDED_TEXT },
  ];

  rules.forEach((rule) => {
    if (rule.enabled) scope.included.push(rule.included);
    else if (rule.excluded) scope.excluded.push(rule.excluded);
  });
  scope.included = unique(scope.included);
  scope.excluded = unique(scope.excluded);
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

export function inferWorkDeliveryFinishLevel(input: unknown): FinishLevel {
  if (!isRecord(input)) return 'constructief_gereed';

  const availableText = [
    text(input.title),
    text(input.summary ?? input.context),
    ...rows(input.work_scope),
    ...rows(input.materials),
    ...rows(input.included),
    ...rows(input.internal_notes),
  ].join('\n');

  if (/volledig\s+afgewerkt/i.test(availableText)) return 'volledig_afgewerkt';
  if (
    input.schilderwerkInbegrepen === true
    || input.stucwerkInbegrepen === true
    || PAINTING_PATTERN.test(availableText)
    || STUCCO_PATTERN.test(availableText)
  ) return 'volledig_afgewerkt';
  if (/sausklaar/i.test(availableText)) return 'sausklaar';
  if (
    input.plamuurwerkInbegrepen === true
    || input.nadenVullenInbegrepen === true
    || input.schroefgatenPlamurenInbegrepen === true
    || /schilderklaar/i.test(availableText)
    || FILLING_PATTERN.test(availableText)
    || SEAM_FILLING_PATTERN.test(availableText)
  ) return 'schilderklaar';
  if (/plaatmateriaal|gipsplaat|osb|multiplex|bekled(?:en|ing)|beplating/i.test(availableText)) {
    return 'plaatmateriaal_gemonteerd';
  }
  return 'constructief_gereed';
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
    stucwerkInbegrepen: false,
    plamuurwerkInbegrepen: input.plamuurwerkInbegrepen === true || input.plamuurEnKitwerkInbegrepen === true,
    kitwerkInbegrepen: false,
    steigerInbegrepen: input.steigerInbegrepen === true,
    sloopwerkInbegrepen: input.sloopwerkInbegrepen === true,
    nadenVullenInbegrepen: input.nadenVullenInbegrepen === true,
    nadenVullenAfwerkingsniveau: input.nadenVullenInbegrepen === true
      ? input.nadenVullenAfwerkingsniveau === 'schilderklaar' ? 'schilderklaar' : 'behangklaar'
      : undefined,
    schroefgatenPlamurenInbegrepen: input.schroefgatenPlamurenInbegrepen === true,
    electricalScope,
    finishLevel: normalizeFinishLevel(input.finishLevel),
    customFinishDescription: text(input.customFinishDescription),
  };

  return enforceWorkDeliverySafety(result);
}

export function completeWorkDeliveryScope(
  input: unknown,
  fallbackTitle?: string,
  options?: { deriveSummary?: boolean },
): WorkDeliveryScope {
  const scope = sanitizeWorkDeliveryScope(input);
  const title = scope.title || deriveTitleFromScope(scope, fallbackTitle);
  const summary = scope.summary || (options?.deriveSummary ? deriveSummaryFromScope(scope) : '');
  return enforceWorkDeliverySafety({ ...scope, title, summary });
}

export function enforceWorkDeliverySafety(input: WorkDeliveryScope): WorkDeliveryScope {
  const scope: WorkDeliveryScope = {
    ...input,
    title: isIgnoredWorkDeliveryMaterial(input.title) ? '' : input.title,
    summary: isIgnoredWorkDeliveryMaterial(input.summary) ? '' : input.summary,
    work_scope: deduplicateWorkScopeRows(input.work_scope).filter((line) => !isIgnoredWorkDeliveryMaterial(line)),
    materials: sanitizeMaterialRows(input.materials),
    // Equal measurements can represent multiple separate walls/parts. Preserve
    // multiplicity and ordering instead of treating equal rows as duplicates.
    dimensions: input.dimensions.map((line) => line.trim()).filter((line) => line && !isIgnoredWorkDeliveryMaterial(line)),
    included: unique(input.included).filter((line) => !isIgnoredWorkDeliveryMaterial(line) && !isRemovedLegacyToggleText(line)),
    excluded: unique(input.excluded).filter((line) => !isIgnoredWorkDeliveryMaterial(line) && !isRemovedLegacyToggleText(line)),
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
    scope.included = scope.included.filter((line) => !WASTE_PATTERN.test(line));
    scope.excluded = scope.excluded.filter((line) => !WASTE_PATTERN.test(line));
    scope.included = unique([...scope.included, WASTE_INCLUDED_TEXT]);
  }

  if (!scope.electricalScope.enabled) {
    customerKeys.forEach((key) => { scope[key] = scope[key].filter((line) => !ELECTRICAL_PATTERN.test(line)); });
    if (ELECTRICAL_PATTERN.test(scope.summary)) scope.summary = '';
    if (ELECTRICAL_PATTERN.test(scope.title)) scope.title = '';
    scope.excluded = unique([...scope.excluded, ELECTRICAL_EXCLUDED_TEXT]);
  } else {
    scope.materials = scope.materials.filter((line) => !ELECTRICAL_PATTERN.test(line));
    scope.dimensions = scope.dimensions.filter((line) => !ELECTRICAL_PATTERN.test(line));
    scope.included = scope.included.filter((line) => !ELECTRICAL_PATTERN.test(line));
    scope.excluded = unique([...scope.excluded.filter((line) => line !== ELECTRICAL_EXCLUDED_TEXT), ...scope.electricalScope.excludedItems]);
    scope.included = unique([
      ...scope.included,
      ELECTRICAL_INCLUDED_TEXT,
      ...scope.electricalScope.includedItems,
    ]);
    if (Number.isFinite(scope.electricalScope.maxLengthMeters)) {
      scope.included = unique([
        ...scope.included,
        `Kabellengte maximaal ${scope.electricalScope.maxLengthMeters} meter.`,
      ]);
    }
  }

  const finishPattern = FINISH_PATTERNS[scope.finishLevel];
  if (finishPattern) {
    const disallowedFinishSources = [
      !scope.schilderwerkInbegrepen ? PAINTING_PATTERN.source : '',
      !scope.plamuurwerkInbegrepen ? FILLING_PATTERN.source : '',
      !scope.nadenVullenInbegrepen ? SEAM_FILLING_PATTERN.source : '',
      !scope.schroefgatenPlamurenInbegrepen ? SCREW_HOLE_FILLING_PATTERN.source : '',
    ].filter(Boolean);
    if (disallowedFinishSources.length > 0) {
      const disallowedFinishPattern = new RegExp(disallowedFinishSources.join('|'), 'i');
      customerKeys.forEach((key) => {
        scope[key] = scope[key].filter((line) => !disallowedFinishPattern.test(line));
      });
      if (disallowedFinishPattern.test(scope.summary)) scope.summary = '';
      if (disallowedFinishPattern.test(scope.title)) scope.title = '';
    }

    scope.excluded = scope.excluded.filter((line) => !finishPattern.test(line));
    const excludedFinishParts = [
      !scope.schilderwerkInbegrepen ? 'schilderwerk en sauswerk' : '',
      !scope.plamuurwerkInbegrepen ? 'overig plamuurwerk' : '',
      !scope.nadenVullenInbegrepen ? 'naden vullen' : '',
      !scope.schroefgatenPlamurenInbegrepen ? 'schroefgaten plamuren' : '',
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
    scope.included = scope.included.filter((line) => !PAINTING_PATTERN.test(line));
    scope.excluded = scope.excluded.filter((line) => !PAINTING_PATTERN.test(line));
    scope.included = unique([...scope.included, PAINTING_INCLUDED_TEXT]);
  }

  if (scope.plamuurwerkInbegrepen) {
    scope.included = scope.included.filter((line) => !FILLING_PATTERN.test(line));
    scope.excluded = scope.excluded.filter((line) => !FILLING_PATTERN.test(line));
    scope.included = unique([...scope.included, FILLING_INCLUDED_TEXT]);
  }

  if (scope.nadenVullenInbegrepen) {
    scope.included = scope.included.filter((line) => !SEAM_FILLING_PATTERN.test(line));
    scope.excluded = scope.excluded.filter((line) => !SEAM_FILLING_PATTERN.test(line));
  }

  if (scope.schroefgatenPlamurenInbegrepen) {
    scope.included = scope.included.filter((line) => !SCREW_HOLE_FILLING_PATTERN.test(line));
    scope.excluded = scope.excluded.filter((line) => !SCREW_HOLE_FILLING_PATTERN.test(line));
    scope.included = unique([...scope.included, SCREW_HOLE_FILLING_INCLUDED_TEXT]);
  }

  if (scope.steigerInbegrepen) {
    scope.excluded = scope.excluded.filter((line) => !SCAFFOLD_PATTERN.test(line));
    scope.included = unique([...scope.included, SCAFFOLD_INCLUDED_TEXT]);
  }

  if (scope.sloopwerkInbegrepen) {
    scope.excluded = scope.excluded.filter((line) => !DEMOLITION_PATTERN.test(line));
    scope.included = unique([...scope.included, DEMOLITION_INCLUDED_TEXT]);
  }

  synchronizeToggleLists(scope);

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
  const hasDisabledToggle = !scope.afvalAfvoeren
    || !scope.electricalScope.enabled
    || !scope.schilderwerkInbegrepen
    || !scope.plamuurwerkInbegrepen
    || !scope.sloopwerkInbegrepen
    || !scope.nadenVullenInbegrepen
    || !scope.schroefgatenPlamurenInbegrepen;
  if (scope.excluded.length === 0 && hasDisabledToggle) errors.push('Niet inbegrepen mag niet leeg zijn.');
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
  const finishValidationText = [
    text(raw.title ?? raw.korteTitel),
    text(raw.summary ?? raw.context),
    ...rows(raw.work_scope),
    ...rows(raw.dimensions),
    ...rows(raw.included),
  ].join('\n')
    .replace(PAINTING_INCLUDED_TEXT, '')
    .replace(STUCCO_INCLUDED_TEXT, '');
  const generalFillingValidationText = scope.schroefgatenPlamurenInbegrepen
    ? finishValidationText.replace(new RegExp(SCREW_HOLE_FILLING_PATTERN.source, 'gi'), '')
    : finishValidationText;
  if (
    finishPattern
    && (
      (!scope.schilderwerkInbegrepen && PAINTING_PATTERN.test(finishValidationText))
      || (!scope.plamuurwerkInbegrepen && FILLING_PATTERN.test(generalFillingValidationText))
      || (!scope.nadenVullenInbegrepen && SEAM_FILLING_PATTERN.test(finishValidationText))
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
