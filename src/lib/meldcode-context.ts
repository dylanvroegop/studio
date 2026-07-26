export type MeldcodeApplication =
  | 'dakisolatie'
  | 'zolder-vliering'
  | 'vloerisolatie'
  | 'gevelisolatie'
  | 'spouwmuurisolatie'
  | 'onbekend';

export type MeldcodeMatchStatus = 'confirmed' | 'automatic' | 'unresolved';

export interface MeldcodeMaterialContext {
  key: string;
  name: string;
  quantity: number;
  unit: string;
  type: 'groot' | 'verbruik';
  meldcode?: string | null;
  meldcodeToepassing?: MeldcodeApplication | string | null;
  meldcodeStatus?: MeldcodeMatchStatus | string | null;
}

export interface MeldcodeCandidate {
  meldcode: string;
  merk: string;
  product: string;
  toepassing: MeldcodeApplication;
  toepassingLabel: string;
  minimaleDikteMm?: number;
  bron: 'RVO';
  bronUrl: string;
  matchReason: string;
}

export interface MeldcodeResolution {
  application: MeldcodeApplication;
  applicationLabel: string;
  context: string;
  status: MeldcodeMatchStatus;
  confidence: 'high' | 'medium' | 'low';
  candidates: MeldcodeCandidate[];
  selectedCandidate?: MeldcodeCandidate;
}

export const MELDCODE_APPLICATION_OPTIONS: Array<{
  value: MeldcodeApplication;
  label: string;
  description: string;
}> = [
  { value: 'dakisolatie', label: 'Dakisolatie', description: 'Op of aan een dak, zoals een garage- of aanbouwdak.' },
  { value: 'zolder-vliering', label: 'Zolder / vliering', description: 'Op de zoldervloer of vlieringvloer.' },
  { value: 'vloerisolatie', label: 'Vloer / bodem', description: 'Onder een vloer, op de begane grond of tegen de bodem.' },
  { value: 'gevelisolatie', label: 'Binnen- of buitengevel', description: 'Tegen een binnen- of buitengevel.' },
  { value: 'spouwmuurisolatie', label: 'Spouwmuur', description: 'In de spouw van een buitenmuur.' },
  { value: 'onbekend', label: 'Anders / niet zeker', description: 'Gebruik vrije tekst of laat de meldcode voorlopig open.' },
];

const RVO_ISOLATION_URL = 'https://www.rvo.nl/subsidies-financiering/isde/meldcodelijsten/isolatiematerialen';

// These are intentionally kept as source records, not inferred codes. The list can
// be expanded by the RVO import later without changing the quote workflow.
const KNOWN_CANDIDATES: MeldcodeCandidate[] = [
  {
    meldcode: 'KA27743',
    merk: 'IKO Insulations',
    product: 'IKO Enertherm ALU',
    toepassing: 'dakisolatie',
    toepassingLabel: 'Dakisolatie',
    minimaleDikteMm: 80,
    bron: 'RVO',
    bronUrl: `${RVO_ISOLATION_URL}?page=23`,
    matchReason: 'Productfamilie IKO Enertherm ALU en toepassing dakisolatie.',
  },
  {
    meldcode: 'KA25343',
    merk: 'IKO Insulations',
    product: 'IKO Enertherm ALU',
    toepassing: 'zolder-vliering',
    toepassingLabel: 'Zolder- of vlieringvloer',
    minimaleDikteMm: 80,
    bron: 'RVO',
    bronUrl: `${RVO_ISOLATION_URL}?page=9`,
    matchReason: 'Productfamilie IKO Enertherm ALU en toepassing zolder/vliering.',
  },
  {
    meldcode: 'KA18189',
    merk: 'IKO Insulations',
    product: 'Enertherm isolatie',
    toepassing: 'dakisolatie',
    toepassingLabel: 'Dakisolatie',
    minimaleDikteMm: 80,
    bron: 'RVO',
    bronUrl: `${RVO_ISOLATION_URL}?page=33`,
    matchReason: 'Algemene Enertherm-productfamilie en toepassing dakisolatie.',
  },
  {
    meldcode: 'KA18188',
    merk: 'IKO Insulations',
    product: 'Enertherm isolatie',
    toepassing: 'vloerisolatie',
    toepassingLabel: 'Vloerisolatie',
    minimaleDikteMm: 80,
    bron: 'RVO',
    bronUrl: `${RVO_ISOLATION_URL}?page=33`,
    matchReason: 'Algemene Enertherm-productfamilie en toepassing vloerisolatie.',
  },
  {
    meldcode: 'KA18187',
    merk: 'IKO Insulations',
    product: 'Enertherm isolatie',
    toepassing: 'gevelisolatie',
    toepassingLabel: 'Binnen- of buitengevelisolatie',
    minimaleDikteMm: 80,
    bron: 'RVO',
    bronUrl: `${RVO_ISOLATION_URL}?page=33`,
    matchReason: 'Algemene Enertherm-productfamilie en toepassing gevelisolatie.',
  },
];

