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

const DEFAULT_OPENAI_MODEL = 'gpt-5.2';

const OPENAI_SYSTEM_PROMPT = `
Je schrijft Nederlandse werkbeschrijvingen voor offertes in de bouw.

Kern:
- Beschrijf scope voor de klant: wat is inbegrepen.
- Geen tutorial, geen checklist, geen interne uitvoerinstructies.

Stijl:
- Kort, hard, duidelijk.
- Elke regel 1 actie.
- Maximaal 6-8 woorden per regel.
- Geen "we"-zinnen.
- Geen uitleg, redenaties of procespraat.

Verboden:
- "bijv.", placeholder-tekst.
- Sequencing-woorden: eerste, tweede, daarna, vervolgens.
- Tool-details: met mes, met machine, schroefmachine, etc.
- Micro-acties en interne controle-taal.

Output:
- Alleen JSON, geen markdown/fences.
- Gebruik exact deze keys:
{
  "hoofdtitel": "",
  "samenvatting": "",
  "voorbereiding": [],
  "uitvoering": [],
  "afwerking": []
}
`;

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
  if (/\bboeideel|boeidelen\b/.test(raw)) return 'exterieur plaatmateriaal voor boeidelen';
  if (/\bisolat/i.test(raw)) return 'isolatiemateriaal';
  if (/\bgips\b/.test(raw)) return 'gipsplaten';
  if (/\bkozijn\b/.test(raw)) return 'kozijnonderdelen';
  if (/\blat|regelwerk|houtregel\b/.test(raw)) return 'regelwerk';
  if (/\bkit\b/.test(raw)) return 'kitmateriaal';
  if (/\bschroef|bevestig|plug\b/.test(raw)) return 'bevestigingsmateriaal';
  if (/\bmultiplex|plaat|mdf|okoume\b/.test(raw)) return 'platen';
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

