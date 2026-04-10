import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  flattenStructuredWorkDescription,
  sanitizeWorkDescriptionStructured,
  toStructuredWorkDescription,
  type WorkDescriptionStructured,
} from '@/lib/quote-calculations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AiAction = 'full' | 'uitvoering-only' | 'improve';
type MaterialContextItem = {
  name: string;
  quantity: number;
  unit: string;
  type: 'groot' | 'verbruik' | 'unknown';
  shortLabel: string;
};
type WorkDescriptionScope = {
  jobType: string;
  mainObject: string;
  location: string;
  primaryActions: string[];
  secondaryActions: string[];
  finishActions: string[];
  relevantPreparation: string[];
  relevantMaterials: string[];
  constraintsOrUnknowns: string[];
  customerVisibleScope: string[];
};

const DEFAULT_OPENAI_MODEL = 'gpt-5.2';
const OPENAI_SYSTEM_PROMPT = `
Je bent een Nederlandse werkvoorbereider voor klantgerichte offertes in timmer/bouw.
Schrijf de werkbeschrijving zoals een vakman in een offerte: kort, concreet, technisch geloofwaardig.
Geen chatbottaal, geen zachte uitleg, geen opvulling.
Schrijf compacte actieregels met duidelijke werkwoorden (demonteren, uitmeten, op maat maken, plaatsen, bevestigen, herstellen, afdichten, afwerken).
Vermijd herhaling en vermijd standaardzinnen als "We stemmen af", "We zorgen voor", "zodat we weten wat...".
Vermijd overdreven toelichting, tenzij commercieel of technisch echt nodig.
Schrijf klantvriendelijk en professioneel, maar direct.
Gebruik alleen relevante info uit de input.
`;
const MATERIAL_TOKEN_STOPWORDS = new Set([
  'de', 'het', 'een', 'en', 'van', 'voor', 'met', 'op', 'aan', 'in', 'tot', 'bij',
  'stuk', 'stuks', 'mm', 'cm', 'm', 'meter', 'plaat', 'platen', 'materiaal', 'materialen',
  'fsc', 'mix', 'wit', 'gegrond', 'exterieur', 'interieur',
]);
const GENERIC_FILLER_PATTERN = /\b(we zorgen voor|we controleren|we stemmen( met u)? af|zodat|waar nodig|indien nodig)\b/i;

const EMPTY_SCOPE: WorkDescriptionScope = {
  jobType: '',
  mainObject: '',
  location: '',
  primaryActions: [],
  secondaryActions: [],
  finishActions: [],
  relevantPreparation: [],
  relevantMaterials: [],
  constraintsOrUnknowns: [],
  customerVisibleScope: [],
};

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function normalizeAction(value: unknown): AiAction | null {
  if (value === 'full' || value === 'uitvoering-only' || value === 'improve') return value;
  return null;
}

function hasStructuredContent(value: WorkDescriptionStructured): boolean {
  return Boolean(
    value.title
    || value.context
    || value.sections.voorbereiding.length > 0
    || value.sections.uitvoering.length > 0
    || value.sections.afwerking.length > 0
    || (value.legacyNotes?.length || 0) > 0
  );
}

function buildActionPrompt(input: {
  action: AiAction | null;
  title: string;
  context: string;
  category: string;
  materialContext: MaterialContextItem[];
  notesContext: string;
  measurementsContext: string;
}): string {
  const titleLine = input.title ? `Titel: ${input.title}` : '';
  const contextLine = input.context ? `Context: ${input.context}` : '';
  const categoryLine = input.category ? `Categorie: ${input.category}` : '';
  const materialLines = input.materialContext.length > 0
    ? [
      'Verplichte materialen (deze moeten expliciet terugkomen in de werkbeschrijving):',
      ...input.materialContext.map((item) => `- ${item.name} (${item.quantity} ${item.unit}, type: ${item.type})`),
      'Als materialen zijn opgegeven, noem ze concreet in de stappen.',
    ]
    : [];
  const notesLines = input.notesContext
    ? [
      'Notities van gebruiker (gebruik deze context actief, inclusief maten/afmetingen):',
      input.notesContext,
    ]
    : [];
  const measurementsLines = input.measurementsContext
    ? [
      'Beschikbare maatvoering uit offerte-data (gebruik waar relevant):',
      input.measurementsContext,
    ]
    : [];

  if (input.action === 'uitvoering-only') {
    return [
      'Vul alleen de uitvoeringsstappen voor deze werkbeschrijving.',
      titleLine,
      contextLine,
      categoryLine,
      ...materialLines,
      ...notesLines,
      ...measurementsLines,
      'Schrijf kort en concreet in offerte-stijl, zonder opvulzinnen.',
    ].filter(Boolean).join('\n');
  }

  if (input.action === 'improve') {
    return [
      'Verbeter de bestaande werkbeschrijving naar korte, concrete offertetaal van een vakman.',
      titleLine,
      contextLine,
      categoryLine,
      ...materialLines,
      ...notesLines,
      ...measurementsLines,
      'Schrap vage of herhalende tekst; behoud alleen relevante, uitvoerbare stappen.',
    ].filter(Boolean).join('\n');
  }

  return [
    'Genereer een volledige werkbeschrijving met voorbereiding, uitvoering en afwerking.',
    titleLine,
    contextLine,
    categoryLine,
    ...materialLines,
    ...notesLines,
    ...measurementsLines,
    'Gebruik deze structuur: voorbereiding 2-4 stappen, uitvoering 3-6 stappen, afwerking 2-4 stappen.',
    'Noem materialen op het moment dat ze worden toegepast in uitvoering; voeg geen losse checklist-regel toe.',
    'Gebruik geen wollige zinnen, geen uitlegstijl, geen lege formuleringen.',
    'Geef output als korte, duidelijke stappen in het Nederlands.',
  ].filter(Boolean).join('\n');
}