function normalize(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function labelForApplication(value: MeldcodeApplication): string {
  return MELDCODE_APPLICATION_OPTIONS.find((option) => option.value === value)?.label || 'Onbekend';
}

export function isInsulationMaterial(value: unknown): boolean {
  const text = normalize(value);
  return /isolat|pir|eps|xps|glaswol|steenwol|rockwool|enertherm|kooltherm|isovlas|isobooster|unidek|therm/.test(text);
}

function containsAny(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value));
}

export function inferMeldcodeApplication(context: string, explicit?: MeldcodeApplication): {
  application: MeldcodeApplication;
  confidence: MeldcodeResolution['confidence'];
} {
  if (explicit && explicit !== 'onbekend') return { application: explicit, confidence: 'high' };

  const text = normalize(context);
  if (containsAny(text, ['spouw', 'spouwmuur'])) return { application: 'spouwmuurisolatie', confidence: 'high' };
  if (containsAny(text, ['zolder', 'vliering', 'vlieringvloer'])) return { application: 'zolder-vliering', confidence: 'high' };
  if (containsAny(text, ['dak', 'dakvlak', 'dakbeschot', 'hellend dak', 'plat dak'])) return { application: 'dakisolatie', confidence: 'high' };
  if (containsAny(text, ['vloer', 'bodem', 'begane grond', 'kruipruimte'])) return { application: 'vloerisolatie', confidence: 'high' };
  if (containsAny(text, ['gevel', 'muur', 'wand', 'buitenkant', 'binnenkant', 'buitenmuur'])) return { application: 'gevelisolatie', confidence: 'medium' };

  return { application: 'onbekend', confidence: 'low' };
}

function looksLikeAluEnertherm(product: string): boolean {
  const text = normalize(product);
  return text.includes('enertherm') && text.includes('alu');
}

export function findMeldcodeCandidates(product: string, application: MeldcodeApplication, context = ''): MeldcodeCandidate[] {
  const normalizedProduct = normalize(product);
  if (!isInsulationMaterial(product)) return [];

  const productCandidates = KNOWN_CANDIDATES.filter((candidate) => {
    const candidateProduct = normalize(candidate.product);
    if (!normalizedProduct.includes('enertherm') || !candidateProduct.includes('enertherm')) return false;
    if (looksLikeAluEnertherm(product) && !candidateProduct.includes('alu')) return false;
    if (!looksLikeAluEnertherm(product) && candidateProduct.includes('alu')) return false;
    return candidate.toepassing === application;
  });

  // If the context was too vague, return all product-family candidates so the UI
  // can offer the user a clear choice instead of silently selecting a code.
  if (application === 'onbekend') {
    return KNOWN_CANDIDATES.filter((candidate) => {
      const candidateProduct = normalize(candidate.product);
      return normalizedProduct.includes('enertherm')
        && candidateProduct.includes('enertherm')
        && (looksLikeAluEnertherm(product) ? candidateProduct.includes('alu') : !candidateProduct.includes('alu'));
    });
  }

  return productCandidates.map((candidate) => ({
    ...candidate,
    matchReason: `${candidate.matchReason}${context.trim() ? ' Context uit offerte gebruikt.' : ''}`,
  }));
}

export function resolveMeldcode(
  product: string,
  context: string,
  explicitApplication?: MeldcodeApplication,
): MeldcodeResolution {
  const inferred = inferMeldcodeApplication(context, explicitApplication);
  const candidates = findMeldcodeCandidates(product, inferred.application, context);
  const selectedCandidate = candidates.length === 1 && inferred.confidence !== 'low' ? candidates[0] : undefined;

  return {
    application: inferred.application,
    applicationLabel: labelForApplication(inferred.application),
    context: context.trim(),
    status: selectedCandidate ? 'automatic' : 'unresolved',
    confidence: selectedCandidate ? inferred.confidence : 'low',
    candidates,
    selectedCandidate,
  };
}

export function buildMeldcodeMaterialContextText(
  material: Pick<MeldcodeMaterialContext, 'name' | 'quantity' | 'unit'>,
  additionalContext: string,
): string {
  return [
    `Materiaal: ${material.name}`,
    `Hoeveelheid: ${material.quantity} ${material.unit}`,
    additionalContext.trim(),
  ].filter(Boolean).join('\n');
}
