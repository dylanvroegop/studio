import { NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import {
  flattenStructuredWorkDescription,
  sanitizeWorkDescriptionStructured,
  toStructuredWorkDescription,
  type WorkDescriptionStructured,
} from '@/lib/quote-calculations';
import {
  deduplicateMeasurementRows,
  enforceRequiredMaatwerkCoverage,
  extractRequiredNoteRequirements,
  isNoteRequirementCovered,
} from '@/lib/work-description-note-coverage';
import {
  completeWorkDeliveryScope,
  enforceWorkDeliverySafety,
  isIgnoredWorkDeliveryMaterial,
  sanitizeMaterialDescription,
  sanitizeWorkDeliveryScope,
} from '@/lib/work-delivery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPENAI_MODEL = process.env.OPENAI_WORK_DESCRIPTION_MODEL?.trim()
  || process.env.OPENAI_MODEL?.trim()
  || 'gpt-5.5';
const OPENAI_TIMEOUT_MS = 300_000;
const WASTE_REMOVAL_DISABLED_RULE = [
  'HARDE REGEL: GEEN AFVAL AFVOEREN.',
  'Neem geen stap op over afval, puin of restmateriaal afvoeren, meenemen, storten of in een container plaatsen.',
  'Afval afvoeren mag uitsluitend worden genoemd wanneer afvalAfvoeren expliciet op true staat.',
].join(' ');

type RequestBody = {
  prompt?: unknown;
  quoteId?: unknown;
  action?: unknown;
  title?: unknown;
  context?: unknown;
  category?: unknown;
  targetSection?: unknown;
  structuredInput?: unknown;
  materialContext?: unknown;
  notesContext?: unknown;
  measurementsContext?: unknown;
  quoteCalculationContext?: unknown;
  sourceJobs?: unknown;
  noteJobs?: unknown;
};

interface WorkDescriptionNoteJobInput {
  title: string;
  notes: string;
  dimensions: string[];
}

interface WorkDescriptionSourceJob {
  id: string;
  index: number;
  title: string;
  type: string;
  description: string;
  notes: string;
  details: string[];
  materials: string[];
  dimensions: string[];
}

interface QuoteCalculationContext {
  prompt: string;
  jobs: WorkDescriptionSourceJob[];
}

interface OpenAiWorkDescriptionResult {
  rawOutput: string;
  parsed: unknown;
}

function getNoteJobs(input: unknown): WorkDescriptionNoteJobInput[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const title = safeString(row.title);
    const notes = safeString(row.notes);
    const normalizedTitle = title.replace(/^#+\s*/, '').trim();
    if (/^links?\b/i.test(normalizedTitle)) return [];
    const dimensions = Array.isArray(row.dimensions)
      ? row.dimensions.map((value) => safeString(value)).filter(Boolean)
      : [];
    return title || notes ? [{ title: title || 'Werkzaamheid', notes, dimensions }] : [];
  });
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitRawOutputByNoteTitles(rawOutput: string, noteJobs: WorkDescriptionNoteJobInput[]): string[] {
  const raw = safeString(rawOutput);
  if (!raw || noteJobs.length === 0) return [];

  const matches = noteJobs
    .map((job, index) => {
      const title = safeString(job.title);
      if (!title) return null;
      const match = new RegExp(`(^|\\n|\\r|\\s)${escapeRegExp(title)}\\s*:`, 'i').exec(raw);
      if (!match || match.index < 0) return null;
      const prefixLength = match[1]?.length || 0;
      return {
        index,
        start: match.index + prefixLength,
      };
    })
    .filter((item): item is { index: number; start: number } => Boolean(item))
    .sort((left, right) => left.start - right.start);

  if (matches.length > 0) {
    const rows = Array(noteJobs.length).fill('');
    matches.forEach((match, position) => {
      const end = matches[position + 1]?.start ?? raw.length;
      rows[match.index] = raw.slice(match.start, end).trim();
    });
    return rows;
  }

  const paragraphs = raw
    .split(/\n\s*\n/g)
    .map((row) => row.trim())
    .filter(Boolean);
  if (paragraphs.length >= noteJobs.length) return paragraphs.slice(0, noteJobs.length);

  const lines = raw
    .split(/\r?\n/g)
    .map((row) => row.trim())
    .filter(Boolean);
  if (lines.length >= noteJobs.length) return lines.slice(0, noteJobs.length);

  return [raw];
}

function truncateText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function cleanProfessionalScopeText(value: string): string {
  return value
    .replace(/\s*\.?\s*moet\s+staan\s+in\s+de\s+werk\s*&\s*levering\s*/gi, '. Toegepast wordt ')
    .replace(/\s*\.?\s*opnemen\s+in\s+de\s+werk\s*&\s*levering\s*/gi, '. Toegepast wordt ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\.\s*toegepast wordt\s+([a-z])/gi, (_, letter: string) => `. Toegepast wordt ${letter.toUpperCase()}`)
    .trim();
}

function normalizeWasteSummary(summary: string, wasteIncluded: boolean): string {
  const cleaned = summary
    .replace(/\s*(?:afval\s*afvoer|afvalafvoer)\s+is\s+inbegrepen\.?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.]+$/g, '');
  const base = cleaned ? `${cleaned}.` : '';
  return wasteIncluded
    ? [base, 'Afval afvoer is inbegrepen.'].filter(Boolean).join(' ')
    : base;
}

function extractCandidateWorkText(row: string, jobIndex: number): string {
  const text = safeString(row);
  if (!text) return '';

  const parsed = text.startsWith('{') || text.startsWith('[')
    ? parseJsonDeep(text) ?? parseJsonPrefix(text)
    : null;
  if (parsed && parsed !== text && typeof parsed === 'object') {
    const structured = sanitizeWorkDescriptionStructured(parsed);
    const job = structured.jobs[jobIndex] || structured.jobs[0];
    return safeString(job?.summary)
      || safeString(job?.context)
      || safeString(job?.work_scope?.[0])
      || safeString(structured.summary)
      || safeString(structured.context)
      || safeString(structured.work_scope[0]);
  }

  return text;
}

function normalizeCandidateText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getDimensionTitles(dimensions: string[]): string {
  return dimensions
    .map((dimension) => safeString(dimension).split(':')[0] || '')
    .filter(Boolean)
    .join(' ');
}

function normalizeFactToken(value: string): string {
  return normalizeCandidateText(value)
    .replace(/\bdennen\s+groen\b/g, 'dennengroen')
    .replace(/\bzijde?s?\b/g, 'zijde')
    .replace(/\bkozijn\b/g, 'kozijnen')
    .replace(/\bdraairaam\b/g, 'draairamen');
}

function extractMandatoryJobFacts(source: WorkDescriptionNoteJobInput): string[] {
  const facts = new Set<string>();
  const sourceText = [source.title, source.notes, source.dimensions.join(' ')].filter(Boolean).join('\n');

  for (const match of sourceText.matchAll(/\b(\d+)\s*x\s+([a-zA-ZÀ-ÿ][^,\n;.|]*)/gi)) {
    const amount = match[1];
    const subject = normalizeFactToken(match[2] || '')
      .split(/\s+/)
      .filter((token) => token.length >= 4)
      .slice(0, 3)
      .join(' ');
    if (amount && subject) facts.add(`${amount} ${subject}`);
  }

  for (const match of sourceText.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/gi)) {
    facts.add(`${String(match[1]).replace(',', '.')} ${String(match[2]).toLowerCase()}`);
  }

  for (const match of sourceText.matchAll(/\b(\d+)\s+zijdes?\b/gi)) {
    facts.add(`${match[1]} zijde`);
  }

  [
    'dennen groen',
    'dennengroen',
    'wit',
    'dakkapel',
    'binnendeur',
    'buitenlak',
    'hpl',
    'trespa',
    'zijslabben',
    'sneldek',
    'raamkozijn',
  ].forEach((term) => {
    if (new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}\\b`, 'i').test(sourceText)) {
      facts.add(normalizeFactToken(term));
    }
  });

  return Array.from(facts);
}

function generatedTextContainsFact(generated: string, fact: string): boolean {
  const normalizedGenerated = normalizeFactToken(generated);
  const normalizedFact = normalizeFactToken(fact);
  const parts = normalizedFact.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return true;

  const number = parts.find((part) => /^\d+(?:\.\d+)?$/.test(part));
  if (number && !normalizedGenerated.includes(number)) return false;

  return parts
    .filter((part) => !/^\d+(?:\.\d+)?$/.test(part) && !/^(mm|cm|m)$/.test(part))
    .every((part) => normalizedGenerated.includes(part));
}

function getMissingMandatoryJobFacts(source: WorkDescriptionNoteJobInput, generated: string): string[] {
  return extractMandatoryJobFacts(source)
    .filter((fact) => !generatedTextContainsFact(generated, fact));
}

function isGeneratedCandidateRelevant(source: WorkDescriptionNoteJobInput, candidate: string): boolean {
  if (!candidate.trim()) return false;
  const candidateWithDimensions = [candidate, source.dimensions.join(' ')].filter(Boolean).join(' ');
  if (getMissingMandatoryJobFacts(source, candidateWithDimensions).length > 0) return false;
  return true;
}

function parseJsonPrefix(input: string): unknown | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  const opener = trimmed[0];
  const closer = opener === '{' ? '}' : ']';

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === opener) depth += 1;
    if (char === closer) depth -= 1;
    if (depth === 0) {
      return parseJsonString(trimmed.slice(0, index + 1));
    }
  }

  return null;
}

function formatContextValue(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return truncateText(value, 120);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => formatContextValue(item, depth + 1))
      .filter(Boolean)
      .join(' | ');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof (record as { toDate?: unknown }).toDate === 'function') return '';
    if (depth >= 4) return '';
    return Object.entries(record)
      .filter(([key]) => !/^(id|createdAt|updatedAt|savedAt|savedByUid|uiState|visualisatie|visualisatieUrl|visualisatieSnapshots)$/i.test(key))
      .slice(0, 30)
      .map(([key, nested]) => {
        const formatted = formatContextValue(nested, depth + 1);
        return formatted ? `${key}: ${formatted}` : '';
      })
      .filter(Boolean)
      .join(', ');
  }
  return '';
}

function formatContextEntries(input: unknown, maxRows = 12): string[] {
  if (!input) return [];
  const entries = Array.isArray(input)
    ? input.flatMap((item, index) => (item && typeof item === 'object'
        ? Object.entries(item as Record<string, unknown>).map(([key, value]) => [`${index + 1}.${key}`, value] as const)
        : [[String(index + 1), item] as const]))
    : typeof input === 'object'
      ? Object.entries(input as Record<string, unknown>)
      : [];

  return entries
    .map(([key, value]) => {
      const formatted = formatContextValue(value);
      return formatted ? `${key}: ${formatted}` : '';
    })
    .filter(Boolean)
    .slice(0, maxRows);
}

const DIMENSION_KEY_PATTERN = /(lengte|breedte|hoogte|dikte|diepte|diameter|afstand|maat|radius|overspanning|hart.?op.?hart|h\.o\.h)/i;
const NON_DIMENSION_KEY_PATTERN = /^(id|index|aantal|count|prijs|kosten|percentage|volgorde|x|y)$/i;
const NUMBERED_GEOMETRY_KEY_PATTERN = /(?:lengte|breedte|hoogte|dikte|diepte)\d+$/i;

function humanizeContextKey(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatDimensionValue(key: string, value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${humanizeContextKey(key)} = ${value} mm`;
  }
  if (typeof value === 'string' && value.trim() && /\d/.test(value)) {
    const compact = value.replace(/\s+/g, ' ').trim();
    return `${humanizeContextKey(key)} = ${/\b(?:mm|cm|m|m2|m²)\b/i.test(compact) ? compact : `${compact} mm`}`;
  }
  return '';
}

function formatSegmentDimensionValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s*mm\s*$/i, '').trim();
}

