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

type ExtractedScope = {
  jobType: string;
  mainObject: string;
  workCategory: string;
  location: string;
  mountingBase: string;
  primaryScope: string[];
  secondaryScope: string[];
  finishScope: string[];
  preparationScope: string[];
  materialsSummary: string[];
  customerVisibleResult: string[];
  importantConstraints: string[];
  knownSpecifics: string[];
};

const DEFAULT_OPENAI_MODEL = 'gpt-5.4';
const DEFAULT_REASONING_EFFORT = 'high';
const OPENAI_WORK_DESCRIPTION_SYSTEM_PROMPT = `Jij bent een technisch tekstschrijver voor de Nederlandse bouwsector. Transformeer calculatiedata naar een stappenplan voor een vakman.

DOEL: Een realistische WERKBESCHRIJVING in bullet points die dient als basis voor een uren-inschatting.

REGELS:
- Gebruik uitsluitend bullet points met korte, directe regels.
- Beschrijf fysieke handelingen (plaatsen, monteren, afwerken).
- Focus op de volgorde van werken en de complexiteit (hoeken, sparingen, details).
- GEEN prijzen, GEEN hoeveelheden, GEEN uren of tijdsindicaties.
- Gebruik vaktermen (h.o.h., SLS, regelwerk, RK/AK alleen als expliciet opgegeven).

STIJL:
- Direct, technisch en nuchter.
- Geen inleiding of afsluiting.
- Output uitsluitend in JSON-formaat.

REGELS:
- korteTitel: Maximaal 4 woorden, beschrijf WAT er gebouwd wordt
- korteBeschrijving: Maximaal 2 zinnen, klantvriendelijk, geen vaktermen
- werkbeschrijving: Volledige technische stappen zoals voorheen
- Als materialen zijn meegegeven, noem die expliciet in korteBeschrijving met korte materiaalnamen.
- Gebruik exact de opgegeven materiaalnamen (korte naam), geen vervanging of gok.
- Als materiaal RK bevat, schrijf RK (nooit AK).
- Elke opgegeven materiaalsoort moet minimaal 1x expliciet in werkbeschrijving staan.

OUTPUT FORMAT;
Houd je strikt aan het JSON-schema. Voeg NOOIT extra keys toe die niet in het voorbeeld staan.geen \`\`\`json\\n. puur beginnen met {

{
  "korteTitel": "2-4 woorden (bijv: 'Voorzetwand plaatsen', 'Plafond afwerken')",
  "korteBeschrijving": "1-2 zinnen die het werk samenvatten voor de klant. Geen vaktermen, wel duidelijk WAT er gemaakt wordt.",
  "werkbeschrijving": [
    { "stap": "Inmeten en uitzetten van wandlijnen op vloer, plafond en aangrenzende wanden." },
    { "stap": "Controleren van haaksheid, hoogtes en bestaande aansluitdetails." },
    { "stap": "Monteren van onder- en bovenregels volgens maatvoering." }
  ]
}`;

function summaryMentionsLabel(summary: string, label: string): boolean {
  const a = normalizeForMatch(summary);
  const b = normalizeForMatch(label);
  if (!a || !b) return false;
  return a.includes(b);
}

function ensureSummaryMentionsMaterials(summary: string, materialContext: MaterialContextItem[]): string {
  if (materialContext.length === 0) return summary;
  const uniqueLabels = Array.from(new Set(materialContext.map((m) => m.shortLabel).filter(Boolean)));
  if (uniqueLabels.length === 0) return summary;

  const missing = uniqueLabels.filter((label) => !summaryMentionsLabel(summary, label));
  if (missing.length === 0) return summary;

  const base = summary.trim().replace(/[. ]+$/g, '');
  const materialSentence = `Gebruikte materialen: ${missing.join(', ')}.`;
  if (!base) return materialSentence;
  return `${base}. ${materialSentence}`;
}

function ensureRowsMentionMaterials(rows: string[], materialContext: MaterialContextItem[]): string[] {
  if (materialContext.length === 0) return rows;
  const uniqueLabels = Array.from(new Set(materialContext.map((m) => m.shortLabel).filter(Boolean)));
  if (uniqueLabels.length === 0) return rows;

  const next = [...rows];
  uniqueLabels.forEach((label) => {
    const alreadyMentioned = next.some((line) => summaryMentionsLabel(line, label));
    if (alreadyMentioned) return;
    next.push(`Monteren van ${label} volgens maatvoering en aansluitdetails.`);
  });
  return next;
}

const SOFT_PHRASE_PATTERNS: RegExp[] = [
  /\bwe zorgen voor\b/i,
  /\bwe controleren\b/i,
  /\bwe stemmen( met u)? af\b/i,
  /\bzodat\b/i,
  /\bwaar nodig\b/i,
  /\bindien nodig\b/i,
  /\bveilig werken borgen\b/i,
  /\bvisueel beoordelen\b/i,
  /\bgeschikt bevestigingsmateriaal\b/i,
  /\bnette lijnvoering\b/i,
  /\bzichtwerk schoon opleveren\b/i,
];

