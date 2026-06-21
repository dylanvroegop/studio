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
  enforceRequiredMaatwerkCoverage,
  enforceRequiredNoteCoverage,
  extractRequiredNoteRequirements,
  formatRequiredNoteStep,
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
  || 'gpt-4.1-mini';
const OPENAI_TIMEOUT_MS = 60_000;
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

function getNoteJobs(input: unknown): WorkDescriptionNoteJobInput[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const title = safeString(row.title);
    const notes = safeString(row.notes);
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
    const match = line.match(/^(.*?)\s*[:=]\s*lengte\s*[:=]?\s*([^,|]+?)\s*[,|]\s*breedte\s*[:=]?\s*([^,|]+?)\s*[,|]\s*dikte\s*[:=]?\s*([^,|]+?)\s*$/i);
    if (!match) return [];
    const title = match[1].trim();
    const clean = (value: string) => value.replace(/\s*mm\s*$/i, '').trim();
    return [`${title}: | Lengte = ${clean(match[2])} mm | Breedte = ${clean(match[3])} mm | Dikte = ${clean(match[4])} mm |`];
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

async function callOpenAiWorkDescription(apiKey: string, prompt: string): Promise<unknown> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.1,
      input: [
        {
          role: 'system',
          content: [{
            type: 'input_text',
            text: [
              'Je bent een Nederlandse Werk & Levering-generator voor offertes in de bouw.',
              'Je zet gebruikersnotities om naar zakelijke, concrete scope.',
              'Geef uitsluitend geldig JSON terug. Geen markdown, geen uitleg.',
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

  return parseJsonDeep(outputText) ?? outputText;
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
    const stucwerkInbegrepen = controls.stucwerkInbegrepen === true
      || rawControls.stucwerkInbegrepen === true
      || inputStructured.stucwerkInbegrepen === true;
    const plamuurwerkInbegrepen = controls.plamuurwerkInbegrepen === true
      || rawControls.plamuurwerkInbegrepen === true
      || inputStructured.plamuurwerkInbegrepen === true;
    const kitwerkInbegrepen = controls.kitwerkInbegrepen === true
      || rawControls.kitwerkInbegrepen === true
      || inputStructured.kitwerkInbegrepen === true;
    const steigerInbegrepen = controls.steigerInbegrepen === true
      || rawControls.steigerInbegrepen === true
      || inputStructured.steigerInbegrepen === true;
    const sloopwerkInbegrepen = controls.sloopwerkInbegrepen === true
      || rawControls.sloopwerkInbegrepen === true
      || inputStructured.sloopwerkInbegrepen === true;
    const nadenVullenInbegrepen = controls.nadenVullenInbegrepen === true
      || rawControls.nadenVullenInbegrepen === true
      || inputStructured.nadenVullenInbegrepen === true;
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
  const root = enforceWorkDeliverySafety({
    ...sanitizeWorkDeliveryScope(generated),
    afvalAfvoeren: activeJob ? activeJob.afvalAfvoeren === true : preferences.active,
    schilderwerkInbegrepen: activeJob
      ? activeJob.schilderwerkInbegrepen === true
      : rawControls.schilderwerkInbegrepen === true || inputStructured.schilderwerkInbegrepen === true,
    stucwerkInbegrepen: activeJob
      ? activeJob.stucwerkInbegrepen === true
      : rawControls.stucwerkInbegrepen === true || inputStructured.stucwerkInbegrepen === true,
    plamuurwerkInbegrepen: activeJob
      ? activeJob.plamuurwerkInbegrepen === true
      : rawControls.plamuurwerkInbegrepen === true || inputStructured.plamuurwerkInbegrepen === true,
    kitwerkInbegrepen: activeJob
      ? activeJob.kitwerkInbegrepen === true
      : rawControls.kitwerkInbegrepen === true || inputStructured.kitwerkInbegrepen === true,
    steigerInbegrepen: activeJob
      ? activeJob.steigerInbegrepen === true
      : rawControls.steigerInbegrepen === true || inputStructured.steigerInbegrepen === true,
    sloopwerkInbegrepen: activeJob
      ? activeJob.sloopwerkInbegrepen === true
      : rawControls.sloopwerkInbegrepen === true || inputStructured.sloopwerkInbegrepen === true,
    nadenVullenInbegrepen: activeJob
      ? activeJob.nadenVullenInbegrepen === true
      : rawControls.nadenVullenInbegrepen === true || inputStructured.nadenVullenInbegrepen === true,
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
    const generatedRows = generated.jobs.length === noteJobs.length
      ? generated.jobs.map((job) => job.work_scope.join(' '))
      : generated.work_scope;
    const jobs = noteJobs.map((source, index) => {
      const requirement = [source.title, source.notes].filter(Boolean).join(' ');
      const candidate = safeString(generatedRows[index]).replace(/^Klus\s+\d+\s*:\s*/i, '').trim();
      const rawWorkRow = candidate && isNoteRequirementCovered(requirement, candidate)
        ? candidate
        : formatRequiredNoteStep(requirement);
      const workRow = cleanProfessionalScopeText(rawWorkRow);
      return {
        ...completed.jobs[0],
        title: source.title,
        context: workRow,
        summary: workRow,
        work_scope: [workRow],
        materials: [],
        dimensions: source.dimensions,
        included: [],
        excluded: [],
        internal_notes: [],
        afvalAfvoeren: false,
        schilderwerkInbegrepen: false,
        stucwerkInbegrepen: false,
        plamuurwerkInbegrepen: false,
        kitwerkInbegrepen: false,
        steigerInbegrepen: false,
        sloopwerkInbegrepen: false,
        nadenVullenInbegrepen: false,
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
      electricalScope: controls.electricalScope,
      finishLevel: controls.finishLevel,
      customFinishDescription: controls.customFinishDescription,
    });
  }
  const sourceJobs = Array.isArray(body?.sourceJobs)
    ? body.sourceJobs.filter((job): job is WorkDescriptionSourceJob => Boolean(job && typeof job === 'object'))
    : [];
  const allScopeRows = [
    ...completed.work_scope,
    ...completed.jobs.flatMap((job) => job.work_scope),
  ];
  const normalizeTokens = (value: string) => value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4);
  const missingSourceRows = sourceJobs.flatMap((sourceJob) => {
    const identityTokens = normalizeTokens(`${sourceJob.title} ${sourceJob.type}`);
    const covered = allScopeRows.some((row) => {
      const normalizedRow = ` ${normalizeTokens(row).join(' ')} `;
      return identityTokens.some((token) => normalizedRow.includes(` ${token} `));
    });
    if (covered) return [];
    const materialText = sourceJob.materials.length > 0
      ? ` met ${sourceJob.materials.slice(0, 3).join(', ')}`
      : '';
    return [`Uitvoeren van ${sourceJob.title.toLowerCase()} conform de opgegeven maatvoering${materialText}.`];
  });
  const activeIndexForCoverage = Math.max(0, Math.min(completed.activeJobIndex || 0, Math.max(0, completed.jobs.length - 1)));
  const completedWithSourceJobs = sanitizeWorkDescriptionStructured({
    ...completed,
    work_scope: [...completed.work_scope, ...missingSourceRows],
    jobs: completed.jobs.map((job, index) => index === activeIndexForCoverage
      ? { ...job, work_scope: [...job.work_scope, ...missingSourceRows] }
      : job),
  });
  const wasteFiltered = enforceWasteRemovalPreferences(completedWithSourceJobs, body?.structuredInput);
  const notesCovered = enforceRequiredNoteCoverage(wasteFiltered, body?.notesContext, isWasteRemovalRow);
  const sourceDimensions = sourceJobs.flatMap((job) => Array.isArray(job.dimensions) ? job.dimensions : []);
  const noteDimensions = extractNoteDimensionRows(body?.notesContext);
  const requiredDimensions = Array.from(new Set([...sourceDimensions, ...noteDimensions]));
  const activeIndex = Math.max(0, Math.min(notesCovered.activeJobIndex || 0, Math.max(0, notesCovered.jobs.length - 1)));
  const jobsWithDimensions = notesCovered.jobs.length > 0
    ? notesCovered.jobs.map((job, index) => index === activeIndex
      ? { ...job, dimensions: Array.from(new Set([...job.dimensions, ...requiredDimensions])) }
      : job)
    : notesCovered.jobs;
  const withDimensions = sanitizeWorkDescriptionStructured({
    ...notesCovered,
    dimensions: Array.from(new Set([...notesCovered.dimensions, ...requiredDimensions])),
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
    return [name];
  });
}

function normalizeForMaterialComparison(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isCustomerRelevantProductChoice(value: string): boolean {
  const normalized = normalizeForMaterialComparison(value);
  if (!normalized) return false;
  if (/(schroef|schroeven|lijm|contactlijm|kit\b|ms polymeer|cleaner|ontvetter|handschoen|folie|tape|butylband|schuurpapier|poetsdoek|doek|neopreen|aansluitkit|bevestig)/i.test(normalized)) {
    return false;
  }
  return /(keralit|trespa|hpl|rockpanel|gevelbekleding|boeiboord|boeiboorden|epdm|underlayment|daktrim|dakbedekking|ral 7016|antraciet|anthracite)/i.test(normalized);
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
      work_scope: job.work_scope.length > 0
        ? job.work_scope
        : (fallback.work_scope.length > 0 ? fallback.work_scope : (summary ? [summary] : [])),
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

function getMissingNoteRequirements(
  structured: WorkDescriptionStructured | null,
  notesContext: unknown,
): string[] {
  if (!structured) return extractRequiredNoteRequirements(notesContext);
  const generatedRows = [
    ...structured.work_scope,
    ...structured.jobs.flatMap((job) => job.work_scope),
  ].filter(Boolean);

  return extractRequiredNoteRequirements(notesContext)
    .filter((requirement) => !isWasteRemovalRow(requirement))
    // A requirement is covered only when one coherent work row contains it.
    // Combining unrelated words and measurements across the whole document
    // previously produced false positives for omitted note scope.
    .filter((requirement) => !generatedRows.some((row) => isNoteRequirementCovered(requirement, row)));
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
    ? 'Afval afvoeren staat expliciet AAN. Neem de concrete afvalafvoer als een eigen, afzonderlijke regel op in work_scope. Zet deze niet onder included.'
    : WASTE_REMOVAL_DISABLED_RULE;
  const structuredControls = sanitizeWorkDescriptionStructured(body.structuredInput);
  const sourceJobs = Array.isArray(body.sourceJobs)
    ? body.sourceJobs.filter((job): job is WorkDescriptionSourceJob => Boolean(job && typeof job === 'object'))
    : [];
  const noteJobs = getNoteJobs(body.noteJobs);
  const paintingRule = structuredControls.schilderwerkInbegrepen
    ? 'Schilderwerk inbegrepen staat expliciet AAN. Neem het concrete schilderwerk als een eigen, afzonderlijke regel op in work_scope. Gebruik details uit de notities, bijvoorbeeld wat wordt geschilderd en een nog te kiezen kleur. Zet schilderwerk niet onder included of excluded.'
    : 'Schilderwerk inbegrepen staat UIT. Neem schilderwerk, sauswerk, aflakken of verven niet op als inbegrepen werk.';
  const stuccoRule = structuredControls.stucwerkInbegrepen
    ? 'Stucwerk inbegrepen staat expliciet AAN. Behoud alle expliciete stucwerkzaamheden, aantallen en maatvoering en neem het concrete stucwerk als een eigen, afzonderlijke regel op in work_scope. Zet stucwerk niet onder included.'
    : 'Stucwerk inbegrepen staat UIT. Neem stucwerk niet op als inbegrepen werk.';
  const fillingRule = structuredControls.plamuurwerkInbegrepen
    ? 'Plamuurwerk inbegrepen staat expliciet AAN. Neem het concrete overeengekomen plamuurwerk als een eigen regel op in work_scope. Zet dit werk niet onder included of excluded.'
    : 'Plamuurwerk inbegrepen staat UIT. Neem plamuurwerk niet op als inbegrepen werk.';
  const sealingRule = structuredControls.kitwerkInbegrepen
    ? 'Kitwerk inbegrepen staat expliciet AAN. Neem het concrete overeengekomen kitwerk als een eigen regel op in work_scope. Zet dit werk niet onder included of excluded.'
    : 'Kitwerk inbegrepen staat UIT. Neem kitwerk niet op als inbegrepen werk.';
  const scaffoldRule = structuredControls.steigerInbegrepen
    ? 'Steiger inbegrepen staat expliciet AAN. Neem het concrete overeengekomen steigerwerk als een eigen regel op in work_scope.'
    : 'Steiger inbegrepen staat UIT. Neem geen steiger, steigerhuur of steigerwerk op als inbegrepen werk.';
  const demolitionRule = structuredControls.sloopwerkInbegrepen
    ? 'Sloopwerk inbegrepen staat expliciet AAN. Neem het concrete overeengekomen sloopwerk als een eigen regel op in work_scope.'
    : 'Sloopwerk inbegrepen staat UIT. Neem geen sloopwerk op als inbegrepen werk.';
  const seamFillingRule = structuredControls.nadenVullenInbegrepen
    ? 'Naden vullen inbegrepen staat expliciet AAN. Neem het vullen en afwerken van de overeengekomen naden als een eigen regel op in work_scope.'
    : 'Naden vullen inbegrepen staat UIT. Neem het vullen of afwerken van naden niet op als inbegrepen werk.';
  const electricalRule = structuredControls.electricalScope.enabled
    ? 'Elektrawerk inbegrepen staat expliciet AAN. Neem ieder concreet overeengekomen elektrisch onderdeel als een eigen regel op in work_scope. Zet elektrawerk niet onder included.'
    : 'Elektrawerk inbegrepen staat UIT. Neem elektrawerk niet op als inbegrepen werk.';
  const notesRule = safeString(body.notesContext)
    ? [
        'REGELS VOOR GEBRUIKERSNOTITIES:',
        'Gebruik iedere concrete werkzaamheid en keuze uit de gebruikersnotities als bron, maar kopieer ruwe notitieregels niet letterlijk.',
        'Combineer verwante notities tot één professionele regel en beschrijf iedere concrete werkzaamheid precies één keer.',
        'Zet losse afmetingen en maatopsommingen in dimensions. Herhaal ze alleen in work_scope wanneer de maat nodig is om de werkzaamheid ondubbelzinnig te beschrijven.',
        'Behoud expliciete aantallen en berekende eindtotalen exact, maar vermeld ieder feit op één logische plaats.',
        'De offerte is definitief: gebruik uitsluitend concrete, professionele formuleringen.',
        'Verwijder onzekere taal zoals "eventueel", "mogelijk", "iets anders", "indien nodig" en "in overleg".',
        'Wanneer een notitie eerst een concrete werkwijze noemt en daarna een vaag alternatief, gebruik alleen de concrete werkwijze.',
        'Controleer voor je antwoord of alle concrete afspraken inhoudelijk terugkomen zonder doublures.',
      ].join(' ')
    : '';
  const scopeRules = [
    'Geef uitsluitend geldige JSON terug met exact deze velden:',
    noteJobs.length > 0
      ? '{"title":"","summary":"","jobs":[{"title":"","work_scope":[]}],"included":[],"excluded":[]}'
      : '{"title":"","summary":"","work_scope":[],"materials":[],"dimensions":[],"included":[],"excluded":[],"internal_notes":[]}',
    'Schrijf geen stappenplan en geen uitvoeringsvolgorde.',
    'Gebruik nooit de secties Voorbereiding, Uitvoering of Afwerking.',
    noteJobs.length > 0
      ? `De notities bevatten ${noteJobs.length} klussen. Geef exact ${noteJobs.length} jobs terug, in dezelfde volgorde en met exact één professionele work_scope-regel per klus. Gebruik de notitietitel als jobtitel. Gebruik nooit labels zoals "Klus 1" of "Klus 2".`
      : sourceJobs.length > 0
      ? `De calculatie bevat ${sourceJobs.length} afzonderlijke klussen. Geef voor iedere genummerde Klus 1 t/m ${sourceJobs.length} precies één volledige, zelfstandige regel in work_scope, in dezelfde volgorde. Sla geen klus over en voeg verschillende klussen niet samen.`
      : 'Geef iedere afzonderlijke klus als één volledige, zelfstandige regel in work_scope.',
    'Combineer alle eigenschappen die bij dezelfde klus horen in die ene regel. Een verhoogde vloer en de gekozen vloerplaat zijn bijvoorbeeld eigenschappen van dezelfde vloerklus en worden geen dubbele vloerregels.',
    'Gebruik de specifieke klussoort als onderwerp. Maak van boeiboorden, plafonds, wanden, vloeren, kozijnen en ander timmerwerk ieder een passende beschrijving; gebruik geen algemene vloertekst voor een andere klussoort.',
    'Verzin geen werkzaamheden, afwerkingsniveau, elektrawerk, sloopwerk of afvalafvoer.',
    'Beschrijf geen methode tenzij deze expliciet is aangeleverd.',
    'Gebruik niet de woorden eerst, vervolgens, daarna, stap 1 of stap 2.',
    'Neem alleen scope over die expliciet blijkt uit notities, maatvoering of calculatiedata.',
    'Expliciete aantallen, aantallen per woning/object en eindtotalen uit notities zijn essentiële feiten en mogen nooit worden verkort of impliciet geformuleerd.',
    'Gebruik materials altijd als lege array. Maak geen aparte materialen/productenlijst.',
    'Verwerk alleen klant-relevante productkeuzes in work_scope wanneer ze belangrijk zijn voor vertrouwen of afspraak, zoals Keralit, Trespa/HPL, Rockpanel, EPDM, underlayment of type/kleur gevelbekleding.',
    'Noem geen verbruiksartikelen of hulpmaterialen zoals lijm, kit, cleaner, ontvetter, schroeven, handschoenen, folie, tape, band of schuurpapier.',
    'Negeer administratieve regels met de naam "Extra kosten".',
    'Noem geen bestelhoeveelheden van materialen; behoud wel werkhoeveelheden, productafmetingen en productspecificaties die de afspraak beschrijven.',
    'Plaats bij onduidelijkheid een veilige uitsluiting onder excluded of laat het onderdeel weg.',
    'Formuleer commercieel en bescherm tegen scope creep en onbetaald meerwerk.',
    'summary mag meerdere zinnen bevatten wanneer dat nodig is om de afgesproken scope duidelijk te maken.',
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
      electricalRule,
      wasteRemovalRule,
    ].filter(Boolean).join('\n\n');
  }

  const parts = [
    safeString(body.title) ? `Titel: ${safeString(body.title)}` : '',
    safeString(body.context) ? `Context: ${safeString(body.context)}` : '',
    safeString(body.category) ? `Categorie: ${safeString(body.category)}` : '',
    safeString(body.notesContext) ? `Notities: ${safeString(body.notesContext)}` : '',
    safeString(body.measurementsContext) ? `Maatvoering: ${safeString(body.measurementsContext)}` : '',
    calculationContext ? `Calculatiedata uit Firestore:\n${calculationContext}` : '',
  ].filter(Boolean);

  return [...parts, scopeRules, notesRule, paintingRule, stuccoRule, fillingRule, sealingRule, seamFillingRule, scaffoldRule, demolitionRule, electricalRule, wasteRemovalRule].filter(Boolean).join('\n');
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

    let result: unknown;
    try {
      result = await callOpenAiWorkDescription(apiKey, prompt);
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

    const expectedJobCount = getNoteJobs(bodyWithContext.noteJobs).length || quoteCalculation.jobs.length;
    const firstStructured = extractDirectStructured(result);
    const firstScopeCount = firstStructured?.jobs.length
      ? firstStructured.jobs.reduce((count, job) => count + job.work_scope.length, 0)
      : firstStructured?.work_scope.length || 0;
    const firstMissingNotes = getMissingNoteRequirements(firstStructured, bodyWithContext.notesContext);
    const calculationJobsMissing = expectedJobCount > 0 && firstScopeCount < expectedJobCount;
    if (calculationJobsMissing || firstMissingNotes.length > 0) {
      const correctionPrompt = [
        prompt,
        'CORRECTIE VAN HET VORIGE ANTWOORD:',
        calculationJobsMissing
          ? `Het vorige antwoord bevatte ${firstScopeCount} werkzaamheden voor ${expectedJobCount} opgegeven klussen en is daardoor onvolledig.`
          : '',
        firstMissingNotes.length > 0
          ? `Deze expliciete gebruikersnotities ontbreken nog: ${firstMissingNotes.map((note) => `"${note}"`).join('; ')}`
          : '',
        `Geef opnieuw JSON met één volledige work_scope-regel voor iedere Klus 1 t/m ${expectedJobCount}, in dezelfde volgorde, plus iedere aanvullende concrete werkzaamheid uit de gebruikersnotities. Combineer kenmerken van dezelfde klus in één regel.`,
        `Vorig antwoord: ${JSON.stringify(result)}`,
      ].filter(Boolean).join('\n\n');
      try {
        result = await callOpenAiWorkDescription(apiKey, correctionPrompt);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Onbekende fout';
        return NextResponse.json(
          { error: `Werk & Levering was onvolledig en kon niet worden hersteld: ${message}` },
          { status: 502 },
        );
      }
    }

    const directStructured = extractDirectStructured(result);
    if (directStructured && flattenStructuredWorkDescription(directStructured).length > 0) {
      const structured = enforceRequiredMaatwerkCoverage(
        enforceGenerationRules(
          sanitizeWorkDescriptionStructured(directStructured),
          bodyWithContext,
        ),
        bodyWithContext.notesContext,
      );
      const missingNotes = getMissingNoteRequirements(structured, bodyWithContext.notesContext);
      if (missingNotes.length > 0) {
        return NextResponse.json({
          error: `Werk & Levering is niet opgeslagen omdat gebruikersnotities ontbreken: ${missingNotes.join(' | ')}`,
        }, { status: 502 });
      }
      const flattened = flattenStructuredWorkDescription(structured);
      return NextResponse.json({
        werkbeschrijving: flattened,
        werkbeschrijvingStructured: structured,
      });
    }

    const directWerkbeschrijving = extractDirectWerkbeschrijving(result);
    if (directWerkbeschrijving.length > 0) {
      const structured = enforceRequiredMaatwerkCoverage(
        enforceGenerationRules(
          toStructuredWorkDescription({ werkbeschrijving: directWerkbeschrijving }),
          bodyWithContext,
        ),
        bodyWithContext.notesContext,
      );
      const missingNotes = getMissingNoteRequirements(structured, bodyWithContext.notesContext);
      if (missingNotes.length > 0) {
        return NextResponse.json({
          error: `Werk & Levering is niet opgeslagen omdat gebruikersnotities ontbreken: ${missingNotes.join(' | ')}`,
        }, { status: 502 });
      }
      const filteredWerkbeschrijving = flattenStructuredWorkDescription(structured);
      return NextResponse.json({
        werkbeschrijving: filteredWerkbeschrijving,
        werkbeschrijvingStructured: structured,
      });
    }

    const aiOutput = extractAiOutput(result);
    if (!aiOutput) {
      return NextResponse.json({ error: 'Geen output ontvangen uit workflow.' }, { status: 502 });
    }

    const werkbeschrijving = parseWorkDescription(aiOutput);
    if (werkbeschrijving.length === 0) {
      return NextResponse.json({ error: 'Lege werkbeschrijving ontvangen.' }, { status: 502 });
    }

    const structured = enforceRequiredMaatwerkCoverage(
      enforceGenerationRules(
        toStructuredWorkDescription({ werkbeschrijving }),
        bodyWithContext,
      ),
      bodyWithContext.notesContext,
    );
    const missingNotes = getMissingNoteRequirements(structured, bodyWithContext.notesContext);
    if (missingNotes.length > 0) {
      return NextResponse.json({
        error: `Werk & Levering is niet opgeslagen omdat gebruikersnotities ontbreken: ${missingNotes.join(' | ')}`,
      }, { status: 502 });
    }
    const filteredWerkbeschrijving = flattenStructuredWorkDescription(structured);
    return NextResponse.json({
      werkbeschrijving: filteredWerkbeschrijving,
      werkbeschrijvingStructured: structured,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Werkbeschrijving genereren mislukt';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