function extractDimensionRows(input: unknown, jobTitle: string): string[] {
  const rows: string[] = [];
  const visit = (value: unknown, path: string[], depth: number) => {
    if (!value || depth > 5) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, String(index + 1)], depth + 1));
      return;
    }
    if (typeof value !== 'object') return;

    const record = value as Record<string, unknown>;
    const label = safeString(record.label) || safeString(record.titel) || safeString(record.title);
    const dimensions = Object.entries(record)
      .filter(([key, nested]) => (
        !NON_DIMENSION_KEY_PATTERN.test(key)
        && !NUMBERED_GEOMETRY_KEY_PATTERN.test(key)
        && DIMENSION_KEY_PATTERN.test(key)
        && (typeof nested === 'number' || typeof nested === 'string')
      ))
      .map(([key, nested]) => formatDimensionValue(key, nested))
      .filter(Boolean);

    const segmentDimensions = new Map<number, Array<{ key: string; value: string }>>();
    Object.entries(record).forEach(([key, nested]) => {
      const match = key.match(/^(lengte|breedte|hoogte|dikte|diepte)(\d+)$/i);
      if (!match) return;
      const formatted = formatSegmentDimensionValue(nested);
      if (!formatted) return;
      const segment = Number(match[2]);
      const values = segmentDimensions.get(segment) || [];
      values.push({ key: match[1].toLowerCase(), value: formatted });
      segmentDimensions.set(segment, values);
    });

    const segmentOrder = ['lengte', 'breedte', 'hoogte', 'dikte', 'diepte'];
    Array.from(segmentDimensions.entries())
      .sort(([left], [right]) => left - right)
      .forEach(([segment, values]) => {
        const orderedValues = values
          .sort((left, right) => segmentOrder.indexOf(left.key) - segmentOrder.indexOf(right.key))
          .map((item) => item.value);
        if (orderedValues.length > 0) {
          dimensions.push(`Deel ${segment} = ${orderedValues.join(' × ')} mm`);
        }
      });

    if (dimensions.length > 0) {
      const prefix = [jobTitle, label].filter(Boolean).join(' – ');
      rows.push(`${prefix}: | ${dimensions.join(' | ')} |`);
    }

    Object.entries(record).forEach(([key, nested]) => {
      if (['basis', 'items', 'toevoegingen', 'openings', 'afmetingen', 'measurements', 'maatvoering'].includes(key)) {
        visit(nested, [...path, key], depth + 1);
      }
    });
  };

  visit(input, [], 0);
  return Array.from(new Set(rows));
}

function extractNoteDimensionRows(notesContext: unknown): string[] {
  if (typeof notesContext !== 'string') return [];
  return notesContext.split(/\r?\n/).flatMap((rawLine) => {
    const line = rawLine.replace(/^[-*•]\s*/, '').trim();
    const match = line.match(/^(.*?)\s*[:=]\s*lengte\s*[:=]?\s*([^,|]+?)\s*[,|]\s*breedte\s*[:=]?\s*([^,|]+?)(?:\s*[,|]\s*hoogte\s*[:=]?\s*([^,|]+?))?\s*[,|]\s*dikte\s*[:=]?\s*([^,|]+?)\s*$/i);
    if (!match) return [];
    const title = match[1].trim();
    const clean = (value: string) => value.replace(/\s*mm\s*$/i, '').trim();
    const height = clean(match[4] || '');
    return [`${title}: | Lengte = ${clean(match[2])} mm | Breedte = ${clean(match[3])} mm |${height ? ` Hoogte = ${height} mm |` : ''} Dikte = ${clean(match[5])} mm |`];
  });
}

function getMaterialNames(input: unknown): string[] {
  const rows: unknown[] = [];
  const collectRows = (value: unknown, depth = 0) => {
    if (!value || depth > 4) return;
    if (Array.isArray(value)) {
      value.forEach((item) => collectRows(item, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (
      'materiaalnaam' in record
      || 'naam' in record
      || 'product' in record
      || 'title' in record
    ) {
      rows.push(record);
      return;
    }
    Object.values(record).forEach((item) => collectRows(item, depth + 1));
  };

  collectRows(input);

  return rows
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Record<string, unknown>;
      const name = safeString(row.materiaalnaam)
        || safeString(row.naam)
        || safeString(row.product)
        || safeString(row.title);
      return name ? [sanitizeMaterialDescription(name)] : [];
    })
    .filter((name) => name && !isIgnoredWorkDeliveryMaterial(name))
    .slice(0, 20);
}

function buildSourceJob(jobId: string, job: Record<string, unknown>, index: number): WorkDescriptionSourceJob {
  const maatwerk = job.maatwerk && typeof job.maatwerk === 'object'
    ? job.maatwerk as Record<string, unknown>
    : {};
  const meta = maatwerk.meta && typeof maatwerk.meta === 'object'
    ? maatwerk.meta as Record<string, unknown>
    : (job.meta && typeof job.meta === 'object' ? job.meta as Record<string, unknown> : {});
  const materialen = job.materialen && typeof job.materialen === 'object'
    ? job.materialen as Record<string, unknown>
    : {};

  const title = safeString(meta.title) || safeString(job.title) || `Klus ${index + 1}`;
  const type = [safeString(meta.type), safeString(meta.slug)].filter(Boolean).join('/');
  const description = safeString(meta.description);
  const basis = maatwerk.basis ?? maatwerk.items;
  const additions = maatwerk.toevoegingen;
  const basisRows = formatContextEntries(basis, 30);
  const additionRows = formatContextEntries(additions, 30);
  const materialNames = getMaterialNames(materialen.materialen_lijst);
  const notes = safeString(maatwerk.notities) || safeString(job.material_notities) || safeString(job.notities);
  const workMethod = formatContextValue(job.werkwijze);

  return {
    id: jobId,
    index: index + 1,
    title,
    type,
    description,
    notes: truncateText(notes, 1200),
    details: [
      basisRows.length > 0 ? `Basis: ${basisRows.join('; ')}` : '',
      additionRows.length > 0 ? `Toevoegingen: ${additionRows.join('; ')}` : '',
      workMethod ? `Werkwijze: ${workMethod}` : '',
    ].filter(Boolean),
    materials: materialNames,
    dimensions: extractDimensionRows([basis, additions], title),
  };
}

async function buildQuoteCalculationContext(params: {
  quoteId: unknown;
  uid: string;
  firestore: Firestore;
}): Promise<QuoteCalculationContext> {
  const quoteId = safeString(params.quoteId);
  if (!quoteId) return { prompt: '', jobs: [] };

  const quoteSnap = await params.firestore.collection('quotes').doc(quoteId).get();
  if (!quoteSnap.exists) return { prompt: '', jobs: [] };

  const quote = quoteSnap.data() || {};
  if (quote.userId !== params.uid) return { prompt: '', jobs: [] };

  const klussen = quote.klussen && typeof quote.klussen === 'object'
    ? quote.klussen as Record<string, unknown>
    : {};
  const jobEntries = Object.entries(klussen)
    .filter(([, job]) => job && typeof job === 'object')
    .sort(([, left], [, right]) => {
      const leftOrder = Number((left as Record<string, unknown>).volgorde);
      const rightOrder = Number((right as Record<string, unknown>).volgorde);
      return (Number.isFinite(leftOrder) ? leftOrder : 0) - (Number.isFinite(rightOrder) ? rightOrder : 0);
    })
    .slice(0, 30);

  const quoteTitle = safeString(quote.titel) || safeString(quote.offerteNummer);
  const jobs = jobEntries.map(([jobId, job], index) => buildSourceJob(jobId, job as Record<string, unknown>, index));
  const jobLines = jobs.map((job) => [
    `Klus ${job.index} [${job.id}]: ${job.title}${job.type ? ` (${job.type})` : ''}${job.description ? ` - ${job.description}` : ''}`,
    ...job.details,
    job.materials.length > 0 ? `Gekozen materialen: ${job.materials.join(', ')}` : '',
    job.notes ? `Klusnotities: ${job.notes}` : '',
    job.dimensions.length > 0 ? `Maatvoering: ${job.dimensions.join(' | ')}` : '',
  ].filter(Boolean).join('\n'));

  return { prompt: [
    quoteTitle ? `Offertetitel: ${quoteTitle}` : '',
    ...jobLines,
  ].filter(Boolean).join('\n\n'), jobs };
}

function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const row = payload as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{
        text?: unknown;
        type?: unknown;
      }>;
    }>;
  };

  if (typeof row.output_text === 'string' && row.output_text.trim()) {
    return row.output_text.trim();
  }

  if (Array.isArray(row.output)) {
    const parts = row.output
      .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
      .map((content) => typeof content?.text === 'string' ? content.text : '')
      .filter(Boolean);
    if (parts.length > 0) return parts.join('\n').trim();
  }

  return '';
}