function buildScopeExtractionPrompt(input: {
  action: AiAction | null;
  title: string;
  context: string;
  category: string;
  notesContext: string;
  measurementsContext: string;
  materialContext: MaterialContextItem[];
  baseStructured: WorkDescriptionStructured;
}): string {
  const materialLines = input.materialContext.length > 0
    ? input.materialContext.map((item) => `- ${item.shortLabel} (${item.quantity} ${item.unit})`)
    : ['- geen expliciete materialen meegegeven'];

  return [
    'Stap 1: Extraheer de echte klus-scope uit de context voor een Nederlandse offerte.',
    `Actie: ${input.action || 'full'}`,
    input.title ? `Titel: ${input.title}` : '',
    input.context ? `Korte context: ${input.context}` : '',
    input.category ? `Categorie: ${input.category}` : '',
    input.notesContext ? `Notities: ${input.notesContext}` : '',
    input.measurementsContext ? `Maatvoering: ${input.measurementsContext}` : '',
    'Materiaalcontext (reeds opgeschoond):',
    ...materialLines,
    'Bestaande werkbeschrijving (indien aanwezig):',
    JSON.stringify(input.baseStructured),
    '',
    'Regels:',
    '- Gebruik geen leveranciersnamen, merktaal, SKU-achtige labels of complete producttitels.',
    '- Vermijd maten in relevantMaterials, tenzij die maat essentieel is voor de scope.',
    '- Neem alleen scope op die klant zichtbaar of commercieel relevant is.',
    '- Houd entries compact en concreet.',
    '',
    'Geef uitsluitend JSON terug in exact dit formaat:',
    '{"scope":{"jobType":"","mainObject":"","location":"","primaryActions":[],"secondaryActions":[],"finishActions":[],"relevantPreparation":[],"relevantMaterials":[],"constraintsOrUnknowns":[],"customerVisibleScope":[]}}',
  ].filter(Boolean).join('\n');
}

function buildWriteFromScopePrompt(input: {
  action: AiAction | null;
  scope: WorkDescriptionScope;
  baseStructured: WorkDescriptionStructured;
}): string {
  const actionRule =
    input.action === 'uitvoering-only'
      ? 'Werk alleen uitvoering bij.'
      : input.action === 'improve'
        ? 'Verbeter bestaande tekst op basis van scope.'
        : 'Schrijf volledige werkbeschrijving.';

  return [
    'Stap 2: Schrijf offerteklare werkbeschrijving vanuit de scope.',
    actionRule,
    '',
    'Scope JSON:',
    JSON.stringify(input.scope),
    '',
    'Bestaande werkbeschrijving JSON:',
    JSON.stringify(input.baseStructured),
    '',
    'Schrijfregels:',
    '- Nederlands, kort, vakmatig, offerte-geschikt.',
    '- Geen chatbottaal, geen uitlegstijl, geen zachte opvulling.',
    '- Vermijd: "we zorgen voor", "we controleren", "we stemmen af", "zodat", "waar nodig", "indien nodig".',
    '- Geen leveranciersachtige materiaalregels; gebruik generieke materiaaltaal.',
    '- Titel 2-6 woorden.',
    '- Samenvatting 1 korte zin.',
    '- Voorbereiding 2-4 regels, uitvoering 3-6 regels, afwerking 2-4 regels (bij full).',
    '- Elke regel moet zelfstandig waarde hebben voor offertescope.',
    '',
    'Geef uitsluitend JSON terug in exact dit formaat:',
    '{"werkbeschrijvingStructured":{"title":"","context":"","sections":{"voorbereiding":[],"uitvoering":[],"afwerking":[]}}}',
    'Geen markdown, geen extra tekst.',
  ].join('\n');
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeArrayOfStrings(value: unknown, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, max);
}