const PREPARATION_WEAK_PATTERNS: RegExp[] = [
  /\bbijv\.?\b/i,
  /\bbereikbaarheid\b/i,
  /\bveilig\b/i,
  /\bafstem(men)?\b/i,
  /\bvisueel\b/i,
  /\baansluitdetails\b/i,
  /\bcontrole van de staat\b/i,
  /\bwerkplek\b/i,
  /\bmaterialen?\s+controleren\b/i,
  /\bafzetten\b/i,
];
const TUTORIAL_BANNED_PATTERNS: RegExp[] = [
  /\bbijv\.?\b/i,
  /\beerste\b/i,
  /\btweede\b/i,
  /\bderde\b/i,
  /\bdaarna\b/i,
  /\bvervolgens\b/i,
  /\bstap\b/i,
  /\bmet mes\b/i,
  /\bmet (de )?machine\b/i,
  /\bschroefmachine\b/i,
  /\bbreeklijn\b/i,
  /\bpositioneren\b/i,
  /\buitzetlijnen?\b/i,
  /\bvisueel\b/i,
  /\bnalopen op\b/i,
];
const TRADE_SPECIFIC_TERMS = [
  'gipsplaat', 'gipsplaten', 'rk', 'boeideel', 'boeidelen', 'kozijn', 'plint', 'plinten',
  'latten', 'rachel', 'regelwerk', 'ondergrond', 'bevestiging', 'bevestigingen',
  'aansluiting', 'aansluitingen', 'naden', 'afwerking', 'afdichten',
];
const DEDUPE_STOPWORDS = new Set([
  'de', 'het', 'een', 'en', 'van', 'op', 'in', 'met', 'voor', 'aan', 'te',
  'bestaande', 'nieuw', 'nieuwe', 'tegen', 'onder', 'bij', 'naar', 'vanuit',
]);
const ACTION_VERB_STEMS = [
  'demonteren',
  'uitmeten',
  'inmeten',
  'opnemen',
  'zagen',
  'snijden',
  'plaatsen',
  'bevestigen',
  'monteren',
  'herstellen',
  'afdichten',
  'afwerken',
  'opruimen',
  'afvoeren',
  'nalopen',
  'vrijmaken',
  'controleren',
  'verwerken',
  'passen',
  'stellen',
  'uitlijnen',
];
const VAGUE_VERB_STEMS = [
  'verwerken',
  'regelen',
  'uitvoeren',
];

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAction(value: unknown): AiAction | null {
  if (value === 'full' || value === 'uitvoering-only' || value === 'improve') return value;
  return null;
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

function toGenericMaterialLabel(name: string): string {
  const raw = normalizeForMatch(name);
  if (!raw) return 'afgesproken materiaal';
  if (/\brk\b/.test(raw) && /\bgips\b/.test(raw)) return 'RK gipsplaten';
  if (/\bak\b/.test(raw) && /\bgips\b/.test(raw)) return 'AK gipsplaten';
  if (/\bgips\b/.test(raw)) return 'gipsplaten';
  if (/\bplint|plinten\b/.test(raw)) return 'plinten';
  if (/\bboeideel|boeidelen\b/.test(raw)) return 'boeidelen';
  if (/\bisolat/i.test(raw)) return 'isolatiemateriaal';
  if (/\bkozijn\b/.test(raw)) return 'kozijnonderdelen';
  if (/\blat|regelwerk|houtregel|rachel\b/.test(raw)) return 'regelwerk';
  if (/\bkit\b/.test(raw)) return 'kit';
  if (/\bschroef|bevestig|plug\b/.test(raw)) return 'bevestigingsmiddelen';
  if (/\bmultiplex|plaat|mdf|okoume\b/.test(raw)) return 'plaatmateriaal';
  return 'afgesproken materiaal';
}

function normalizeMaterialContext(input: unknown): MaterialContextItem[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const item = row as Record<string, unknown>;
      const name = safeString(item.name);
      if (!name) return null;
      const quantityRaw = Number(item.quantity);
      const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Number(quantityRaw.toFixed(3)) : 1;
      const unit = safeString(item.unit) || 'stuk';
      const typeRaw = safeString(item.type).toLowerCase();
      const type: MaterialContextItem['type'] =
        typeRaw === 'groot' || typeRaw === 'verbruik' ? typeRaw : 'unknown';
      return {
        name,
        quantity,
        unit,
        type,
        shortLabel: toGenericMaterialLabel(name),
      };
    })
    .filter((item): item is MaterialContextItem => item !== null);
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

function parseJsonStrict(rawOutput: string): Record<string, unknown> {
  const cleaned = stripCodeFences(rawOutput);
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error('OpenAI output bevat geen geldig JSON-object.');
  }
}

async function callOpenAiJson(params: {
  apiKey: string;
  model: string;
  systemPrompt?: string;
  userPrompt: string;
  reasoningEffort?: string;
}): Promise<Record<string, unknown>> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model,
      reasoning: {
        effort: params.reasoningEffort || DEFAULT_REASONING_EFFORT,
      },
      input: [
        ...(params.systemPrompt
          ? [{
            role: 'system' as const,
            content: [{ type: 'input_text' as const, text: params.systemPrompt }],
          }]
          : []),
        {
          role: 'user' as const,
          content: [{ type: 'input_text' as const, text: params.userPrompt }],
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

  return parseJsonStrict(outputText);
}

function normalizeArrayField(value: unknown, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, max);
}