function buildN8nStylePrompt(input: {
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
      ? 'Werk alleen de uitvoering bij. Laat voorbereiding/afwerking alleen staan als expliciet genoemd.'
      : input.action === 'improve'
        ? 'Verbeter de bestaande tekst zonder extra werkzaamheden toe te voegen.'
        : 'Schrijf een volledige werkbeschrijving.';

  return [
    'Schrijf een klantgerichte werkbeschrijving op scope-niveau.',
    actionRule,
    input.title ? `Titel: ${input.title}` : '',
    input.context ? `Context: ${input.context}` : '',
    input.category ? `Categorie: ${input.category}` : '',
    input.notesContext ? `Notities: ${input.notesContext}` : '',
    input.measurementsContext ? `Maatvoering: ${input.measurementsContext}` : '',
    'Materialen:',
    ...materialLines,
    'Bestaande werkbeschrijving (indien aanwezig):',
    JSON.stringify(input.baseStructured),
    '',
    'Regels (strikt):',
    '- Scope beschrijven, geen uitvoerinstructies.',
    '- Geen tools noemen, geen micro-acties.',
    '- Geen sequencingwoorden (eerste, daarna, vervolgens).',
    '- Geen placeholder-tekst zoals "bijv.".',
    '- Geen extra werk toevoegen buiten input/context/materialen.',
    '- Voorbereiding max 0-2 regels en alleen relevant.',
    '- Elke regel 1 handeling, max 6-8 woorden.',
    '',
    'Geef uitsluitend dit JSON-schema terug:',
    '{"hoofdtitel":"","samenvatting":"","voorbereiding":[],"uitvoering":[],"afwerking":[]}',
  ].filter(Boolean).join('\n');
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
  const seen = new Set<string>();
  const seenTokens: string[][] = [];
  const result: string[] = [];

  lines.forEach((line) => {
    const key = normalizeForMatch(line);
    if (!key || seen.has(key)) return;

    const tokens = key.split(' ').filter(Boolean);
    const nearDuplicate = seenTokens.some((existing) => {
      const overlap = existing.filter((token) => tokens.includes(token)).length;
      const baseline = Math.max(existing.length, tokens.length, 1);
      return overlap / baseline >= 0.7;
    });
    if (nearDuplicate) return;

    seen.add(key);
    seenTokens.push(tokens);
    result.push(line);
  });

  return result;
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
  action: AiAction | null,
): WorkDescriptionStructured {
  if (action === 'uitvoering-only') return sanitizeWorkDescriptionStructured(structuredInput);

  const structured = sanitizeWorkDescriptionStructured(structuredInput);
  const sections = {
    voorbereiding: [...structured.sections.voorbereiding],
    uitvoering: [...structured.sections.uitvoering],
    afwerking: [...structured.sections.afwerking],
  };

  return {
    ...structured,
    sections,
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
  action: AiAction | null,
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

  let voorbereiding = cleanSection(structured.sections.voorbereiding);
  let uitvoering = cleanSection(structured.sections.uitvoering);
  let afwerking = cleanSection(structured.sections.afwerking);

  voorbereiding = filterPreparationLines(voorbereiding).slice(0, 2);
  uitvoering = uitvoering.slice(0, 6);
  afwerking = afwerking.slice(0, 2);

  const sanitizeSection = (rows: string[]) => rows.filter((row) => looksQuoteReady(row));
  voorbereiding = sanitizeSection(voorbereiding);
  uitvoering = sanitizeSection(uitvoering);
  afwerking = sanitizeSection(afwerking);

  return {
    ...structured,
    title: cleanWorkDescriptionTitle(structured.title),
    context: cleanWorkDescriptionSummary(structured.context),
    sections: {
      voorbereiding,
      uitvoering,
      afwerking,
    },
  };
}

function buildSourceFingerprint(sourceText: string, materialContext: MaterialContextItem[]): string {
  return [
    sourceText,
    ...materialContext.map((item) => item.name),
    ...materialContext.map((item) => item.shortLabel),
  ].join(' ').toLowerCase();
}

function inferUitvoeringFallbackRows(sourceText: string, materialContext: MaterialContextItem[]): string[] {
  const src = buildSourceFingerprint(sourceText, materialContext);

  if (/\bgips|rk\b/.test(src)) {
    return [
      'Gipsplaten op maat maken',
      'Gipsplaten monteren op latten',
      'Bevestigingen controleren',
    ];
  }

  if (/\bboeideel|boeidelen\b/.test(src)) {
    return [
      'Boeidelen op maat maken',
      'Boeidelen monteren',
      'Aansluitingen afdichten',
    ];
  }

  if (/\bkozijn|kozijnonderdelen\b/.test(src)) {
    return [
      'Kozijnonderdelen op maat maken',
      'Kozijnonderdelen monteren',
      'Aansluitingen afwerken',
    ];
  }

  return [
    'Onderdelen op maat maken',
    'Onderdelen monteren',
    'Bevestigingen controleren',
  ];
}

function inferAfwerkingFallbackRows(sourceText: string, materialContext: MaterialContextItem[]): string[] {
  const src = buildSourceFingerprint(sourceText, materialContext);
  if (/\bnaden?|ak\b/.test(src)) return ['Naden afwerken'];
  if (/\bplint|plinten\b/.test(src)) return ['Plinten plaatsen'];
  if (/\bkit|afdicht|aansluiting\b/.test(src)) return ['Aansluitingen afdichten'];
  return ['Werkplek opruimen'];
}

function enforceMinimumScopeContent(
  structuredInput: WorkDescriptionStructured,
  action: AiAction | null,
  sourceText: string,
  materialContext: MaterialContextItem[],
): WorkDescriptionStructured {
  const structured = sanitizeWorkDescriptionStructured(structuredInput);
  if (action === 'uitvoering-only') return structured;

  const voorbereiding = [...structured.sections.voorbereiding];
  const uitvoering = [...structured.sections.uitvoering];
  const afwerking = [...structured.sections.afwerking];

  if (uitvoering.length < 2) {
    const fallback = inferUitvoeringFallbackRows(sourceText, materialContext);
    fallback.forEach((line) => {
      if (uitvoering.length >= 3) return;
      if (!uitvoering.some((existing) => normalizeForMatch(existing) === normalizeForMatch(line))) {
        uitvoering.push(line);
      }
    });
  }

  if (voorbereiding.length === 0 && /\bmaat|inmeten|latten|rachel|ondergrond|bestaand\b/i.test(sourceText)) {
    voorbereiding.push('Maatvoering controleren');
  }

  if (afwerking.length === 0) {
    const fallback = inferAfwerkingFallbackRows(sourceText, materialContext);
    fallback.forEach((line) => {
      if (afwerking.length >= 1) return;
      if (!afwerking.some((existing) => normalizeForMatch(existing) === normalizeForMatch(line))) {
        afwerking.push(line);
      }
    });
  }

  return {
    ...structured,
    sections: {
      voorbereiding,
      uitvoering,
      afwerking,
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
          voorbereiding: normalizeStepRows(row.voorbereiding, 20),
          uitvoering: normalizeStepRows(row.uitvoering, 50),
          afwerking: normalizeStepRows(row.afwerking, 20),
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
              voorbereiding: normalizeStepRows(parsed.voorbereiding, 20),
              uitvoering: normalizeStepRows(parsed.uitvoering, 50),
              afwerking: normalizeStepRows(parsed.afwerking, 20),
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
    const quoteId = safeString(rawBody?.quoteId);
    const title = safeString(rawBody?.title);
    const context = safeString(rawBody?.context);
    const category = safeString(rawBody?.category);
    const notesContext = safeString(rawBody?.notesContext);
    const measurementsContext = safeString(rawBody?.measurementsContext);
    const materialContext = normalizeMaterialContext(rawBody?.materialContext);

    const explicitPrompt = safeString(rawBody?.prompt);
    const prompt = explicitPrompt || [title, context, category, notesContext, measurementsContext].filter(Boolean).join('\n');

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
    const sourceText = [
      explicitPrompt,
      title,
      context,
      category,
      notesContext,
      measurementsContext,
      ...materialContext.map((item) => item.name),
      ...materialContext.map((item) => item.shortLabel),
    ].join('\n');

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

    const generationPrompt = buildN8nStylePrompt({
      action,
      title,
      context,
      category,
      notesContext,
      measurementsContext,
      materialContext,
      baseStructured,
    });

    const result = await callOpenAiJson({
      apiKey,
      model,
      systemPrompt: OPENAI_SYSTEM_PROMPT,
      userPrompt: generationPrompt,
    });

    const directStructured = extractDirectStructured(result);
    if (directStructured) {
      const mergedStructured = mergeStructuredFromStructured({
        action,
        base: baseStructured,
        generated: directStructured,
      });
      const balanced = ensureSectionDistribution(mergedStructured, action);
      const mergedWithMaterials = ensureMaterialsIncluded(balanced, materialContext);
      const polished = postProcessWorkDescription(mergedWithMaterials, action, { allowSteigerMention, sourceText });
      const withMinimum = enforceMinimumScopeContent(polished, action, sourceText, materialContext);
      const finalStructured = ensureMaterialsAfterPostProcess(withMinimum, materialContext);
      const flattened = flattenStructuredWorkDescription(finalStructured);
      if (quoteId) {
        await persistWorkDescription(quoteId, userId, flattened, finalStructured);
      }
      return NextResponse.json({
        werkbeschrijving: flattened,
        werkbeschrijvingStructured: finalStructured,
      });
    }

    const directWerkbeschrijving = extractDirectWerkbeschrijving(result);
    if (directWerkbeschrijving.length > 0) {
      const mergedStructured = mergeStructuredFromRows({
        action,
        base: baseStructured,
        rows: directWerkbeschrijving,
      });
      const balanced = ensureSectionDistribution(mergedStructured, action);
      const mergedWithMaterials = ensureMaterialsIncluded(balanced, materialContext);
      const polished = postProcessWorkDescription(mergedWithMaterials, action, { allowSteigerMention, sourceText });
      const withMinimum = enforceMinimumScopeContent(polished, action, sourceText, materialContext);
      const finalStructured = ensureMaterialsAfterPostProcess(withMinimum, materialContext);
      const flattened = flattenStructuredWorkDescription(finalStructured);
      if (quoteId) {
        await persistWorkDescription(quoteId, userId, flattened, finalStructured);
      }
      return NextResponse.json({
        werkbeschrijving: flattened,
        werkbeschrijvingStructured: finalStructured,
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
    const balanced = ensureSectionDistribution(mergedStructured, action);
    const mergedWithMaterials = ensureMaterialsIncluded(balanced, materialContext);
    const polished = postProcessWorkDescription(mergedWithMaterials, action, { allowSteigerMention, sourceText });
    const withMinimum = enforceMinimumScopeContent(polished, action, sourceText, materialContext);
    const finalStructured = ensureMaterialsAfterPostProcess(withMinimum, materialContext);
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