function normalizeScope(value: unknown): WorkDescriptionScope {
  if (!value || typeof value !== 'object') return { ...EMPTY_SCOPE };
  const row = value as Record<string, unknown>;
  return {
    jobType: safeString(row.jobType),
    mainObject: safeString(row.mainObject),
    location: safeString(row.location),
    primaryActions: normalizeArrayOfStrings(row.primaryActions, 10),
    secondaryActions: normalizeArrayOfStrings(row.secondaryActions, 10),
    finishActions: normalizeArrayOfStrings(row.finishActions, 10),
    relevantPreparation: normalizeArrayOfStrings(row.relevantPreparation, 10),
    relevantMaterials: normalizeArrayOfStrings(row.relevantMaterials, 10),
    constraintsOrUnknowns: normalizeArrayOfStrings(row.constraintsOrUnknowns, 10),
    customerVisibleScope: normalizeArrayOfStrings(row.customerVisibleScope, 10),
  };
}

function hasScopeContent(scope: WorkDescriptionScope): boolean {
  return Boolean(
    scope.jobType
    || scope.mainObject
    || scope.location
    || scope.primaryActions.length
    || scope.secondaryActions.length
    || scope.finishActions.length
    || scope.relevantPreparation.length
    || scope.relevantMaterials.length
    || scope.customerVisibleScope.length
  );
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

  return chunks.join('\n').trim();
}

function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function parseJsonWithFallback(rawOutput: string): Record<string, unknown> {
  const cleaned = stripCodeFences(rawOutput);
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const firstCurly = cleaned.indexOf('{');
    const lastCurly = cleaned.lastIndexOf('}');
    if (firstCurly !== -1 && lastCurly > firstCurly) {
      return JSON.parse(cleaned.slice(firstCurly, lastCurly + 1)) as Record<string, unknown>;
    }
    throw new Error('OpenAI output bevat geen geldig JSON-object.');
  }
}

async function callOpenAiJson(params: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<Record<string, unknown>> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0.1,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: params.systemPrompt }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: params.userPrompt }],
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

  return parseJsonWithFallback(outputText);
}

function normalizeMaterialContext(input: unknown): MaterialContextItem[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const item = row as Record<string, unknown>;
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      if (!name) return null;
      const quantityRaw = Number(item.quantity);
      const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Number(quantityRaw.toFixed(3)) : 1;
      const unit = typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim() : 'stuk';
      const typeRaw = typeof item.type === 'string' ? item.type.trim().toLowerCase() : '';
      const type: MaterialContextItem['type'] =
        typeRaw === 'groot' || typeRaw === 'verbruik' ? typeRaw : 'unknown';
      const shortLabel = toGenericMaterialLabel(name);
      return { name, quantity, unit, type, shortLabel };
    })
    .filter((item): item is MaterialContextItem => item !== null);
}

function toGenericMaterialLabel(name: string): string {
  const raw = normalizeForMatch(name);
  if (!raw) return 'nieuw materiaal';
  if (/\bboeideel|boeidelen\b/.test(raw)) return 'nieuwe boeidelen';
  if (/\bisolat/i.test(raw)) return 'isolatiemateriaal';
  if (/\bgips\b/.test(raw)) return 'gipsplaten';
  if (/\bkozijn\b/.test(raw)) return 'kozijnonderdelen';
  if (/\blat|regelwerk|houtregel\b/.test(raw)) return 'regelwerk';
  if (/\bkit\b/.test(raw)) return 'kitmateriaal';
  if (/\bschroef|bevestig|plug\b/.test(raw)) return 'bevestigingsmateriaal';
  if (/\bmultiplex|plaat|mdf|okoume\b/.test(raw)) return 'plaatmateriaal';
  return 'nieuw materiaal';
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9x]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitMatchTokens(value: string): string[] {
  return normalizeForMatch(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !MATERIAL_TOKEN_STOPWORDS.has(token));
}

function tokenLooksSimilar(token: string, candidate: string): boolean {
  if (!token || !candidate) return false;
  if (token === candidate) return true;
  if (token.length >= 4 && (candidate.includes(token) || token.includes(candidate))) return true;
  if (token.length >= 6 && candidate.length >= 6 && token.slice(0, 5) === candidate.slice(0, 5)) return true;
  return false;
}

function rowMentionsMaterial(row: string, materialName: string): boolean {
  const rowTokens = splitMatchTokens(row);
  const materialTokens = splitMatchTokens(materialName);
  if (materialTokens.length === 0 || rowTokens.length === 0) return false;

  let matches = 0;
  materialTokens.forEach((token) => {
    const hasMatch = rowTokens.some((rowToken) => tokenLooksSimilar(token, rowToken));
    if (hasMatch) matches += 1;
  });

  const coverage = matches / materialTokens.length;
  if (materialTokens.length <= 2) return coverage >= 0.5;
  return coverage >= 0.6;
}