function normalizeExtractedScope(value: unknown): ExtractedScope {
  if (!value || typeof value !== 'object') {
    return {
      jobType: '',
      mainObject: '',
      workCategory: '',
      location: '',
      mountingBase: '',
      primaryScope: [],
      secondaryScope: [],
      finishScope: [],
      preparationScope: [],
      materialsSummary: [],
      customerVisibleResult: [],
      importantConstraints: [],
      knownSpecifics: [],
    };
  }

  const row = value as Record<string, unknown>;
  return {
    jobType: safeString(row.jobType),
    mainObject: safeString(row.mainObject),
    workCategory: safeString(row.workCategory),
    location: safeString(row.location),
    mountingBase: safeString(row.mountingBase),
    primaryScope: normalizeArrayField(row.primaryScope, 12),
    secondaryScope: normalizeArrayField(row.secondaryScope, 12),
    finishScope: normalizeArrayField(row.finishScope, 8),
    preparationScope: normalizeArrayField(row.preparationScope, 8),
    materialsSummary: normalizeArrayField(row.materialsSummary, 16),
    customerVisibleResult: normalizeArrayField(row.customerVisibleResult, 8),
    importantConstraints: normalizeArrayField(row.importantConstraints, 8),
    knownSpecifics: normalizeArrayField(row.knownSpecifics, 10),
  };
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
    ? input.materialContext.map((item) => `- ${item.name}`)
    : ['- geen expliciete materialen meegegeven'];

  const actionRule =
    input.action === 'uitvoering-only'
      ? 'Focus op scope voor uitvoering.'
      : input.action === 'improve'
        ? 'Verbeter alleen inhoud die al in scope past.'
        : 'Extraheer volledige commerciële scope.';

  return [
    'Stap A - Scope extractie voor offerte-tekst.',
    actionRule,
    input.title ? `Titel: ${input.title}` : '',
    input.context ? `Context: ${input.context}` : '',
    input.category ? `Categorie: ${input.category}` : '',
    input.notesContext ? `Notities: ${input.notesContext}` : '',
    input.measurementsContext ? `Maatvoering: ${input.measurementsContext}` : '',
    'Materialen:',
    ...materialLines,
    'Bestaande werkbeschrijving (context):',
    JSON.stringify(input.baseStructured),
    '',
    'Doel:',
    '- Extract alleen commerciële scope die klant betaalt.',
    '- Geen tutorialstappen, geen tooldetails, geen micro-acties.',
    '- Groepeer materialen naar vaktaal, geen leveranciersdump.',
    '- Geen duplicatie of herhaling.',
    '',
    'Geef uitsluitend dit JSON-schema terug:',
    '{"scope":{"jobType":"","mainObject":"","workCategory":"","location":"","mountingBase":"","primaryScope":[],"secondaryScope":[],"finishScope":[],"preparationScope":[],"materialsSummary":[],"customerVisibleResult":[],"importantConstraints":[],"knownSpecifics":[]}}',
  ].filter(Boolean).join('\n');
}

function buildQuoteWritingPrompt(input: {
  action: AiAction | null;
  scope: ExtractedScope;
  baseStructured: WorkDescriptionStructured;
}): string {
  const actionRule =
    input.action === 'uitvoering-only'
      ? 'Werk alleen uitvoering bij; andere secties ongewijzigd tenzij scope expliciet is.'
      : input.action === 'improve'
        ? 'Verbeter bestaande tekst met behoud van scope.'
        : 'Schrijf volledige werkbeschrijving.';

  return [
    'Stap B - Schrijf offerte-waardige werkbeschrijving vanuit scope.',
    actionRule,
    '',
    'Scope JSON:',
    JSON.stringify(input.scope),
    '',
    'Bestaande werkbeschrijving (context):',
    JSON.stringify(input.baseStructured),
    '',
    'Schrijfregels:',
    '- Schrijf als volwassen Nederlandse vakman/aannemer.',
    '- Beschrijf WHAT is inbegrepen, niet HOW.',
    '- Elke regel uniek, geen overlap of duplicaat-betekenis.',
    '- 1 duidelijke handeling per regel.',
    '- Kort en professioneel; geen AI-filler.',
    '- Geen tooling, sequencing of tutorialtaal.',
    '- Gebruik alleen sectie Uitvoering; geen Voorbereiding of Afwerking.',
    '- Gebruik sterke vaktaal: gipsplaten/RK/boeidelen/ondergrond/bevestigingen/aansluitingen/naden.',
    '- Vermijd zwakke woorden zoals "platen", "materiaal plaatsen", "verwerken".',
    '- Kwaliteitstest per regel: "Zou dit exact zo in een betaalde offerte staan?" Zo niet: herschrijven of verwijderen.',
    '',
    'Geef uitsluitend dit JSON-schema terug:',
    '{"hoofdtitel":"","samenvatting":"","uitvoering":[]}',
  ].join('\n');
}