async function callOpenAiWorkDescription(apiKey: string, prompt: string): Promise<OpenAiWorkDescriptionResult> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: 'system',
          content: [{
            type: 'input_text',
            text: [
              'Je bent een Nederlandse Werk & Levering-generator voor offertes in de bouw.',
              'Je zet gebruikersnotities om naar zakelijke, concrete scope.',
              'Geef uitsluitend platte tekst terug. Geen JSON, geen markdown, geen uitleg.',
              'Gebruik alleen scope die expliciet in de aangeleverde context staat.',
            ].join('\n'),
          }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: prompt }],
        },
      ],
    }),
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = safeString((payload as { error?: { message?: unknown } }).error?.message) || 'OpenAI generatie mislukt.';
    throw new Error(message);
  }

  const outputText = extractResponseText(payload);
  if (!outputText) {
    throw new Error('OpenAI gaf geen leesbare output terug.');
  }

  return {
    rawOutput: outputText,
    parsed: parseJsonDeep(outputText) ?? outputText,
  };
}

function isWasteRemovalRow(value: string): boolean {
  const normalized = safeString(value).toLowerCase();
  if (!normalized) return false;
  return (
    (normalized.includes('afval') || normalized.includes('puin') || normalized.includes('restmateriaal'))
    && (
      normalized.includes('afvoer')
      || normalized.includes('meenem')
      || normalized.includes('stort')
      || normalized.includes('container')
      || normalized.includes('verwijder')
    )
  );
}

function getWasteRemovalPreferences(input: unknown): { jobs: boolean[]; active: boolean } {
  const raw = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const rawJobs = Array.isArray(raw.jobs) ? raw.jobs : [];
  const rawJobPreferences = rawJobs.map((job) => (
    Boolean(job && typeof job === 'object' && (job as Record<string, unknown>).afvalAfvoeren === true)
  ));
  const structured = sanitizeWorkDescriptionStructured(input);
  const jobs = rawJobPreferences.length > 0
    ? rawJobPreferences
    : structured.jobs.map((job) => job.afvalAfvoeren === true);
  const activeIndex = Math.max(0, Math.min(structured.activeJobIndex || 0, Math.max(0, jobs.length - 1)));
  return {
    jobs,
    active: jobs[activeIndex] === true || raw.afvalAfvoeren === true,
  };
}

function getRawWorkDescriptionControls(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
}

function enforceWasteRemovalPreferences(
  generated: WorkDescriptionStructured,
  structuredInput: unknown,
): WorkDescriptionStructured {
  const preferences = getWasteRemovalPreferences(structuredInput);
  const inputStructured = sanitizeWorkDescriptionStructured(structuredInput);
  const rawControls = getRawWorkDescriptionControls(structuredInput);
  const jobs = generated.jobs.map((job, index) => {
    const enabled = preferences.jobs[index] ?? preferences.active;
    const rawJobs = Array.isArray(rawControls.jobs) ? rawControls.jobs : [];
    const rawJobControls = rawJobs[index] && typeof rawJobs[index] === 'object'
      ? rawJobs[index] as Record<string, unknown>
      : null;
    const controls = inputStructured.jobs[index] || inputStructured.jobs[inputStructured.activeJobIndex || 0] || rawJobControls || rawControls || inputStructured;
    const electricalScope = controls.electricalScope && typeof controls.electricalScope === 'object'
      ? controls.electricalScope as WorkDescriptionStructured['electricalScope']
      : (rawControls.electricalScope && typeof rawControls.electricalScope === 'object'
          ? rawControls.electricalScope as WorkDescriptionStructured['electricalScope']
          : inputStructured.electricalScope);
    const finishLevel = (safeString(controls.finishLevel) || safeString(rawControls.finishLevel) || inputStructured.finishLevel) as WorkDescriptionStructured['finishLevel'];
    const customFinishDescription = safeString(controls.customFinishDescription) || safeString(rawControls.customFinishDescription) || undefined;
    const schilderwerkInbegrepen = controls.schilderwerkInbegrepen === true
      || rawControls.schilderwerkInbegrepen === true
      || inputStructured.schilderwerkInbegrepen === true;
    const stucwerkInbegrepen = false;
    const plamuurwerkInbegrepen = controls.plamuurwerkInbegrepen === true
      || rawControls.plamuurwerkInbegrepen === true
      || inputStructured.plamuurwerkInbegrepen === true;
    const kitwerkInbegrepen = false;
    const steigerInbegrepen = controls.steigerInbegrepen === true
      || rawControls.steigerInbegrepen === true
      || inputStructured.steigerInbegrepen === true;
    const sloopwerkInbegrepen = controls.sloopwerkInbegrepen === true
      || rawControls.sloopwerkInbegrepen === true
      || inputStructured.sloopwerkInbegrepen === true;
    const nadenVullenInbegrepen = controls.nadenVullenInbegrepen === true
      || rawControls.nadenVullenInbegrepen === true
      || inputStructured.nadenVullenInbegrepen === true;
    const nadenVullenAfwerkingsniveau = nadenVullenInbegrepen
      ? controls.nadenVullenAfwerkingsniveau === 'schilderklaar'
        || rawControls.nadenVullenAfwerkingsniveau === 'schilderklaar'
        || inputStructured.nadenVullenAfwerkingsniveau === 'schilderklaar'
          ? 'schilderklaar'
          : 'behangklaar'
      : undefined;
    const schroefgatenPlamurenInbegrepen = controls.schroefgatenPlamurenInbegrepen === true
      || rawControls.schroefgatenPlamurenInbegrepen === true
      || inputStructured.schroefgatenPlamurenInbegrepen === true;
    const safe = enforceWorkDeliverySafety({
      ...job,
      afvalAfvoeren: enabled,
      schilderwerkInbegrepen,
      stucwerkInbegrepen,
      plamuurwerkInbegrepen,
      kitwerkInbegrepen,
      steigerInbegrepen,
      sloopwerkInbegrepen,
      nadenVullenInbegrepen,
      nadenVullenAfwerkingsniveau,
      schroefgatenPlamurenInbegrepen,
      electricalScope,
      finishLevel,
      customFinishDescription,
    });
    return { ...job, ...safe, context: safe.summary };
  });
  const activeIndex = Math.max(0, Math.min(generated.activeJobIndex || 0, Math.max(0, jobs.length - 1)));
  const activeJob = jobs[activeIndex];
  const rootElectricalScope = activeJob?.electricalScope
    || (rawControls.electricalScope && typeof rawControls.electricalScope === 'object'
      ? rawControls.electricalScope as WorkDescriptionStructured['electricalScope']
      : inputStructured.electricalScope);
  const rootFinishLevel = (activeJob?.finishLevel || safeString(rawControls.finishLevel) || inputStructured.finishLevel) as WorkDescriptionStructured['finishLevel'];
  const rootCustomFinishDescription = activeJob?.customFinishDescription || safeString(rawControls.customFinishDescription) || inputStructured.customFinishDescription;
  const rootNadenVullenInbegrepen = activeJob
    ? activeJob.nadenVullenInbegrepen === true
    : rawControls.nadenVullenInbegrepen === true || inputStructured.nadenVullenInbegrepen === true;
  const rootNadenVullenAfwerkingsniveau = rootNadenVullenInbegrepen
    ? activeJob?.nadenVullenAfwerkingsniveau === 'schilderklaar'
      || rawControls.nadenVullenAfwerkingsniveau === 'schilderklaar'
      || inputStructured.nadenVullenAfwerkingsniveau === 'schilderklaar'
        ? 'schilderklaar'
        : 'behangklaar'
    : undefined;
  const root = enforceWorkDeliverySafety({
    ...sanitizeWorkDeliveryScope(generated),
    afvalAfvoeren: activeJob ? activeJob.afvalAfvoeren === true : preferences.active,
    schilderwerkInbegrepen: activeJob
      ? activeJob.schilderwerkInbegrepen === true
      : rawControls.schilderwerkInbegrepen === true || inputStructured.schilderwerkInbegrepen === true,
    stucwerkInbegrepen: false,
    plamuurwerkInbegrepen: activeJob
      ? activeJob.plamuurwerkInbegrepen === true
      : rawControls.plamuurwerkInbegrepen === true || inputStructured.plamuurwerkInbegrepen === true,
    kitwerkInbegrepen: false,
    steigerInbegrepen: activeJob
      ? activeJob.steigerInbegrepen === true
      : rawControls.steigerInbegrepen === true || inputStructured.steigerInbegrepen === true,
    sloopwerkInbegrepen: activeJob
      ? activeJob.sloopwerkInbegrepen === true
      : rawControls.sloopwerkInbegrepen === true || inputStructured.sloopwerkInbegrepen === true,
    nadenVullenInbegrepen: rootNadenVullenInbegrepen,
    nadenVullenAfwerkingsniveau: rootNadenVullenAfwerkingsniveau,
    schroefgatenPlamurenInbegrepen: activeJob
      ? activeJob.schroefgatenPlamurenInbegrepen === true
      : rawControls.schroefgatenPlamurenInbegrepen === true || inputStructured.schroefgatenPlamurenInbegrepen === true,
    electricalScope: rootElectricalScope,
    finishLevel: rootFinishLevel,
    customFinishDescription: rootCustomFinishDescription,
  });

  return {
    ...generated,
    ...root,
    context: root.summary,
    sections: activeJob?.sections || generated.sections,
    legacyNotes: activeJob?.legacyNotes || generated.legacyNotes,
    jobs,
    activeJobIndex: activeIndex,
  };
}