function findMaterialInsertionIndex(rows: string[]): number {
  const closingStepIndex = rows.findIndex((row) =>
    /\b(afwerken|opleveren|afvoeren|schoon|eindcontrole|nacontrole)\b/i.test(row)
  );
  if (closingStepIndex >= 0) return closingStepIndex;
  return rows.length;
}

function enforceSectionDistribution(
  structuredInput: WorkDescriptionStructured,
  action: AiAction | null,
): WorkDescriptionStructured {
  if (action === 'uitvoering-only') return sanitizeWorkDescriptionStructured(structuredInput);

  const structured = sanitizeWorkDescriptionStructured(structuredInput);
  const sections = {
    voorbereiding: [...structured.sections.voorbereiding],
    uitvoering: [...structured.sections.uitvoering],
    afwerking: [...structured.sections.afwerking],
  };

  if (sections.voorbereiding.length === 0) {
    const fromExecution = sections.uitvoering.findIndex((row) =>
      /\b(voorbereiden|voorbereiding|afzetten|afdekken|inmeten|uitlijnen|controle)\b/i.test(row)
    );
    if (fromExecution >= 0) {
      const [moved] = sections.uitvoering.splice(fromExecution, 1);
      sections.voorbereiding.push(moved);
    }
  }

  if (sections.afwerking.length === 0) {
    const fromExecution = sections.uitvoering.findIndex((row) =>
      /\b(afwerken|kitten|schuren|opleveren|afvoeren|schoon|eindcontrole)\b/i.test(row)
    );
    if (fromExecution >= 0) {
      const [moved] = sections.uitvoering.splice(fromExecution, 1);
      sections.afwerking.push(moved);
    }
  }

  if (sections.voorbereiding.length === 0) {
    sections.voorbereiding.push('Werkplek voorbereiden, maatvoering controleren en benodigde materialen en PBM gereedzetten.');
  }

  if (sections.afwerking.length === 0) {
    sections.afwerking.push('Werkplek schoon opleveren, restmateriaal afvoeren en uitgevoerde werkzaamheden controleren.');
  }

  return {
    ...structured,
    sections,
  };
}