function hasStructuredContent(value: WorkDescriptionStructured): boolean {
  return Boolean(
    value.title
    || value.context
    || value.sections.uitvoering.length > 0
    || (value.legacyNotes?.length || 0) > 0
  );
}

function cleanWorkDescriptionTitle(input: string): string {
  const compact = String(input || '')
    .replace(/[.:;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return 'Werkzaamheden uitvoeren';
  const words = compact.split(' ').filter(Boolean).slice(0, 4);
  if (words.length < 2) return `${words[0]} werkzaamheden`;
  return words.join(' ');
}

function cleanWorkDescriptionSummary(input: string): string {
  const compact = String(input || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  const firstSentence = compact.split(/[.!?]/)[0]?.trim() || compact;
  const stripped = firstSentence
    .replace(/\b(we zorgen|we stemmen|we controleren)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return stripped.replace(/[;:]+$/g, '').trim();
}

function stripSupplierStyleMaterialText(line: string): string {
  return line
    .replace(/\b\d{2,4}\s*x\s*\d{2,4}(\s*x\s*\d{1,3})?\s*(mm|cm|m)?\b/gi, '')
    .replace(/\b(fsc|mix\s*\d+%?|exterieur|interieur|verlijmd|gegrond|watervast)\b/gi, '')
    .replace(/\b(okoume|multiplexplaat|multiplex)\b/gi, 'plaatmateriaal')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/[;:,.]+$/g, '')
    .trim();
}

function simplifySoftPhrases(line: string): string {
  return line
    .replace(/\bplaatmateriaal boeidelen\b/gi, 'boeidelen')
    .replace(/\bmechanisch bevestigen\b/gi, 'bevestigen')
    .replace(/\bvisueel controleren\b/gi, 'controleren')
    .replace(/\bveilig werken borgen\b/gi, 'werkplek vrijmaken')
    .replace(/\bvisueel beoordelen\b/gi, 'controleren')
    .replace(/\bmechanisch bevestigen met geschikt bevestigingsmateriaal\b/gi, 'bevestigen')
    .replace(/\bgeschikt bevestigingsmateriaal\b/gi, 'bevestigingsmateriaal')
    .replace(/\bvoor een nette lijnvoering\b/gi, '')
    .replace(/\bzichtwerk schoon opleveren\b/gi, '')
    .replace(/\bstrak afwerken\b/gi, 'afwerken')
    .replace(/\bverwerken\b/gi, 'plaatsen')
    .replace(/\bplaatsen en verwerken\b/gi, 'plaatsen')
    .replace(/\bkopse kanten en aansluitingen strak afwerken voor een nette lijnvoering\b/gi, 'randen en naden afwerken')
    .replace(/\bgipsplaten?\s+snijden\s+met\s+\w+\b/gi, 'gipsplaten op maat maken')
    .replace(/\bgipskartonplaten?\s+snijden\s+met\s+\w+\b/gi, 'gipsplaten op maat maken')
    .replace(/\bdroog passen\b/gi, 'passen')
    .replace(/\bschroefkoppen?\s+nalopen\b/gi, 'bevestigingen controleren')
    .replace(/\bschroefbeeld\s+nalopen\b/gi, 'bevestigingen controleren')
    .replace(/\bschroeven?\s+bijstellen\b/gi, 'bevestigingen controleren')
    .replace(/\bnetjes\b/gi, '')
    .replace(/\bzorgvuldig\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

function collapseDuplicateWords(line: string): string {
  let next = line;
  let prev = '';
  while (next !== prev) {
    prev = next;
    next = next.replace(/\b([a-zA-ZÀ-ÿ]+)\s+\1\b/gi, '$1');
  }
  return next;
}

function hasActionVerb(line: string): boolean {
  return ACTION_VERB_STEMS.some((stem) => new RegExp(`\\b${stem}\\b`, 'i').test(line));
}

function countActionVerbs(line: string): number {
  return ACTION_VERB_STEMS.reduce((count, stem) => (
    new RegExp(`\\b${stem}\\b`, 'i').test(line) ? count + 1 : count
  ), 0);
}

function hasOnlyVagueVerb(line: string): boolean {
  const hasVague = VAGUE_VERB_STEMS.some((stem) => new RegExp(`\\b${stem}\\b`, 'i').test(line));
  if (!hasVague) return false;
  const hasSpecific = ACTION_VERB_STEMS.some((stem) => (
    !VAGUE_VERB_STEMS.includes(stem) && new RegExp(`\\b${stem}\\b`, 'i').test(line)
  ));
  return !hasSpecific;
}

function splitIntoSingleActionLines(line: string): string[] {
  const semicolonParts = line
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  const commaOrSelf = semicolonParts.flatMap((part) => {
    if (!part.includes(',')) return [part];
    const split = part.split(',').map((p) => p.trim()).filter(Boolean);
    return split.length > 1 ? split : [part];
  });

  const andOrSelf = commaOrSelf.flatMap((part) => {
    if (!/\sen\s/i.test(part)) return [part];
    if (countActionVerbs(part) <= 1) return [part];
    const split = part.split(/\sen\s/gi).map((p) => p.trim()).filter(Boolean);
    return split.length > 1 ? split : [part];
  });

  return andOrSelf
    .map((part) => part.replace(/[;:,.]+$/g, '').trim())
    .filter(Boolean);
}

function compressLineWords(line: string, maxWords = 8): string {
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return line;
  return words.slice(0, maxWords).join(' ').trim();
}

function looksQuoteReady(line: string): boolean {
  if (!line.trim()) return false;
  if (TUTORIAL_BANNED_PATTERNS.some((pattern) => pattern.test(line))) return false;
  if (!hasActionVerb(line)) return false;
  if (!lineHasMeaningfulObject(line)) return false;
  return true;
}

function cleanLine(raw: string, allowSteigerMention: boolean): string {
  let line = String(raw || '')
    .replace(/^[-*•\d)\].\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  line = line
    .replace(/^we\s+/i, '')
    .replace(/^wij\s+/i, '')
    .replace(/^we\s+(zorgen|controleren|stemmen).+$/i, '')
    .replace(/\bbijv\.?\b/gi, '')
    .replace(/\b(waar|indien)\s+nodig\b/gi, '')
    .replace(/\s*,?\s*zodat\b.+$/i, '')
    .replace(/\s*,?\s*waarbij\b.+$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  line = simplifySoftPhrases(line);
  line = stripSupplierStyleMaterialText(line);
  line = collapseDuplicateWords(line);

  if (!allowSteigerMention) {
    line = line
      .replace(/\bsteiger(s)?\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  if (!line) return '';
  if (TUTORIAL_BANNED_PATTERNS.some((pattern) => pattern.test(line))) return '';
  if (SOFT_PHRASE_PATTERNS.some((p) => p.test(line))) return '';

  if (line.length > 110) {
    const idx = line.search(/\b(en|maar|terwijl)\b/i);
    if (idx > 45) line = line.slice(0, idx).trim();
    if (line.length > 110) line = line.slice(0, 110).trim();
  }

  line = line.replace(/[;:,.]+$/g, '').trim();
  line = compressLineWords(line, 8);
  if (!line) return '';

  const ready = line.charAt(0).toUpperCase() + line.slice(1);
  return looksQuoteReady(ready) ? ready : '';
}

function dedupeLines(lines: string[]): string[] {
  const intentTokens = (line: string) => getIntentTokens(line);

  const specificityScore = (line: string): number => {
    const normalized = normalizeForMatch(line);
    if (!normalized) return 0;
    const terms = TRADE_SPECIFIC_TERMS.reduce((acc, term) => (
      normalized.includes(term) ? acc + 2 : acc
    ), 0);
    const weakPenalty = /\b(platen|materiaal|onderdelen)\b/i.test(line) ? 2 : 0;
    const lengthScore = Math.min(line.split(/\s+/).length, 10);
    return terms + lengthScore - weakPenalty;
  };

  const ordered = [...lines].sort((a, b) => specificityScore(b) - specificityScore(a));
  const chosen: string[] = [];
  const chosenTokens: string[][] = [];
  const exact = new Set<string>();

  ordered.forEach((line) => {
    const key = normalizeForMatch(line);
    if (!key || exact.has(key)) return;
    const tokens = intentTokens(line);
    if (tokens.length === 0) return;

    const nearDuplicate = chosenTokens.some((existing) => areIntentTokenSetsNearDuplicate(existing, tokens));
    if (nearDuplicate) return;

    exact.add(key);
    chosen.push(line);
    chosenTokens.push(tokens);
  });

  return lines.filter((line) => chosen.includes(line));
}

function canonicalIntentToken(token: string): string {
  if (/^(plaatsen|bevestigen|monteren)$/.test(token)) return 'monteren';
  if (/^(latten|rachelwerk|regels|regelwerk|ondergrond)$/.test(token)) return 'ondergrond';
  if (/^(gipsplaat|gipsplaten|gipskartonplaat|gipskartonplaten)$/.test(token)) return 'gipsplaten';
  if (/^(naden|naad)$/.test(token)) return 'naden';
  if (/^(aansluiting|aansluitingen)$/.test(token)) return 'aansluitingen';
  if (/^(bevestiging|bevestigingen|schroef|schroeven)$/.test(token)) return 'bevestigingen';
  return token;
}

function getIntentTokens(line: string): string[] {
  return normalizeForMatch(line)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !DEDUPE_STOPWORDS.has(token))
    .map((token) => canonicalIntentToken(token))
    .filter(Boolean);
}

function areIntentTokenSetsNearDuplicate(a: string[], b: string[]): boolean {
  const overlap = a.filter((token) => b.includes(token)).length;
  const strongSubset = overlap / Math.max(Math.min(a.length, b.length), 1) >= 0.8;
  const strongOverall = overlap / Math.max(a.length, b.length, 1) >= 0.65;
  return strongSubset || strongOverall;
}

function filterPreparationLines(lines: string[]): string[] {
  return lines.filter((line) => !PREPARATION_WEAK_PATTERNS.some((p) => p.test(line)));
}

function isExplicitlyMentionedInSource(sourceText: string, pattern: RegExp): boolean {
  if (!sourceText.trim()) return false;
  return pattern.test(sourceText);
}

function isGenericLowValueLine(line: string): boolean {
  return [
    /^op maat maken en plaatsen$/i,
    /^nieuw materiaal plaatsen$/i,
    /^afgesproken materiaal plaatsen$/i,
    /^materiaal plaatsen$/i,
    /^platen plaatsen$/i,
    /^plaatmateriaal plaatsen$/i,
    /^volgende platen plaatsen\b/i,
    /^onderdelen plaatsen en bevestigen$/i,
    /^nieuwe onderdelen op maat maken$/i,
    /^bestaande onderdelen demonteren$/i,
  ].some((pattern) => pattern.test(line.trim()));
}

function filterNonRequestedExtraWork(line: string, sourceText: string): boolean {
  const checks: Array<{ linePattern: RegExp; sourcePattern: RegExp }> = [
    { linePattern: /\bsteiger(s)?\b/i, sourcePattern: /\bsteiger(s)?\b/i },
    { linePattern: /\bstuc(ken|werk|en)?\b/i, sourcePattern: /\bstuc(ken|werk|en)?\b/i },
    { linePattern: /\bherstel(len|werk)?\b/i, sourcePattern: /\bherstel(len|werk)?\b/i },
    { linePattern: /\bnaden?\b.*\b(vullen|stucen|afwerken)\b/i, sourcePattern: /\bnaden?\b/i },
    { linePattern: /\bschroefgaten?\b/i, sourcePattern: /\bschroefgaten?\b/i },
  ];

  return checks.every(({ linePattern, sourcePattern }) => {
    if (!linePattern.test(line)) return true;
    return isExplicitlyMentionedInSource(sourceText, sourcePattern);
  });
}

function lineHasMeaningfulObject(line: string): boolean {
  const normalized = normalizeForMatch(line);
  if (!normalized) return false;
  const objectHints = [
    'gipsplaat', 'gipsplaten', 'rachel', 'regelwerk', 'boeideel', 'boeidelen',
    'plaat', 'platen', 'kozijn', 'plint', 'naden', 'hoek', 'aansluiting', 'afwerking',
    'kit', 'schroef', 'bevestiging', 'materiaal', 'werkplek',
  ];
  return objectHints.some((hint) => normalized.includes(hint));
}

function ensureSectionDistribution(
  structuredInput: WorkDescriptionStructured,
  _action: AiAction | null,
): WorkDescriptionStructured {
  const structured = sanitizeWorkDescriptionStructured(structuredInput);
  const mergedUitvoering = dedupeLines([
    ...structured.sections.voorbereiding,
    ...structured.sections.uitvoering,
    ...structured.sections.afwerking,
  ]);

  return {
    ...structured,
    sections: {
      voorbereiding: [],
      uitvoering: mergedUitvoering,
      afwerking: [],
    },
  };
}

function ensureMaterialsIncluded(
  structuredInput: WorkDescriptionStructured,
  materialContext: MaterialContextItem[],
): WorkDescriptionStructured {
  if (materialContext.length === 0) return structuredInput;
  // Do not force-insert generic material lines; this caused low-value garbage.
  // Material confidence is handled by prompt context + model output + sanitizer.
  return sanitizeWorkDescriptionStructured(structuredInput);
}

function ensureMaterialsAfterPostProcess(
  structuredInput: WorkDescriptionStructured,
  materialContext: MaterialContextItem[],
): WorkDescriptionStructured {
  if (materialContext.length === 0) return structuredInput;
  return sanitizeWorkDescriptionStructured(structuredInput);
}

function postProcessWorkDescription(
  structuredInput: WorkDescriptionStructured,
  _action: AiAction | null,
  options?: { allowSteigerMention?: boolean; sourceText?: string },
): WorkDescriptionStructured {
  const structured = sanitizeWorkDescriptionStructured(structuredInput);
  const allowSteigerMention = Boolean(options?.allowSteigerMention);
  const sourceText = safeString(options?.sourceText).toLowerCase();

  const cleanSection = (rows: string[]) => {
    const normalized = rows
      .map((row) => cleanLine(row, allowSteigerMention))
      .filter(Boolean)
      .flatMap((row) => splitIntoSingleActionLines(row))
      .map((row) => cleanLine(row, allowSteigerMention))
      .filter(Boolean)
      .filter((row) => !isGenericLowValueLine(row))
      .filter((row) => filterNonRequestedExtraWork(row, sourceText))
      .filter((row) => !hasOnlyVagueVerb(row))
      .filter((row) => hasActionVerb(row))
      .filter((row) => lineHasMeaningfulObject(row));

    return dedupeLines(normalized);
  };

  const mergedRows = [
    ...structured.sections.voorbereiding,
    ...structured.sections.uitvoering,
    ...structured.sections.afwerking,
  ];

  let uitvoering = cleanSection(mergedRows);
  uitvoering = uitvoering.slice(0, 8);

  const sanitizeSection = (rows: string[]) => rows.filter((row) => looksQuoteReady(row));
  uitvoering = sanitizeSection(uitvoering);

  return {
    ...structured,
    title: cleanWorkDescriptionTitle(structured.title),
    context: cleanWorkDescriptionSummary(structured.context),
    sections: {
      voorbereiding: [],
      uitvoering,
      afwerking: [],
    },
  };
}

function normalizeStepRows(input: unknown, max = 50): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (!entry || typeof entry !== 'object') return '';
      const row = entry as Record<string, unknown>;
      return safeString(row.stap) || safeString(row.step) || safeString(row.description) || safeString(row.text);
    })
    .filter(Boolean)
    .slice(0, max);
}

function extractDirectWerkbeschrijving(result: unknown): string[] {
  if (!result || typeof result !== 'object') return [];
  const row = result as { werkbeschrijving?: unknown; output?: unknown };

  const direct = normalizeStepRows(row.werkbeschrijving);
  if (direct.length > 0) return direct;

  if (typeof row.output === 'string' && row.output.trim()) {
    try {
      const parsed = JSON.parse(row.output) as { werkbeschrijving?: unknown };
      return normalizeStepRows(parsed.werkbeschrijving);
    } catch {
      return [];
    }
  }

  return [];
}

function extractDirectStructured(result: unknown): WorkDescriptionStructured | null {
  if (!result || typeof result !== 'object') return null;

  const row = result as {
    werkbeschrijving_structured?: unknown;
    werkbeschrijvingStructured?: unknown;
    korteTitel?: unknown;
    korteBeschrijving?: unknown;
    hoofdtitel?: unknown;
    samenvatting?: unknown;
    werkbeschrijving?: unknown;
    voorbereiding?: unknown;
    uitvoering?: unknown;
    afwerking?: unknown;
    output?: unknown;
  };

  const directCandidate = row.werkbeschrijving_structured ?? row.werkbeschrijvingStructured;
  if (directCandidate) {
    const structured = sanitizeWorkDescriptionStructured(directCandidate);
    if (hasStructuredContent(structured)) return structured;
  }

  const n8nRows = extractDirectWerkbeschrijving(row);
  const n8nTitle = safeString(row.korteTitel);
  const n8nSummary = safeString(row.korteBeschrijving);
  if (n8nRows.length > 0 || n8nTitle || n8nSummary) {
    const structured = toStructuredWorkDescription({
      korteTitel: n8nTitle,
      korteBeschrijving: n8nSummary,
      werkbeschrijving: n8nRows,
    });
    if (hasStructuredContent(structured)) return structured;
  }

  const hasDutchShape =
    typeof row.hoofdtitel === 'string'
    || typeof row.samenvatting === 'string'
    || Array.isArray(row.voorbereiding)
    || Array.isArray(row.uitvoering)
    || Array.isArray(row.afwerking);

  if (hasDutchShape) {
    const structured = toStructuredWorkDescription({
      korteTitel: safeString(row.hoofdtitel),
      korteBeschrijving: safeString(row.samenvatting),
      werkbeschrijving_structured: {
        sections: {
          voorbereiding: [],
          uitvoering: [
            ...normalizeStepRows(row.voorbereiding, 20),
            ...normalizeStepRows(row.uitvoering, 50),
            ...normalizeStepRows(row.afwerking, 20),
          ],
          afwerking: [],
        },
      },
    });
    if (hasStructuredContent(structured)) return structured;
  }

  if (typeof row.output === 'string' && row.output.trim()) {
    try {
      const parsed = JSON.parse(row.output) as {
        werkbeschrijving_structured?: unknown;
        werkbeschrijvingStructured?: unknown;
        korteTitel?: unknown;
        korteBeschrijving?: unknown;
        werkbeschrijving?: unknown;
        hoofdtitel?: unknown;
        samenvatting?: unknown;
        voorbereiding?: unknown;
        uitvoering?: unknown;
        afwerking?: unknown;
      };
      const candidate = parsed.werkbeschrijving_structured ?? parsed.werkbeschrijvingStructured;
      const parsedRows = extractDirectWerkbeschrijving(parsed);
      const structured = candidate
        ? sanitizeWorkDescriptionStructured(candidate)
        : toStructuredWorkDescription({
          korteTitel: safeString(parsed.korteTitel) || safeString(parsed.hoofdtitel),
          korteBeschrijving: safeString(parsed.korteBeschrijving) || safeString(parsed.samenvatting),
          werkbeschrijving: parsedRows.length > 0 ? parsedRows : normalizeStepRows(parsed.uitvoering, 50),
          werkbeschrijving_structured: {
            sections: {
              voorbereiding: [],
              uitvoering: [
                ...normalizeStepRows(parsed.voorbereiding, 20),
                ...normalizeStepRows(parsed.uitvoering, 50),
                ...normalizeStepRows(parsed.afwerking, 20),
              ],
              afwerking: [],
            },
          },
        });
      if (hasStructuredContent(structured)) return structured;
    } catch {
      // ignore
    }
  }

  return null;
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

  const directCandidates = [row.output, row.text, row.description, row.werkbeschrijving];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  const contentObject =
    row.content && typeof row.content === 'object'
      ? (row.content as { parts?: Array<{ text?: unknown }> })
      : null;
  const firstPart = Array.isArray(contentObject?.parts) ? contentObject.parts[0] : null;
  if (firstPart && typeof firstPart.text === 'string' && firstPart.text.trim()) return firstPart.text.trim();

  if (row.data && typeof row.data === 'object') {
    const nested = extractAiOutput(row.data);
    if (nested) return nested;
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
      return normalizeStepRows(candidate, 50);
    }
    if (typeof candidate === 'string') {
      const lines = toLines(candidate);
      if (lines.length > 0) return lines;
    }
  } catch {
    // ignore
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
        voorbereiding: [],
        uitvoering: cleanedRows,
        afwerking: [],
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
    sections: {
      voorbereiding: [],
      uitvoering: dedupeLines([
        ...inferred.sections.voorbereiding,
        ...inferred.sections.uitvoering,
        ...inferred.sections.afwerking,
      ]),
      afwerking: [],
    },
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
    const uitvoerRows = dedupeLines([
      ...generated.sections.voorbereiding,
      ...generated.sections.uitvoering,
      ...generated.sections.afwerking,
    ]);

    return {
      ...base,
      sections: {
        voorbereiding: [],
        uitvoering: uitvoerRows.length > 0 ? uitvoerRows : flattenStructuredWorkDescription(generated),
        afwerking: [],
      },
    };
  }

  return {
    ...generated,
    title: generated.title || base.title,
    context: generated.context || base.context,
    sections: {
      voorbereiding: [],
      uitvoering: dedupeLines([
        ...generated.sections.voorbereiding,
        ...generated.sections.uitvoering,
        ...generated.sections.afwerking,
      ]),
      afwerking: [],
    },
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
      quoteId?: unknown;
      title?: unknown;
      materialContext?: unknown;
      notesContext?: unknown;
    } | null;
    const quoteId = safeString(rawBody?.quoteId);
    const title = safeString(rawBody?.title);
    const notesContext = safeString(rawBody?.notesContext);
    const materialContext = normalizeMaterialContext(rawBody?.materialContext);
    if (!title) {
      return NextResponse.json({ error: 'Titel is verplicht.' }, { status: 400 });
    }

    const apiKey = safeString(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY ontbreekt op de server.' }, { status: 500 });
    }

    const model = DEFAULT_OPENAI_MODEL;
    const reasoningEffort = safeString(process.env.OPENAI_WORK_DESCRIPTION_REASONING) || DEFAULT_REASONING_EFFORT;

    const materialShortLabels = Array.from(
      new Set(materialContext.map((item) => item.shortLabel).filter(Boolean))
    );
    const materialInputLines = materialContext.map((item) => `- ${item.name} -> ${item.shortLabel}`);
    const promptParts = [
      `Titel: ${title}`,
      materialShortLabels.length > 0
        ? [
          'Materialen (moeten expliciet genoemd worden in korteBeschrijving en werkbeschrijving):',
          ...materialInputLines,
        ].join('\n')
        : '',
      notesContext ? `Notities: ${notesContext}` : '',
    ].filter(Boolean);

    const writeResult = await callOpenAiJson({
      apiKey,
      model,
      systemPrompt: OPENAI_WORK_DESCRIPTION_SYSTEM_PROMPT,
      userPrompt: promptParts.join('\n'),
      reasoningEffort,
    });

    const korteTitel =
      safeString((writeResult as { korteTitel?: unknown }).korteTitel)
      || safeString((writeResult as { hoofdtitel?: unknown }).hoofdtitel)
      || title;
    const korteBeschrijving =
      safeString((writeResult as { korteBeschrijving?: unknown }).korteBeschrijving)
      || safeString((writeResult as { samenvatting?: unknown }).samenvatting);
    const enforcedKorteBeschrijving = ensureSummaryMentionsMaterials(korteBeschrijving, materialContext);
    const rowsSource = (
      writeResult as { werkbeschrijving?: unknown; uitvoering?: unknown }
    ).werkbeschrijving ?? (
      writeResult as { uitvoering?: unknown }
    ).uitvoering;
    const werkbeschrijving = normalizeStepRows(rowsSource, 100);
    if (werkbeschrijving.length === 0) {
      return NextResponse.json({ error: 'Lege werkbeschrijving ontvangen.' }, { status: 502 });
    }
    const enforcedWerkbeschrijving = ensureRowsMentionMaterials(werkbeschrijving, materialContext);

    const finalStructured = toStructuredWorkDescription({
      korteTitel,
      korteBeschrijving: enforcedKorteBeschrijving,
      werkbeschrijving: enforcedWerkbeschrijving,
    });
    const flattened = flattenStructuredWorkDescription(finalStructured);

    if (quoteId) {
      await persistWorkDescription(quoteId, userId, flattened, finalStructured);
    }

    return NextResponse.json({
      werkbeschrijving: flattened,
      werkbeschrijvingStructured: finalStructured,
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