function enforceGenerationRules(
  generated: WorkDescriptionStructured,
  body: RequestBody | null,
): WorkDescriptionStructured {
  const completed = fillMissingGeneratedScope(generated, body);
  const noteJobs = getNoteJobs(body?.noteJobs);
  if (noteJobs.length > 0) {
    const controls = sanitizeWorkDescriptionStructured(body?.structuredInput);
    const acceptedWorkRows = new Set<string>();
    const generatedRows = noteJobs.map((_, index) => {
      const generatedJob = generated.jobs[index];
      const completedJob = completed.jobs[index];
      return [
        ...(generatedJob?.work_scope || []),
        safeString(generatedJob?.summary),
        safeString(generatedJob?.context),
        ...(completedJob?.work_scope || []),
        safeString(completedJob?.summary),
        safeString(completedJob?.context),
        safeString(generated.work_scope[index]),
      ]
        .map((row) => extractCandidateWorkText(row, index))
        .filter(Boolean);
    });
    const jobs = noteJobs.map((source, index) => {
      const candidates = generatedRows[index]
        .map((row) => row.replace(/^Klus\s+\d+\s*:\s*/i, '').trim())
        .filter(Boolean);
      const candidate = candidates.find((row) => {
        const key = row.toLowerCase().replace(/\s+/g, ' ').trim();
        return !acceptedWorkRows.has(key) && isGeneratedCandidateRelevant(source, row);
      });
      if (!candidate) {
        const missingFacts = candidates[0]
          ? getMissingMandatoryJobFacts(source, [candidates[0], source.dimensions.join(' ')].filter(Boolean).join(' '))
          : [];
        throw new Error([
          `Werk & Levering generatie ongeldig voor "${source.title}".`,
          missingFacts.length > 0 ? `Ontbrekende verplichte feiten: ${missingFacts.join(', ')}.` : 'Geen geldige tekst ontvangen voor deze notitieklus.',
        ].join(' '));
      }
      const workRow = cleanProfessionalScopeText(candidate);
      if (workRow) acceptedWorkRows.add(workRow.toLowerCase().replace(/\s+/g, ' ').trim());
      const generatedJob = generated.jobs[index];
      const completedJob = completed.jobs[index];
      return {
        ...completed.jobs[0],
        title: source.title,
        context: workRow,
        summary: workRow,
        work_scope: [workRow],
        materials: [],
        dimensions: deduplicateMeasurementRows([
          ...(generatedJob?.dimensions || []),
          ...(completedJob?.dimensions || []),
          ...source.dimensions,
        ]),
        included: generatedJob?.included || [],
        excluded: generatedJob?.excluded || [],
        internal_notes: generatedJob?.internal_notes || [],
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
      };
    });
    if (getWasteRemovalPreferences(body?.structuredInput).active && jobs.length > 0) {
      jobs[jobs.length - 1].work_scope.push('Afvoeren van vrijkomend afval en restmateriaal.');
    }
    const wasteIncluded = controls.afvalAfvoeren === true;
    return sanitizeWorkDescriptionStructured({
      ...completed,
      title: safeString(generated.title).replace(/^Klus\s+\d+\s*:\s*/i, '') || 'Werk & Levering',
      summary: normalizeWasteSummary(
        cleanProfessionalScopeText(safeString(generated.summary).replace(/^Klus\s+\d+\s*:\s*/i, '') || jobs[0].summary),
        wasteIncluded,
      ),
      work_scope: jobs[0].work_scope,
      dimensions: jobs[0].dimensions,
      jobs,
      activeJobIndex: 0,
      afvalAfvoeren: controls.afvalAfvoeren,
      schilderwerkInbegrepen: controls.schilderwerkInbegrepen,
      stucwerkInbegrepen: controls.stucwerkInbegrepen,
      plamuurwerkInbegrepen: controls.plamuurwerkInbegrepen,
      kitwerkInbegrepen: controls.kitwerkInbegrepen,
      steigerInbegrepen: controls.steigerInbegrepen,
      sloopwerkInbegrepen: controls.sloopwerkInbegrepen,
      nadenVullenInbegrepen: controls.nadenVullenInbegrepen,
      nadenVullenAfwerkingsniveau: controls.nadenVullenAfwerkingsniveau,
      schroefgatenPlamurenInbegrepen: controls.schroefgatenPlamurenInbegrepen,
      electricalScope: controls.electricalScope,
      finishLevel: controls.finishLevel,
      customFinishDescription: controls.customFinishDescription,
    });
  }
  const sourceJobs = Array.isArray(body?.sourceJobs)
    ? body.sourceJobs.filter((job): job is WorkDescriptionSourceJob => Boolean(job && typeof job === 'object'))
    : [];
  const completedWithSourceJobs = sanitizeWorkDescriptionStructured(completed);
  const wasteFiltered = enforceWasteRemovalPreferences(completedWithSourceJobs, body?.structuredInput);
  // Free-form notes guide generation, but are not a schema. Do not mechanically
  // copy every unmatched fragment into customer-facing work scope.
  const notesCovered = wasteFiltered;
  const sourceDimensions = sourceJobs.flatMap((job) => Array.isArray(job.dimensions) ? job.dimensions : []);
  const noteDimensions = extractNoteDimensionRows(body?.notesContext);
  const requiredDimensions = deduplicateMeasurementRows([...sourceDimensions, ...noteDimensions]);
  const activeIndex = Math.max(0, Math.min(notesCovered.activeJobIndex || 0, Math.max(0, notesCovered.jobs.length - 1)));
  const jobsWithDimensions = notesCovered.jobs.length > 0
    ? notesCovered.jobs.map((job, index) => index === activeIndex
      ? { ...job, dimensions: deduplicateMeasurementRows([...job.dimensions, ...requiredDimensions]) }
      : job)
    : notesCovered.jobs;
  const withDimensions = sanitizeWorkDescriptionStructured({
    ...notesCovered,
    dimensions: deduplicateMeasurementRows([...notesCovered.dimensions, ...requiredDimensions]),
    jobs: jobsWithDimensions,
  });
  const withoutMaterialSection = {
    ...withDimensions,
    materials: [],
    jobs: withDimensions.jobs.map((job) => ({ ...job, materials: [] })),
  };
  return enforceWasteRemovalPreferences(withoutMaterialSection, body?.structuredInput);
}