function cleanWorkDescriptionTitle(input: string): string {
  const compact = String(input || '')
    .replace(/[.:;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return 'Werkzaamheden uitvoeren';
  const words = compact.split(' ').filter(Boolean).slice(0, 6);
  if (words.length < 2) return `${words[0]} werkzaamheden`;
  return words.join(' ');
}

function cleanWorkDescriptionSummary(input: string): string {
  const compact = String(input || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return '';
  const firstSentence = compact.split(/[.!?]/)[0]?.trim() || compact;
  return firstSentence.replace(/[;:]+$/g, '').trim();
}

function toSentenceCase(input: string): string {
  if (!input) return input;
  return input.charAt(0).toUpperCase() + input.slice(1);
}

function cleanWorkDescriptionLine(input: string): string {
  let line = String(input || '')
    .replace(/^[-*•\d)\].\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!line) return '';

  line = line
    .replace(/^we\s+/i, '')
    .replace(/^wij\s+/i, '')
    .replace(/^we\s+(zorgen|controleren|stemmen).+$/i, '')
    .replace(/\b(waar|indien)\s+nodig\b/gi, '')
    .replace(/\s*,?\s*zodat\b.+$/i, '')
    .replace(/\s*,?\s*waarbij\b.+$/i, '')
    .replace(/\bnetjes\b/gi, '')
    .replace(/\bzorgvuldig\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/[;:]+$/g, '')
    .trim();

  if (!line) return '';
  if (GENERIC_FILLER_PATTERN.test(line)) return '';
  line = stripSupplierStyleMaterialText(line);
  if (!line) return '';

  if (line.length > 170) {
    const splitOn = ['; ', ', '];
    for (const splitter of splitOn) {
      const index = line.indexOf(splitter);
      if (index > 60) {
        line = line.slice(0, index).trim();
        break;
      }
    }
  }

  if (line.length > 120) {
    const clauseIndex = line.search(/\b(en|maar|terwijl)\b/i);
    if (clauseIndex > 50) {
      line = line.slice(0, clauseIndex).trim();
    } else {
      line = line.slice(0, 120).trim();
    }
  }

  return toSentenceCase(line);
}

function stripSupplierStyleMaterialText(line: string): string {
  let next = line;

  next = next
    .replace(/\b\d{2,4}\s*x\s*\d{2,4}(\s*x\s*\d{1,3})?\s*(mm|cm|m)?\b/gi, '')
    .replace(/\b(fsc|mix\s*\d+%?|exterieur|interieur|verlijmd|gegrond|watervast)\b/gi, '')
    .replace(/\b(okoume|multiplexplaat|multiplex)\b/gi, 'plaatmateriaal')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();

  const tokenCount = next.split(' ').filter(Boolean).length;
  if (tokenCount > 16 && /\bplaatmateriaal\b/i.test(next)) {
    next = next.split(' ').slice(0, 12).join(' ').trim();
  }

  return next.replace(/[;:,.]+$/g, '').trim();
}

function stripSteigerMentions(line: string): string {
  let next = line
    .replace(/\bsteiger(s)?\b/gi, '')
    .replace(/\(\s*\/?\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();

  next = next
    .replace(/^(Gebruik|Plaatsen|Monteren|Regelen)\s+(van\s+)?$/i, '')
    .replace(/[;:,.]+$/g, '')
    .trim();

  return next;
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const seenTokens: string[][] = [];
  lines.forEach((line) => {
    const key = normalizeForMatch(line);
    if (!key || seen.has(key)) return;
    const tokens = key.split(' ').filter(Boolean);
    const nearDuplicate = seenTokens.some((existing) => {
      const overlap = existing.filter((token) => tokens.includes(token)).length;
      const baseline = Math.max(existing.length, tokens.length, 1);
      return overlap / baseline >= 0.8;
    });
    if (nearDuplicate) return;
    seen.add(key);
    seenTokens.push(tokens);
    result.push(line);
  });
  return result;
}

function postProcessWorkDescription(
  structuredInput: WorkDescriptionStructured,
  action: AiAction | null,
  options?: { allowSteigerMention?: boolean },
): WorkDescriptionStructured {
  const structured = sanitizeWorkDescriptionStructured(structuredInput);
  const allowSteigerMention = Boolean(options?.allowSteigerMention);
  const cleanupLines = (rows: string[]): string[] =>
    rows
      .map(cleanWorkDescriptionLine)
      .map((line) => (allowSteigerMention ? line : stripSteigerMentions(line)))
      .filter(Boolean);
  const cleaned = {
    voorbereiding: dedupeLines(cleanupLines(structured.sections.voorbereiding)).slice(0, 4),
    uitvoering: dedupeLines(cleanupLines(structured.sections.uitvoering)).slice(0, 6),
    afwerking: dedupeLines(cleanupLines(structured.sections.afwerking)).slice(0, 4),
  };

  if (action === 'full') {
    if (cleaned.voorbereiding.length < 2) {
      cleaned.voorbereiding = [
        ...cleaned.voorbereiding,
        'Bestaande situatie opnemen en maatvoering controleren',
        'Ondergrond en aansluitingen beoordelen op montagepunten',
      ].slice(0, 4);
    }
    if (cleaned.uitvoering.length < 3) {
      cleaned.uitvoering = [
        ...cleaned.uitvoering,
        'Bestaande onderdelen zorgvuldig demonteren',
        'Nieuwe onderdelen op maat maken en passend plaatsen',
        'Aansluitingen en bevestigingen netjes afwerken',
      ].slice(0, 6);
    }
    if (cleaned.afwerking.length < 2) {
      cleaned.afwerking = [
        ...cleaned.afwerking,
        'Naden, aansluitingen en bevestigingen nalopen',
        'Werkplek opruimen en afval afvoeren',
      ].slice(0, 4);
    }
  }

  return {
    ...structured,
    title: cleanWorkDescriptionTitle(structured.title),
    context: cleanWorkDescriptionSummary(structured.context),
    sections: cleaned,
  };
}

function ensureMaterialsIncluded(
  structuredInput: WorkDescriptionStructured,
  materialContext: MaterialContextItem[],
): WorkDescriptionStructured {
  if (materialContext.length === 0) return structuredInput;

  const structured = sanitizeWorkDescriptionStructured(structuredInput);
  const allRows = flattenStructuredWorkDescription(structured);

  const missing = materialContext.filter((item) => {
    return !allRows.some((row) => rowMentionsMaterial(row, item.shortLabel) || rowMentionsMaterial(row, item.name));
  });

  if (missing.length === 0) return structured;

  const nextUitvoering = [...structured.sections.uitvoering];
  const insertAt = findMaterialInsertionIndex(nextUitvoering);
  const materialRows = missing.map((item) => `Plaatsen en verwerken van ${item.shortLabel}.`);
  nextUitvoering.splice(insertAt, 0, ...materialRows);

  return {
    ...structured,
    sections: {
      ...structured.sections,
      uitvoering: nextUitvoering,
    },
  };
}

function extractAiOutput(result: unknown): string | null {
  if (typeof result === 'string' && result.trim()) return result.trim();
  if (!result || typeof result !== 'object') return null;

  const row = result as {
    output?: unknown;
    text?: unknown;
    description?: unknown;
    werkbeschrijving?: unknown;
    content?: unknown;
    data?: unknown;
  };

  const directCandidates = [
    row.output,
    row.text,
    row.description,
    row.werkbeschrijving,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  const contentObject =
    row.content && typeof row.content === 'object'
      ? row.content as { parts?: Array<{ text?: unknown }> }
      : null;
  const firstPart = Array.isArray(contentObject?.parts) ? contentObject.parts[0] : null;
  if (firstPart && typeof firstPart.text === 'string' && firstPart.text.trim()) {
    return firstPart.text.trim();
  }

  if (row.data && typeof row.data === 'object') {
    const nested = extractAiOutput(row.data);
    if (nested) return nested;
  }

  return null;
}

function normalizeWerkbeschrijvingItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        const row = item as { stap?: unknown; text?: unknown; description?: unknown };
        if (typeof row.stap === 'string' && row.stap.trim()) return row.stap.trim();
        if (typeof row.text === 'string' && row.text.trim()) return row.text.trim();
        if (typeof row.description === 'string' && row.description.trim()) return row.description.trim();
      }
      return '';
    })
    .filter(Boolean);
}

function extractDirectWerkbeschrijving(result: unknown): string[] {
  if (!result || typeof result !== 'object') return [];

  const row = result as { werkbeschrijving?: unknown; output?: unknown };

  const direct = normalizeWerkbeschrijvingItems(row.werkbeschrijving);
  if (direct.length > 0) return direct;

  if (typeof row.output === 'string' && row.output.trim()) {
    try {
      const parsed = JSON.parse(row.output) as { werkbeschrijving?: unknown };
      const fromOutput = normalizeWerkbeschrijvingItems(parsed.werkbeschrijving);
      if (fromOutput.length > 0) return fromOutput;
    } catch {
      // ignore
    }
  }

  return [];
}

function extractDirectStructured(result: unknown): WorkDescriptionStructured | null {
  if (!result || typeof result !== 'object') return null;

  const row = result as {
    werkbeschrijving_structured?: unknown;
    werkbeschrijvingStructured?: unknown;
    output?: unknown;
  };

  const directCandidate = row.werkbeschrijving_structured ?? row.werkbeschrijvingStructured;
  if (directCandidate) {
    const structured = sanitizeWorkDescriptionStructured(directCandidate);
    if (hasStructuredContent(structured)) return structured;
  }

  const hasDutchShape =
    typeof (row as { hoofdtitel?: unknown }).hoofdtitel === 'string'
    || typeof (row as { samenvatting?: unknown }).samenvatting === 'string'
    || Array.isArray((row as { voorbereiding?: unknown }).voorbereiding)
    || Array.isArray((row as { uitvoering?: unknown }).uitvoering)
    || Array.isArray((row as { afwerking?: unknown }).afwerking);
  if (hasDutchShape) {
    const structured = sanitizeWorkDescriptionStructured({
      title: (row as { hoofdtitel?: unknown; title?: unknown }).hoofdtitel ?? (row as { title?: unknown }).title,
      context: (row as { samenvatting?: unknown; context?: unknown }).samenvatting ?? (row as { context?: unknown }).context,
      sections: {
        voorbereiding: (row as { voorbereiding?: unknown }).voorbereiding,
        uitvoering: (row as { uitvoering?: unknown }).uitvoering,
        afwerking: (row as { afwerking?: unknown }).afwerking,
      },
    });
    if (hasStructuredContent(structured)) return structured;
  }

  if (typeof row.output === 'string' && row.output.trim()) {
    try {
      const parsed = JSON.parse(row.output) as {
        werkbeschrijving_structured?: unknown;
        werkbeschrijvingStructured?: unknown;
        hoofdtitel?: unknown;
        samenvatting?: unknown;
        voorbereiding?: unknown;
        uitvoering?: unknown;
        afwerking?: unknown;
      };
      const candidate = parsed.werkbeschrijving_structured ?? parsed.werkbeschrijvingStructured;
      const structured = candidate
        ? sanitizeWorkDescriptionStructured(candidate)
        : sanitizeWorkDescriptionStructured({
          title: parsed.hoofdtitel,
          context: parsed.samenvatting,
          sections: {
            voorbereiding: parsed.voorbereiding,
            uitvoering: parsed.uitvoering,
            afwerking: parsed.afwerking,
          },
        });
      if (hasStructuredContent(structured)) return structured;
    } catch {
      // ignore
    }
  }

  return null;
}

function toLines(text: string): string[] {
  const normalized = text.replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  return normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•\d)\].\s]+/, '').trim())
    .filter(Boolean);
}