function getMaterialContextRows(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const name = sanitizeMaterialDescription(safeString(row.name));
    if (!name || isIgnoredWorkDeliveryMaterial(name) || !isCustomerRelevantProductChoice(name)) return [];
    const quantity = Number(row.quantity);
    const unit = safeString(row.unit) || 'stuk';
    const amount = Number.isFinite(quantity) && quantity > 0
      ? `${Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.?0+$/, '')} ${unit}`.trim()
      : '';
    return [amount ? `${name} (${amount})` : name];
  });
}

function normalizeForMaterialComparison(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isCustomerRelevantProductChoice(value: string): boolean {
  const normalized = normalizeForMaterialComparison(value);
  if (!normalized) return false;
  const isScopeRelevantMembrane = /(damprem|dampdicht|dampopen|klimaatfolie|miofol|spinvlies|waterkerend|luchtdicht|vochtwer)/i.test(normalized);
  if (/(schroef|schroeven|lijm|contactlijm|kit\b|ms polymeer|cleaner|ontvetter|handschoen|tape|butylband|schuurpapier|poetsdoek|doek|neopreen|aansluitkit|bevestig)/i.test(normalized)) {
    return false;
  }
  if (/\bfolie\b/i.test(normalized) && !isScopeRelevantMembrane) return false;
  return /(keralit|trespa|hpl|rockpanel|gevelbekleding|boeiboord|boeiboorden|epdm|underlayment|daktrim|dakbedekking|ral 7016|antraciet|anthracite|isolatie|glaswol|steenwol|minerale wol|acoustifit|enotherm|enertherm|pir\b|eps\b|xps\b|rd\s*[,.\d]|damprem|dampdicht|dampopen|klimaatfolie|miofol|waterkerend|luchtdicht)/i.test(normalized);
}

function fillMissingGeneratedScope(
  generated: WorkDescriptionStructured,
  body: RequestBody | null,
): WorkDescriptionStructured {
  const existing = sanitizeWorkDescriptionStructured(body?.structuredInput);
  const existingActiveIndex = Math.max(
    0,
    Math.min(existing.activeJobIndex || 0, Math.max(0, existing.jobs.length - 1)),
  );
  const existingActiveJob = existing.jobs[existingActiveIndex] || existing;
  const approvedMaterials = getMaterialContextRows(body?.materialContext);

  const fillJob = (
    job: WorkDescriptionStructured['jobs'][number],
    index: number,
  ): WorkDescriptionStructured['jobs'][number] => {
    const fallback = existing.jobs[index] || existingActiveJob;
    const summary = job.summary || fallback.summary || safeString(body?.context);
    const completed = completeWorkDeliveryScope({
      ...job,
      title: job.title || fallback.title || safeString(body?.title),
      summary,
      work_scope: summaryToWorkScopeRows(summary),
      materials: job.materials.length > 0
        ? job.materials
        : (fallback.materials.length > 0 ? fallback.materials : approvedMaterials),
      dimensions: job.dimensions.length > 0 ? job.dimensions : fallback.dimensions,
      included: job.included.length > 0 ? job.included : fallback.included,
      excluded: job.excluded.length > 0 ? job.excluded : fallback.excluded,
      internal_notes: job.internal_notes.length > 0 ? job.internal_notes : fallback.internal_notes,
    }, safeString(body?.title) || safeString(body?.category));
    return { ...job, ...completed, context: completed.summary };
  };

  const jobs = generated.jobs.length > 0
    ? generated.jobs.map(fillJob)
    : [fillJob({
        ...existingActiveJob,
        title: generated.title,
        context: generated.context,
        summary: generated.summary,
        work_scope: generated.work_scope,
        materials: generated.materials,
        dimensions: generated.dimensions,
        included: generated.included,
        excluded: generated.excluded,
        internal_notes: generated.internal_notes,
      }, existingActiveIndex)];
  const activeIndex = Math.max(
    0,
    Math.min(generated.activeJobIndex || 0, Math.max(0, jobs.length - 1)),
  );
  const activeJob = jobs[activeIndex];

  return sanitizeWorkDescriptionStructured({
    ...generated,
    title: activeJob.title,
    context: activeJob.summary,
    summary: activeJob.summary,
    work_scope: activeJob.work_scope,
    materials: activeJob.materials,
    dimensions: activeJob.dimensions,
    included: activeJob.included,
    excluded: activeJob.excluded,
    internal_notes: activeJob.internal_notes,
    jobs,
    activeJobIndex: activeIndex,
  });
}

function pickFirstString(
  source: Record<string, unknown> | null | undefined,
  keys: string[],
): string {
  if (!source) return '';
  for (const key of keys) {
    const value = safeString(source[key]);
    if (value) return value;
  }
  return '';
}

function normalizeStepRows(input: unknown, max = 100): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .flatMap((entry) => {
      if (typeof entry === 'string') {
        const text = entry.trim();
        if (!text) return '';
        const parsed = parseJsonDeep(text);
        if (parsed && parsed !== text) {
          const nested = extractRowsFromUnknown(parsed);
          if (nested.length > 0) return nested;
        }
        return text;
      }
      if (!entry || typeof entry !== 'object') return '';
      const row = entry as Record<string, unknown>;
      const direct =
        safeString(row.stap)
        || safeString(row.step)
        || safeString(row.description)
        || safeString(row.text);

      if (direct) {
        const parsed = parseJsonDeep(direct);
        if (parsed && parsed !== direct) {
          const nested = extractRowsFromUnknown(parsed);
          if (nested.length > 0) return nested;
        }
      }

      const nestedRows = extractRowsFromUnknown(row.werkbeschrijving ?? row.output ?? row.data ?? null);
      if (nestedRows.length > 0) return nestedRows;

      return direct;
    })
    .filter(Boolean)
    .slice(0, max);
}

function parseJsonDeep(input: string, maxDepth = 4): unknown | null {
  let current: unknown = input;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (typeof current !== 'string') return current;
    const parsed = parseJsonString(current);
    if (!parsed || parsed === current) return parsed;
    current = parsed;
  }
  return current;
}

function extractDirectWerkbeschrijving(result: unknown): string[] {
  if (!result || typeof result !== 'object') return [];
  const row = result as { werkbeschrijving?: unknown; output?: unknown };

  const direct = normalizeStepRows(row.werkbeschrijving);
  if (direct.length > 0) return direct;

  if (typeof row.output === 'string' && row.output.trim()) {
    const parsed = parseJsonDeep(row.output);
    if (parsed && typeof parsed === 'object') {
      const parsedRow = parsed as { werkbeschrijving?: unknown };
      const parsedDirect = normalizeStepRows(parsedRow.werkbeschrijving);
      if (parsedDirect.length > 0) return parsedDirect;
      return extractRowsFromUnknown(parsed);
    }
  }

  return [];
}

function hasStructuredContent(value: WorkDescriptionStructured): boolean {
  return Boolean(
    value.title
    || value.summary
    || value.work_scope.length > 0
    || value.materials.length > 0
    || value.dimensions.length > 0
    || value.included.length > 0
    || value.jobs.length > 0
    || value.sections.voorbereiding.length > 0
    || value.sections.uitvoering.length > 0
    || value.sections.afwerking.length > 0
    || (value.legacyNotes?.length || 0) > 0
  );
}

function countWorkScopeRows(value: WorkDescriptionStructured | null): number {
  if (!value) return 0;
  if (value.jobs.length > 0) {
    return value.jobs.reduce((count, job) => (
      count + job.work_scope.filter((row) => safeString(row).length > 0).length
    ), 0);
  }
  return value.work_scope.filter((row) => safeString(row).length > 0).length;
}

function hasWorkScopeRows(value: WorkDescriptionStructured | null): boolean {
  return countWorkScopeRows(value) > 0;
}