function parseWorkDescription(output: string): string[] {
  const directLines = toLines(output);
  if (directLines.length > 1) return directLines;

  try {
    const parsed = JSON.parse(output) as {
      werkbeschrijving?: unknown;
      description?: unknown;
      text?: unknown;
      output?: unknown;
    };
    const candidate = parsed.werkbeschrijving ?? parsed.description ?? parsed.text ?? parsed.output;
    if (Array.isArray(candidate)) {
      return candidate
        .map((row) => String(row || '').trim())
        .filter(Boolean);
    }
    if (typeof candidate === 'string') {
      const lines = toLines(candidate);
      if (lines.length > 0) return lines;
    }
  } catch {
    // ignore invalid JSON and keep fallback below
  }

  return directLines.length > 0 ? directLines : [output.trim()];
}

function mergeStructuredFromRows(params: {
  action: AiAction | null;
  base: WorkDescriptionStructured;
  rows: string[];
}): WorkDescriptionStructured {
  const cleanedRows = params.rows.map((row) => row.trim()).filter(Boolean);
  const base = sanitizeWorkDescriptionStructured(params.base);

  if (params.action === 'uitvoering-only') {
    return {
      ...base,
      sections: {
        ...base.sections,
        uitvoering: cleanedRows,
      },
    };
  }

  const inferred = toStructuredWorkDescription({
    werkbeschrijving: cleanedRows,
    korteTitel: base.title,
    korteBeschrijving: base.context,
  });

  return {
    ...inferred,
    title: inferred.title || base.title,
    context: inferred.context || base.context,
  };
}