function summaryToWorkScopeRows(value: string): string[] {
  const compact = safeString(value).replace(/\s+/g, ' ');
  if (!compact) return [];
  const cleaned = cleanProfessionalScopeText(compact);
  return [/[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`];
}

function copyGeneratedSummaryToWorkScope(value: WorkDescriptionStructured): WorkDescriptionStructured {
  const rootSummaryRows = summaryToWorkScopeRows(value.summary || value.context);

  if (value.jobs.length > 0) {
    const activeIndex = Math.max(0, Math.min(value.activeJobIndex || 0, value.jobs.length - 1));
    return {
      ...value,
      work_scope: rootSummaryRows.length > 0 ? rootSummaryRows : value.work_scope,
      jobs: value.jobs.map((job, index) => {
        const jobRows = summaryToWorkScopeRows(job.summary || job.context);
        const rows = jobRows.length > 0
          ? jobRows
          : (index === activeIndex && rootSummaryRows.length > 0 ? rootSummaryRows : job.work_scope);
        return { ...job, work_scope: rows };
      }),
    };
  }

  return {
    ...value,
    work_scope: rootSummaryRows.length > 0 ? rootSummaryRows : value.work_scope,
  };
}

function forceWorkScopeFromText(value: WorkDescriptionStructured, fallbackText: string): WorkDescriptionStructured {
  const text = safeString(value.summary || value.context || fallbackText);
  if (!text) return value;
  return copyGeneratedSummaryToWorkScope({
    ...value,
    summary: value.summary || text,
    context: value.context || text,
  });
}

function getMissingNoteRequirements(
  structured: WorkDescriptionStructured | null,
  notesContext: unknown,
): string[] {
  if (!structured) return extractRequiredNoteRequirements(notesContext);
  const generatedRows = [
    ...structured.work_scope,
    ...structured.dimensions,
    ...structured.jobs.flatMap((job) => job.work_scope),
    ...structured.jobs.flatMap((job) => job.dimensions),
  ].filter(Boolean);

  return extractRequiredNoteRequirements(notesContext)
    .filter((requirement) => !isWasteRemovalRow(requirement))
    // A requirement is covered only when one coherent work row contains it.
    // Combining unrelated words and measurements across the whole document
    // previously produced false positives for omitted note scope.
    .filter((requirement) => !generatedRows.some((row) => isNoteRequirementCovered(requirement, row)));
}

function finalizeNoteCoverage(
  structured: WorkDescriptionStructured,
  notesContext: unknown,
): WorkDescriptionStructured {
  // Structured maatwerk dimensions remain authoritative. Other free-form notes
  // are prompt context and must never block or mechanically rewrite the result.
  return enforceRequiredMaatwerkCoverage(structured, notesContext);
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
  let parsedOutput: {
    jobs?: unknown;
    werkbeschrijving_structured?: unknown;
    werkbeschrijvingStructured?: unknown;
    korteTitel?: unknown;
    korteBeschrijving?: unknown;
    hoofdtitel?: unknown;
    samenvatting?: unknown;
    werkbeschrijving?: unknown;
  } | null = null;
  if (typeof row.output === 'string' && row.output.trim()) {
    const parsed = parseJsonDeep(row.output);
    if (parsed && typeof parsed === 'object') {
      parsedOutput = parsed as {
        jobs?: unknown;
        werkbeschrijving_structured?: unknown;
        werkbeschrijvingStructured?: unknown;
        korteTitel?: unknown;
        korteBeschrijving?: unknown;
        hoofdtitel?: unknown;
        samenvatting?: unknown;
        werkbeschrijving?: unknown;
      };
    } else {
      parsedOutput = null;
    }
  }

  const directCandidate = row.werkbeschrijving_structured ?? row.werkbeschrijvingStructured;
  if (directCandidate) {
    const structured = sanitizeWorkDescriptionStructured(directCandidate);
    if (hasStructuredContent(structured)) {
      const rowRecord = row as unknown as Record<string, unknown>;
      const parsedRecord = (parsedOutput || {}) as Record<string, unknown>;
      return {
        ...structured,
        title: structured.title
          || pickFirstString(rowRecord, ['korteTitel', 'korte_titel', 'korteTitle', 'kortetitle', 'hoofdTitel', 'hoofdtitel', 'hoofdTitle', 'hoofdtitle', 'title'])
          || pickFirstString(parsedRecord, ['korteTitel', 'korte_titel', 'korteTitle', 'kortetitle', 'hoofdTitel', 'hoofdtitel', 'hoofdTitle', 'hoofdtitle', 'title']),
        context: structured.context
          || pickFirstString(rowRecord, ['korteBeschrijving', 'korte_beschrijving', 'korteBeschrijvingTekst', 'samenvatting', 'summary', 'context'])
          || pickFirstString(parsedRecord, ['korteBeschrijving', 'korte_beschrijving', 'korteBeschrijvingTekst', 'samenvatting', 'summary', 'context']),
      };
    }
  }

  const rowRecord = row as unknown as Record<string, unknown>;
  const parsedRecord = (parsedOutput || {}) as Record<string, unknown>;

  if (parsedOutput) {
    try {
      const structuredFromParsedOutput = sanitizeWorkDescriptionStructured(parsedOutput);
      if (hasStructuredContent(structuredFromParsedOutput)) {
        return structuredFromParsedOutput;
      }

      const parsedDirectCandidate = parsedOutput.werkbeschrijving_structured ?? parsedOutput.werkbeschrijvingStructured;
      if (parsedDirectCandidate) {
        const structured = sanitizeWorkDescriptionStructured(parsedDirectCandidate);
        if (hasStructuredContent(structured)) {
          return {
            ...structured,
            title: structured.title
              || pickFirstString(parsedRecord, ['korteTitel', 'korte_titel', 'korteTitle', 'kortetitle', 'hoofdTitel', 'hoofdtitel', 'hoofdTitle', 'hoofdtitle', 'title'])
              || pickFirstString(rowRecord, ['korteTitel', 'korte_titel', 'korteTitle', 'kortetitle', 'hoofdTitel', 'hoofdtitel', 'hoofdTitle', 'hoofdtitle', 'title']),
            context: structured.context
              || pickFirstString(parsedRecord, ['korteBeschrijving', 'korte_beschrijving', 'korteBeschrijvingTekst', 'samenvatting', 'summary', 'context'])
              || pickFirstString(rowRecord, ['korteBeschrijving', 'korte_beschrijving', 'korteBeschrijvingTekst', 'samenvatting', 'summary', 'context']),
          };
        }
      }

      const parsedRows = normalizeStepRows(parsedOutput.werkbeschrijving);
      if (parsedRows.length > 0) {
        const structured = toStructuredWorkDescription({
          korteTitel: pickFirstString(parsedRecord, ['korteTitel', 'korte_titel', 'korteTitle', 'kortetitle', 'hoofdTitel', 'hoofdtitel', 'hoofdTitle', 'hoofdtitle', 'title']),
          korteBeschrijving: pickFirstString(parsedRecord, ['korteBeschrijving', 'korte_beschrijving', 'korteBeschrijvingTekst', 'samenvatting', 'summary', 'context']),
          werkbeschrijving: parsedRows,
        });
        if (hasStructuredContent(structured)) return structured;
      }
    } catch {
      // ignore malformed JSON output wrapper
    }
  }

  const structuredFromRow = sanitizeWorkDescriptionStructured(row);
  if (hasStructuredContent(structuredFromRow)) {
    return structuredFromRow;
  }

  const fallbackRows = extractDirectWerkbeschrijving(row);
  const fallbackTitle = pickFirstString(rowRecord, ['korteTitel', 'korte_titel', 'korteTitle', 'kortetitle', 'hoofdTitel', 'hoofdtitel', 'hoofdTitle', 'hoofdtitle', 'title'])
    || pickFirstString(parsedRecord, ['korteTitel', 'korte_titel', 'korteTitle', 'kortetitle', 'hoofdTitel', 'hoofdtitel', 'hoofdTitle', 'hoofdtitle', 'title']);
  const fallbackSummary = pickFirstString(rowRecord, ['korteBeschrijving', 'korte_beschrijving', 'korteBeschrijvingTekst', 'samenvatting', 'summary', 'context'])
    || pickFirstString(parsedRecord, ['korteBeschrijving', 'korte_beschrijving', 'korteBeschrijvingTekst', 'samenvatting', 'summary', 'context']);
  if (fallbackRows.length > 0 || fallbackTitle || fallbackSummary) {
    const structured = toStructuredWorkDescription({
      korteTitel: fallbackTitle,
      korteBeschrijving: fallbackSummary,
      werkbeschrijving: fallbackRows,
    });
    if (hasStructuredContent(structured)) return structured;
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

function parseJsonString(input: string): unknown | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const candidates = [trimmed];
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch?.[1]) {
    candidates.push(fencedMatch[1].trim());
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // continue
    }
  }

  return null;
}

function extractRowsFromUnknown(input: unknown): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return normalizeStepRows(input, 100);
  if (typeof input === 'string') {
    const parsedFromString = parseJsonDeep(input);
    if (parsedFromString && parsedFromString !== input) {
      const nestedRows = extractRowsFromUnknown(parsedFromString);
      if (nestedRows.length > 0) return nestedRows;
    }
    return toLines(input);
  }
  if (typeof input !== 'object') return [];

  const row = input as Record<string, unknown>;

  const directRows = normalizeStepRows(
    row.werkbeschrijving ?? row.stappen ?? row.steps ?? row.uitvoering ?? row.items,
    100
  );
  if (directRows.length > 0) return directRows;

  if (Array.isArray(row.jobs)) {
    const jobStepRows = row.jobs
      .flatMap((job) => {
        if (!job || typeof job !== 'object') return [];
        const jobRow = job as Record<string, unknown>;
        return normalizeStepRows(jobRow.werkbeschrijving ?? jobRow.steps ?? jobRow.stappen, 100);
      })
      .filter(Boolean)
      .slice(0, 100);
    if (jobStepRows.length > 0) return jobStepRows;

    const jobRows = row.jobs
      .map((job) => {
        if (!job || typeof job !== 'object') return '';
        const jobRow = job as Record<string, unknown>;
        return (
          safeString(jobRow.korteBeschrijving)
          || safeString(jobRow.beschrijving)
          || safeString(jobRow.description)
          || safeString(jobRow.korteTitel)
          || safeString(jobRow.title)
        );
      })
      .filter(Boolean)
      .slice(0, 100);
    if (jobRows.length > 0) return jobRows;
  }

  const nestedCandidates = [row.output, row.description, row.text, row.result, row.content];
  for (const candidate of nestedCandidates) {
    const rows = extractRowsFromUnknown(candidate);
    if (rows.length > 0) return rows;
  }

  return [];
}

function parseWorkDescription(output: string): string[] {
  const directLines = toLines(output);
  if (directLines.length > 1 && !output.trim().startsWith('{') && !output.trim().startsWith('[')) {
    return directLines;
  }

  const parsed = parseJsonDeep(output);
  if (parsed) {
    const rows = extractRowsFromUnknown(parsed);
    if (rows.length > 0) return rows;
  }

  return directLines.length > 0 ? directLines : [output.trim()];
}

function buildPromptFromBody(body: RequestBody): string {
  const directPrompt = safeString(body.prompt);
  const calculationContext = safeString(body.quoteCalculationContext);
  const preferences = getWasteRemovalPreferences(body.structuredInput);
  const wasteRemovalRule = preferences.active
    ? 'Afval afvoeren staat expliciet AAN. Verwerk dit in de professionele klanttekst wanneer het onderdeel van de afspraak is. Zet deze niet onder included.'
    : WASTE_REMOVAL_DISABLED_RULE;
  const structuredControls = sanitizeWorkDescriptionStructured(body.structuredInput);
  const sourceJobs = Array.isArray(body.sourceJobs)
    ? body.sourceJobs.filter((job): job is WorkDescriptionSourceJob => Boolean(job && typeof job === 'object'))
    : [];
  const noteJobs = getNoteJobs(body.noteJobs);
  const paintingRule = structuredControls.schilderwerkInbegrepen
    ? 'Schilderwerk inbegrepen staat expliciet AAN. Verwerk het concrete schilderwerk in de professionele klanttekst. Gebruik details uit de notities, bijvoorbeeld wat wordt geschilderd en een nog te kiezen kleur. Zet schilderwerk niet onder included of excluded.'
    : 'Schilderwerk inbegrepen staat UIT. Neem schilderwerk, sauswerk, aflakken of verven niet op als inbegrepen werk.';
  const stuccoRule = structuredControls.stucwerkInbegrepen
    ? 'Stucwerk inbegrepen staat expliciet AAN. Behoud alle expliciete stucwerkzaamheden, aantallen en maatvoering en verwerk het concrete stucwerk in de professionele klanttekst. Zet stucwerk niet onder included.'
    : 'Stucwerk heeft geen aparte aan/uit-schakelaar. Neem stucwerk alleen op wanneer het concreet in de notities, brongegevens of werkzaamheden staat; voeg geen automatische uitsluiting voor stucwerk toe.';
  const fillingRule = structuredControls.plamuurwerkInbegrepen
    ? 'Plamuurwerk inbegrepen staat expliciet AAN. Verwerk het concrete overeengekomen plamuurwerk in de professionele klanttekst. Zet dit werk niet onder included of excluded.'
    : 'Plamuurwerk inbegrepen staat UIT. Neem plamuurwerk niet op als inbegrepen werk.';
  const sealingRule = structuredControls.kitwerkInbegrepen
    ? 'Kitwerk inbegrepen staat expliciet AAN. Verwerk het concrete overeengekomen kitwerk in de professionele klanttekst. Zet dit werk niet onder included of excluded.'
    : 'Kitwerk heeft geen aparte aan/uit-schakelaar. Neem kitwerk alleen op wanneer het concreet in de notities, brongegevens of werkzaamheden staat; voeg geen automatische uitsluiting voor kitwerk toe.';
  const scaffoldRule = structuredControls.steigerInbegrepen
    ? 'Steiger inbegrepen staat expliciet AAN. Verwerk het concrete overeengekomen steigerwerk in de professionele klanttekst.'
    : 'Steiger inbegrepen staat UIT. Neem geen steiger, steigerhuur of steigerwerk op als inbegrepen werk.';
  const demolitionRule = structuredControls.sloopwerkInbegrepen
    ? 'Sloopwerk inbegrepen staat expliciet AAN. Verwerk het concrete overeengekomen sloopwerk in de professionele klanttekst.'
    : 'Sloopwerk inbegrepen staat UIT. Neem geen sloopwerk op als inbegrepen werk.';
  const seamFillingRule = structuredControls.nadenVullenInbegrepen
    ? structuredControls.nadenVullenAfwerkingsniveau === 'schilderklaar'
      ? 'Naden vullen staat expliciet AAN op afwerkingsniveau Q4 (schilderklaar). Verwerk het vullen en schilderklaar afwerken van de overeengekomen naden in de professionele klanttekst.'
      : 'Naden vullen staat expliciet AAN op afwerkingsniveau Q2 (behangklaar). Verwerk het vullen en behangklaar afwerken van de overeengekomen naden in de professionele klanttekst.'
    : 'Naden vullen inbegrepen staat UIT. Neem het vullen of afwerken van naden niet op als inbegrepen werk.';
  const screwHoleFillingRule = structuredControls.schroefgatenPlamurenInbegrepen
    ? 'Schroefgaten plamuren staat expliciet AAN. Verwerk het plamuren van de schroefgaten in de professionele klanttekst.'
    : 'Schroefgaten plamuren staat UIT. Neem het plamuren of vullen van schroefgaten niet op als inbegrepen werk.';
  const electricalRule = structuredControls.electricalScope.enabled
    ? 'Elektrawerk inbegrepen staat expliciet AAN. Verwerk ieder concreet overeengekomen elektrisch onderdeel in de professionele klanttekst. Zet elektrawerk niet onder included.'
    : 'Elektrawerk inbegrepen staat UIT. Neem elektrawerk niet op als inbegrepen werk.';
  const notesRule = safeString(body.notesContext) && noteJobs.length === 0
    ? [
        'REGELS VOOR GEBRUIKERSNOTITIES:',
        'Gebruik iedere concrete werkzaamheid en keuze uit de gebruikersnotities als bron, maar kopieer ruwe notitieregels niet letterlijk.',
        'Combineer verwante notities tot één professionele klanttekst en beschrijf iedere concrete werkzaamheid precies één keer.',
        'Zet losse afmetingen en maatopsommingen in dimensions. Herhaal ze alleen in de klanttekst wanneer de maat nodig is om de werkzaamheid ondubbelzinnig te beschrijven.',
        'Behoud expliciete aantallen en berekende eindtotalen exact, maar vermeld ieder feit op één logische plaats.',
        'De offerte is definitief: gebruik uitsluitend concrete, professionele formuleringen.',
        'Verwijder onzekere taal zoals "eventueel", "mogelijk", "iets anders", "indien nodig" en "in overleg".',
        'Wanneer een notitie eerst een concrete werkwijze noemt en daarna een vaag alternatief, gebruik alleen de concrete werkwijze.',
        'Controleer voor je antwoord of alle concrete afspraken inhoudelijk terugkomen zonder doublures.',
      ].join(' ')
    : '';
  const scopeRules = [
    'Geef uitsluitend platte tekst terug. Geen JSON. Geen markdown. Geen codeblok. Geen velden zoals title, summary, jobs, work_scope, dimensions, included of excluded.',
    'Schrijf geen stappenplan en geen uitvoeringsvolgorde.',
    'Gebruik nooit de secties Voorbereiding, Uitvoering of Afwerking.',
    noteJobs.length > 0
      ? [
          `De notities bevatten ${noteJobs.length} klussen. Schrijf voor iedere notitieklus één eigen alinea in dezelfde volgorde.`,
          'Begin iedere alinea met de notitietitel gevolgd door een dubbele punt en daarna de professionele klanttekst.',
          'Plaats exact één lege regel tussen de alinea’s van verschillende notitieklussen.',
          'Elke alinea mag uitsluitend informatie gebruiken uit zijn eigen object in NOTITIEKLUSSEN: title, notes en dimensions.',
          'Verplaats nooit feiten, aantallen, maatvoering, materialen, kleuren, locaties, inbegrepen werk of schilderwerk van de ene job naar een andere job.',
          'Alle aantallen, hoeveelheden, kleuren, materialen, locaties, inbegrepen werkzaamheden en uitsluitingen zijn contractuele feiten en moeten in dezelfde alinea blijven staan.',
          'Gebruik dimensions alleen om te begrijpen waar de klus over gaat. Kopieer de losse maatvoeringsregels uit dimensions niet letterlijk in de klanttekst.',
          'Maak nooit een jobtekst die alleen uit maatvoering bestaat. De klanttekst moet altijd een echte werkzaamheid beschrijven: wat wordt gecontroleerd, vervangen, geplaatst, vernieuwd, geschilderd of uitgevoerd.',
          'Als notes leeg is maar title en dimensions bestaan, schrijf dan een korte professionele klanttekst op basis van de title als werkzaamheid; herhaal de losse maatvoering niet.',
          'Als notes concrete tekst bevat, gebruik die tekst als hoofdbron voor de werkzaamheid; gebruik dimensions alleen als aparte maatvoering.',
          'Vat aantallen nooit samen tot algemene meervouden: "9x houten kozijn" moet in de output staan als "9 houten kozijnen"; "9x houten draairaam" als "9 houten draairamen"; "2 zijdes" als "2 zijden" of "twee zijden".',
          'Laat geen notitieklus leeg. Als er weinig informatie is, schrijf dan toch een korte zakelijke zin op basis van de titel.',
          'Gebruik nooit labels zoals "Klus 1" of "Klus 2".',
        ].join(' ')
      : sourceJobs.length > 0
      ? `De calculatie bevat ${sourceJobs.length} afzonderlijke klussen. Schrijf voor iedere klus één eigen alinea in dezelfde volgorde als de calculatiedata. Kopieer nooit dezelfde algemene tekst naar meerdere klussen.`
      : 'Maak één professionele klanttekst voor de afgesproken werkzaamheden.',
    'Combineer alle eigenschappen die bij dezelfde klus horen in dezelfde klanttekst. Een verhoogde vloer en de gekozen vloerplaat zijn bijvoorbeeld eigenschappen van dezelfde vloerklus en worden geen dubbele vloerregels.',
    'Gebruik de specifieke klussoort als onderwerp. Maak van boeiboorden, plafonds, wanden, vloeren, kozijnen en ander timmerwerk ieder een passende beschrijving; gebruik geen algemene vloertekst voor een andere klussoort.',
    'Verzin geen werkzaamheden, afwerkingsniveau, elektrawerk, sloopwerk of afvalafvoer.',
    'Beschrijf geen methode tenzij deze expliciet is aangeleverd.',
    'Gebruik niet de woorden eerst, vervolgens, daarna, stap 1 of stap 2.',
    'Neem alleen scope over die expliciet blijkt uit notities, maatvoering of calculatiedata.',
    'Expliciete aantallen, aantallen per woning/object en eindtotalen uit notities zijn essentiële feiten en mogen nooit worden verkort of impliciet geformuleerd.',
    'Gebruik materials altijd als lege array. Maak geen aparte materialen/productenlijst.',
    'Verwerk alleen klant-relevante productkeuzes in de klanttekst wanneer ze belangrijk zijn voor vertrouwen of afspraak, zoals Keralit, Trespa/HPL, Rockpanel, EPDM, underlayment of type/kleur gevelbekleding.',
    'Noem geen verbruiksartikelen of hulpmaterialen zoals lijm, kit, cleaner, ontvetter, schroeven, handschoenen, folie, tape, band of schuurpapier.',
    'Negeer administratieve regels met de naam "Extra kosten".',
    'Noem geen bestelhoeveelheden van materialen; behoud wel werkhoeveelheden, productafmetingen en productspecificaties die de afspraak beschrijven.',
    noteJobs.length > 0
      ? 'Bij NOTITIEKLUSSEN: herhaal geen individuele maatvoeringsregels uit dimensions in de klanttekst; die staan al onder Maatvoering en mogen niet dubbel worden beschreven.'
      : '',
    'Plaats bij onduidelijkheid een veilige uitsluiting onder excluded of laat het onderdeel weg.',
    'Formuleer commercieel en bescherm tegen scope creep en onbetaald meerwerk.',
    noteJobs.length > 0
      ? 'Maak per NOTITIEKLUS één eigen professionele klanttekst die alleen de scope van die specifieke notitieklus beschrijft.'
      : sourceJobs.length > 0
      ? 'Maak per job één eigen professionele klanttekst die alleen de scope van die specifieke job beschrijft.'
      : 'Maak één professionele klanttekst die de volledige afgesproken scope beschrijft.',
    'Er geldt geen maximum van twee zinnen. Gebruik zoveel zinnen als nodig zijn om de klus volledig en begrijpelijk te beschrijven.',
  ].join(' ');
  if (directPrompt) {
    return [
      directPrompt,
      noteJobs.length > 0 ? `NOTITIEKLUSSEN (ENIGE BRON VOOR DE KLUSINDELING):\n${JSON.stringify(noteJobs)}` : '',
      noteJobs.length === 0 && calculationContext ? `CALCULATIEDATA UIT FIRESTORE:\n${calculationContext}` : '',
      noteJobs.length === 0 && calculationContext
        ? 'Gebruik deze calculatiedata als bron voor klussoort, plaatsing/montage, maatvoering, gekozen materialen en onderdelen. Neem geen prijzen op.'
        : '',
      scopeRules,
      notesRule,
      paintingRule,
      stuccoRule,
      fillingRule,
      sealingRule,
      seamFillingRule,
      screwHoleFillingRule,
      scaffoldRule,
      demolitionRule,
      electricalRule,
      wasteRemovalRule,
    ].filter(Boolean).join('\n\n');
  }

  const parts = [
    safeString(body.title) ? `Titel: ${safeString(body.title)}` : '',
    safeString(body.context) ? `Context: ${safeString(body.context)}` : '',
    safeString(body.category) ? `Categorie: ${safeString(body.category)}` : '',
    safeString(body.notesContext) && noteJobs.length === 0 ? `Notities: ${safeString(body.notesContext)}` : '',
    safeString(body.measurementsContext) ? `Maatvoering: ${safeString(body.measurementsContext)}` : '',
    calculationContext ? `Calculatiedata uit Firestore:\n${calculationContext}` : '',
  ].filter(Boolean);

  return [...parts, scopeRules, notesRule, paintingRule, stuccoRule, fillingRule, sealingRule, seamFillingRule, screwHoleFillingRule, scaffoldRule, demolitionRule, electricalRule, wasteRemovalRule].filter(Boolean).join('\n');
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { auth, firestore } = initFirebaseAdmin();
    let uid = '';
    try {
      const decoded = await auth.verifyIdToken(token);
      uid = decoded.uid;
      const trialBlockedResponse = await ensureDemoTrialActiveByUid(decoded.uid);
      if (trialBlockedResponse) return trialBlockedResponse;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const rawBody = (await request.json().catch(() => null)) as RequestBody | null;
    const quoteCalculation = await buildQuoteCalculationContext({
      quoteId: rawBody?.quoteId,
      uid,
      firestore,
    }).catch((error) => {
      console.error('Kon Firestore calculatiedata niet laden voor Werk & Levering:', error);
      return { prompt: '', jobs: [] } as QuoteCalculationContext;
    });
    const bodyWithContext: RequestBody = {
      ...(rawBody || {}),
      quoteCalculationContext: quoteCalculation.prompt || rawBody?.quoteCalculationContext,
      sourceJobs: quoteCalculation.jobs,
    };
    const prompt = buildPromptFromBody(bodyWithContext);

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt of titel is verplicht.' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY is niet geconfigureerd.' }, { status: 500 });
    }

    let aiResult: OpenAiWorkDescriptionResult;
    try {
      aiResult = await callOpenAiWorkDescription(apiKey, prompt);
    } catch (error) {
      const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      return NextResponse.json(
        {
          error: isTimeout
            ? 'Werk & Levering generatie timeout.'
            : `Werk & Levering generatie mislukt: ${message}`,
        },
        { status: isTimeout ? 504 : 502 }
      );
    }

    const noteJobs = getNoteJobs(bodyWithContext.noteJobs);
    const existingStructuredInput = sanitizeWorkDescriptionStructured(bodyWithContext.structuredInput);
    if (noteJobs.length > 0) {
      const jobTexts = splitRawOutputByNoteTitles(aiResult.rawOutput, noteJobs);
      const jobs = noteJobs.map((noteJob, index) => {
        const text = safeString(jobTexts[index]);
        const existingJob = existingStructuredInput.jobs[index] || existingStructuredInput;
        return {
          ...existingJob,
          title: noteJob.title,
          context: text,
          summary: text,
          work_scope: text ? [text] : [],
          dimensions: noteJob.dimensions,
        };
      });
      const firstText = jobs.find((job) => safeString(job.summary))?.summary || aiResult.rawOutput;
      const structured = toStructuredWorkDescription({
        werkbeschrijving_structured: {
          ...existingStructuredInput,
          title: safeString(bodyWithContext.title),
          summary: firstText,
          work_scope: [firstText],
          jobs,
          activeJobIndex: 0,
        },
      });
      return NextResponse.json({
        werkbeschrijving: flattenStructuredWorkDescription(structured),
        werkbeschrijvingStructured: structured,
        noteCoverageWarnings: [],
        rawAiOutput: aiResult.rawOutput,
      });
    }

    const structured = toStructuredWorkDescription({
      werkbeschrijving_structured: {
        ...existingStructuredInput,
        title: safeString(bodyWithContext.title),
        summary: aiResult.rawOutput,
        work_scope: [aiResult.rawOutput],
      },
    });
    return NextResponse.json({
      werkbeschrijving: [aiResult.rawOutput],
      werkbeschrijvingStructured: structured,
      noteCoverageWarnings: [],
      rawAiOutput: aiResult.rawOutput,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Werkbeschrijving genereren mislukt';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