function mergeStructuredFromStructured(params: {
  action: AiAction | null;
  base: WorkDescriptionStructured;
  generated: WorkDescriptionStructured;
}): WorkDescriptionStructured {
  const base = sanitizeWorkDescriptionStructured(params.base);
  const generated = sanitizeWorkDescriptionStructured(params.generated);

  if (params.action === 'uitvoering-only') {
    const uitvoerRows = generated.sections.uitvoering.length > 0
      ? generated.sections.uitvoering
      : flattenStructuredWorkDescription(generated);

    return {
      ...base,
      sections: {
        ...base.sections,
        uitvoering: uitvoerRows,
      },
    };
  }

  return {
    ...generated,
    title: generated.title || base.title,
    context: generated.context || base.context,
  };
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { auth } = initFirebaseAdmin();
    let userId = '';
    try {
      const decoded = await auth.verifyIdToken(token);
      userId = decoded.uid;
      const trialBlockedResponse = await ensureDemoTrialActiveByUid(decoded.uid);
      if (trialBlockedResponse) return trialBlockedResponse;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const rawBody = await request.json().catch(() => null) as {
      prompt?: unknown;
      quoteId?: unknown;
      action?: unknown;
      structuredInput?: unknown;
      title?: unknown;
      context?: unknown;
      category?: unknown;
      targetSection?: unknown;
      materialContext?: unknown;
      notesContext?: unknown;
      measurementsContext?: unknown;
    } | null;

    const action = normalizeAction(rawBody?.action);
    const quoteId = typeof rawBody?.quoteId === 'string' ? rawBody.quoteId.trim() : '';
    const title = typeof rawBody?.title === 'string' ? rawBody.title.trim() : '';
    const context = typeof rawBody?.context === 'string' ? rawBody.context.trim() : '';
    const category = typeof rawBody?.category === 'string' ? rawBody.category.trim() : '';
    const notesContext = typeof rawBody?.notesContext === 'string' ? rawBody.notesContext.trim() : '';
    const measurementsContext = typeof rawBody?.measurementsContext === 'string' ? rawBody.measurementsContext.trim() : '';

    const materialContext = normalizeMaterialContext(rawBody?.materialContext);

    const explicitPrompt = typeof rawBody?.prompt === 'string' ? rawBody.prompt.trim() : '';
    const fallbackPrompt = buildActionPrompt({
      action,
      title,
      context,
      category,
      materialContext,
      notesContext,
      measurementsContext,
    });
    const prompt = explicitPrompt || fallbackPrompt;
    const steigerContext = [
      explicitPrompt,
      title,
      context,
      category,
      notesContext,
      measurementsContext,
      ...materialContext.map((item) => item.name),
    ].join('\n').toLowerCase();
    const allowSteigerMention = /\bsteiger(s)?\b/.test(steigerContext);

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is verplicht.' }, { status: 400 });
    }

    const baseStructured = toStructuredWorkDescription({
      werkbeschrijving_structured: rawBody?.structuredInput,
      korteTitel: title,
      korteBeschrijving: context,
    });

    const apiKey = safeString(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY ontbreekt op de server.' }, { status: 500 });
    }

    const model = safeString(process.env.OPENAI_WORK_DESCRIPTION_MODEL) || DEFAULT_OPENAI_MODEL;
    const scopeExtractionPrompt = buildScopeExtractionPrompt({
      action,
      title,
      context,
      category,
      notesContext,
      measurementsContext,
      materialContext,
      baseStructured,
    });
    const scopePayload = await callOpenAiJson({
      apiKey,
      model,
      systemPrompt: OPENAI_SYSTEM_PROMPT,
      userPrompt: scopeExtractionPrompt,
    });
    const extractedScope = normalizeScope((scopePayload as { scope?: unknown }).scope ?? scopePayload);
    const fallbackScope: WorkDescriptionScope = {
      ...EMPTY_SCOPE,
      jobType: category,
      mainObject: title || context,
      primaryActions: action === 'uitvoering-only' ? ['uitvoering uitwerken'] : [],
      relevantMaterials: materialContext.map((item) => item.shortLabel),
      customerVisibleScope: context ? [context] : [],
    };
    const scope = hasScopeContent(extractedScope) ? extractedScope : fallbackScope;

    const writePrompt = buildWriteFromScopePrompt({
      action,
      scope,
      baseStructured,
    });
    const result = await callOpenAiJson({
      apiKey,
      model,
      systemPrompt: OPENAI_SYSTEM_PROMPT,
      userPrompt: writePrompt,
    });

    const directStructured = extractDirectStructured(result);
    if (directStructured) {
      const mergedStructured = mergeStructuredFromStructured({
        action,
        base: baseStructured,
        generated: directStructured,
      });
      const balanced = enforceSectionDistribution(mergedStructured, action);
      const mergedWithMaterials = ensureMaterialsIncluded(balanced, materialContext);
      const polished = postProcessWorkDescription(mergedWithMaterials, action, { allowSteigerMention });
      const flattened = flattenStructuredWorkDescription(polished);
      if (quoteId) {
        await persistWorkDescription(quoteId, userId, flattened, polished);
      }
      return NextResponse.json({
        werkbeschrijving: flattened,
        werkbeschrijvingStructured: polished,
      });
    }

    const directWerkbeschrijving = extractDirectWerkbeschrijving(result);
    if (directWerkbeschrijving.length > 0) {
      const mergedStructured = mergeStructuredFromRows({
        action,
        base: baseStructured,
        rows: directWerkbeschrijving,
      });
      const balanced = enforceSectionDistribution(mergedStructured, action);
      const mergedWithMaterials = ensureMaterialsIncluded(balanced, materialContext);
      const polished = postProcessWorkDescription(mergedWithMaterials, action, { allowSteigerMention });
      const flattened = flattenStructuredWorkDescription(polished);
      if (quoteId) {
        await persistWorkDescription(quoteId, userId, flattened, polished);
      }
      return NextResponse.json({
        werkbeschrijving: flattened,
        werkbeschrijvingStructured: polished,
      });
    }

    const aiOutput = extractAiOutput(result);
    if (!aiOutput) {
      return NextResponse.json({ error: 'Geen output ontvangen van OpenAI.' }, { status: 502 });
    }

    const werkbeschrijving = parseWorkDescription(aiOutput);
    if (werkbeschrijving.length === 0) {
      return NextResponse.json({ error: 'Lege werkbeschrijving ontvangen.' }, { status: 502 });
    }

    const mergedStructured = mergeStructuredFromRows({
      action,
      base: baseStructured,
      rows: werkbeschrijving,
    });
    const balanced = enforceSectionDistribution(mergedStructured, action);
    const mergedWithMaterials = ensureMaterialsIncluded(balanced, materialContext);
    const polished = postProcessWorkDescription(mergedWithMaterials, action, { allowSteigerMention });
    const flattened = flattenStructuredWorkDescription(polished);

    if (quoteId) {
      await persistWorkDescription(quoteId, userId, flattened, polished);
    }

    return NextResponse.json({
      werkbeschrijving: flattened,
      werkbeschrijvingStructured: polished,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Werkbeschrijving genereren mislukt';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function persistWorkDescription(
  quoteId: string,
  userId: string,
  werkbeschrijving: string[],
  werkbeschrijvingStructured?: WorkDescriptionStructured,
): Promise<void> {
  if (!quoteId || !userId) return;

  const { data: existingRows, error: readError } = await supabaseAdmin
    .from('quotes_collection')
    .select('id, data_json')
    .eq('quoteid', quoteId)
    .eq('gebruikerid', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (readError) throw new Error(readError.message);

  const existing = Array.isArray(existingRows) ? existingRows[0] : null;
  if (existing?.id) {
    const existingJson =
      existing.data_json && typeof existing.data_json === 'object'
        ? (existing.data_json as Record<string, unknown>)
        : {};

    const merged = {
      ...existingJson,
      werkbeschrijving,
      ...(werkbeschrijvingStructured ? { werkbeschrijving_structured: werkbeschrijvingStructured } : {}),
    };

    const { error: updateError } = await supabaseAdmin
      .from('quotes_collection')
      .update({ data_json: merged })
      .eq('id', String(existing.id));

    if (updateError) throw new Error(updateError.message);
    return;
  }

  const { error: insertError } = await supabaseAdmin
    .from('quotes_collection')
    .insert({
      quoteid: quoteId,
      gebruikerid: userId,
      status: 'completed',
      data_json: {
        werkbeschrijving,
        ...(werkbeschrijvingStructured ? { werkbeschrijving_structured: werkbeschrijvingStructured } : {}),
      },
    });

  if (insertError) throw new Error(insertError.message);
}
