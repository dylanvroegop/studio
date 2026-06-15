import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import {
  flattenStructuredWorkDescription,
  sanitizeWorkDescriptionStructured,
  toStructuredWorkDescription,
  type WorkDescriptionStructured,
} from '@/lib/quote-calculations';
import { enforceRequiredNoteCoverage } from '@/lib/work-description-note-coverage';
import { enforceWorkDeliverySafety, isIgnoredWorkDeliveryMaterial, sanitizeWorkDeliveryScope } from '@/lib/work-delivery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_N8N_WORK_DESCRIPTION_WEBHOOK =
  'https://n8n.dylan8n.org/webhook/38942fcb-1194-4f6b-8032-0c970425af7c';
const N8N_TIMEOUT_MS = 60_000;
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
};

function getWebhookUrl(): string {
  return (
    process.env.N8N_WORK_DESCRIPTION_WEBHOOK_URL
    || process.env.NEXT_PUBLIC_N8N_WORK_DESCRIPTION_WEBHOOK
    || DEFAULT_N8N_WORK_DESCRIPTION_WEBHOOK
  ).trim();
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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
  const structured = sanitizeWorkDescriptionStructured(input);
  const jobs = structured.jobs.map((job) => job.afvalAfvoeren === true);
  const activeIndex = Math.max(0, Math.min(structured.activeJobIndex || 0, Math.max(0, jobs.length - 1)));
  return {
    jobs,
    active: jobs[activeIndex] === true,
  };
}

function enforceWasteRemovalPreferences(
  generated: WorkDescriptionStructured,
  structuredInput: unknown,
): WorkDescriptionStructured {
  const preferences = getWasteRemovalPreferences(structuredInput);
  const inputStructured = sanitizeWorkDescriptionStructured(structuredInput);
  const jobs = generated.jobs.map((job, index) => {
    const enabled = preferences.jobs[index] ?? preferences.active;
    const controls = inputStructured.jobs[index] || inputStructured.jobs[inputStructured.activeJobIndex || 0] || inputStructured;
    const safe = enforceWorkDeliverySafety({
      ...job,
      afvalAfvoeren: enabled,
      electricalScope: controls.electricalScope,
      finishLevel: controls.finishLevel,
      customFinishDescription: controls.customFinishDescription,
    });
    return { ...job, ...safe, context: safe.summary };
  });
  const activeIndex = Math.max(0, Math.min(generated.activeJobIndex || 0, Math.max(0, jobs.length - 1)));
  const activeJob = jobs[activeIndex];
  const root = enforceWorkDeliverySafety({
    ...sanitizeWorkDeliveryScope(generated),
    afvalAfvoeren: activeJob ? activeJob.afvalAfvoeren === true : preferences.active,
    electricalScope: activeJob?.electricalScope || inputStructured.electricalScope,
    finishLevel: activeJob?.finishLevel || inputStructured.finishLevel,
    customFinishDescription: activeJob?.customFinishDescription || inputStructured.customFinishDescription,
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
  const wasteFiltered = enforceWasteRemovalPreferences(completed, body?.structuredInput);
  const notesCovered = enforceRequiredNoteCoverage(wasteFiltered, body?.notesContext, isWasteRemovalRow);
  return enforceWasteRemovalPreferences(notesCovered, body?.structuredInput);
}

function getMaterialContextRows(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const name = safeString(row.name);
    if (!name || isIgnoredWorkDeliveryMaterial(name)) return [];
    return [name];
  });
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
    return {
      ...job,
      title: job.title || fallback.title || safeString(body?.title),
      context: summary,
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
    };
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

  const n8nRows = extractDirectWerkbeschrijving(row);
  const n8nTitle = pickFirstString(rowRecord, ['korteTitel', 'korte_titel', 'korteTitle', 'kortetitle', 'hoofdTitel', 'hoofdtitel', 'hoofdTitle', 'hoofdtitle', 'title'])
    || pickFirstString(parsedRecord, ['korteTitel', 'korte_titel', 'korteTitle', 'kortetitle', 'hoofdTitel', 'hoofdtitel', 'hoofdTitle', 'hoofdtitle', 'title']);
  const n8nSummary = pickFirstString(rowRecord, ['korteBeschrijving', 'korte_beschrijving', 'korteBeschrijvingTekst', 'samenvatting', 'summary', 'context'])
    || pickFirstString(parsedRecord, ['korteBeschrijving', 'korte_beschrijving', 'korteBeschrijvingTekst', 'samenvatting', 'summary', 'context']);
  if (n8nRows.length > 0 || n8nTitle || n8nSummary) {
    const structured = toStructuredWorkDescription({
      korteTitel: n8nTitle,
      korteBeschrijving: n8nSummary,
      werkbeschrijving: n8nRows,
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
  const preferences = getWasteRemovalPreferences(body.structuredInput);
  const wasteRemovalRule = preferences.active
    ? 'Afval afvoeren staat expliciet AAN. Neem uitsluitend de overeengekomen afvoer op onder included.'
    : WASTE_REMOVAL_DISABLED_RULE;
  const notesRule = safeString(body.notesContext)
    ? [
        'HARDE REGEL VOOR GEBRUIKERSNOTITIES:',
        'Verwerk IEDERE concrete werkzaamheid, keuze en maat uit de gebruikersnotities in de werkbeschrijving.',
        'Sla niets over, neem afmetingen exact over en voeg geen vervangende aannames toe.',
        'Behoud ALLE expliciete aantallen en berekende totalen. Als de notitie bijvoorbeeld "2 per huis, 3 huizen, totaal 6 zijdes" vermeldt, moet "6 zijdes totaal" letterlijk en ondubbelzinnig in summary en work_scope staan.',
        'De offerte is definitief: gebruik uitsluitend concrete, professionele formuleringen.',
        'Verwijder onzekere taal zoals "eventueel", "mogelijk", "iets anders", "indien nodig" en "in overleg".',
        'Wanneer een notitie eerst een concrete werkwijze noemt en daarna een vaag alternatief, gebruik alleen de concrete werkwijze.',
        'Controleer voor je antwoord regel voor regel of alle notities aantoonbaar terugkomen.',
      ].join(' ')
    : '';
  const scopeRules = [
    'Geef uitsluitend geldige JSON terug met exact deze velden:',
    '{"title":"","summary":"","work_scope":[],"materials":[],"dimensions":[],"included":[],"excluded":[],"internal_notes":[]}',
    'Schrijf geen stappenplan en geen uitvoeringsvolgorde.',
    'Gebruik nooit de secties Voorbereiding, Uitvoering of Afwerking.',
    'Verzin geen werkzaamheden, afwerkingsniveau, elektrawerk, sloopwerk of afvalafvoer.',
    'Beschrijf geen methode tenzij deze expliciet is aangeleverd.',
    'Gebruik niet de woorden eerst, vervolgens, daarna, stap 1 of stap 2.',
    'Neem alleen scope over die expliciet blijkt uit notities, maatvoering of calculatiedata.',
    'Expliciete aantallen, aantallen per woning/object en eindtotalen uit notities zijn essentiële scope en mogen nooit worden verkort of impliciet geformuleerd.',
    'Materialen mogen uitsluitend onder materials staan.',
    'HARDE REGEL: "Extra kosten" is geen materiaal of product en mag nergens in Werk & Levering worden genoemd.',
    'HARDE REGEL: vermeld NOOIT aantallen of bestelhoeveelheden van materialen. Schrijf dus geen "18 stuk", "2 platen", "3 rollen" of hoeveelheden tussen haakjes. Productafmetingen en productspecificaties mogen wel blijven staan.',
    'Plaats bij onduidelijkheid een veilige uitsluiting onder excluded of laat het onderdeel weg.',
    'Formuleer commercieel en bescherm tegen scope creep en onbetaald meerwerk.',
    'summary bevat maximaal twee korte zinnen.',
  ].join(' ');
  if (directPrompt) return [directPrompt, scopeRules, notesRule, wasteRemovalRule].filter(Boolean).join('\n\n');

  const parts = [
    safeString(body.title) ? `Titel: ${safeString(body.title)}` : '',
    safeString(body.context) ? `Context: ${safeString(body.context)}` : '',
    safeString(body.category) ? `Categorie: ${safeString(body.category)}` : '',
    safeString(body.notesContext) ? `Notities: ${safeString(body.notesContext)}` : '',
    safeString(body.measurementsContext) ? `Maatvoering: ${safeString(body.measurementsContext)}` : '',
  ].filter(Boolean);

  return [...parts, scopeRules, notesRule, wasteRemovalRule].filter(Boolean).join('\n');
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

    const rawBody = (await request.json().catch(() => null)) as RequestBody | null;
    const quoteId = safeString(rawBody?.quoteId);
    const prompt = buildPromptFromBody(rawBody || {});

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt of titel is verplicht.' }, { status: 400 });
    }

    const webhookUrl = getWebhookUrl();
    const webhookSecret = process.env.N8N_HEADER_SECRET?.trim();

    let response: Response;
    try {
      response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(webhookSecret ? { 'x-offertehulp-secret': webhookSecret } : {}),
        },
        body: JSON.stringify({
          ...(rawBody || {}),
          prompt,
          input: prompt,
          quoteId,
          userId,
          userid: userId,
        }),
        signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
      });
    } catch (error) {
      const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      return NextResponse.json(
        {
          error: isTimeout
            ? 'Werkbeschrijving webhook timeout (n8n reageert niet op tijd).'
            : `Werkbeschrijving webhook niet bereikbaar: ${message}`,
        },
        { status: isTimeout ? 504 : 502 }
      );
    }

    const responseText = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        { error: `Werkbeschrijving webhook mislukt (n8n ${response.status}).` },
        { status: 502 }
      );
    }

    let parsedData: unknown = responseText;
    try {
      parsedData = JSON.parse(responseText);
    } catch {
      // plain text response is also supported
    }

    const result =
      Array.isArray(parsedData) && parsedData.length > 0
        ? parsedData[0]
        : parsedData;

    const directStructured = extractDirectStructured(result);
    if (directStructured && flattenStructuredWorkDescription(directStructured).length > 0) {
      const structured = enforceGenerationRules(
        sanitizeWorkDescriptionStructured(directStructured),
        rawBody,
      );
      const flattened = flattenStructuredWorkDescription(structured);
      return NextResponse.json({
        werkbeschrijving: flattened,
        werkbeschrijvingStructured: structured,
      });
    }

    const directWerkbeschrijving = extractDirectWerkbeschrijving(result);
    if (directWerkbeschrijving.length > 0) {
      const structured = enforceGenerationRules(
        toStructuredWorkDescription({ werkbeschrijving: directWerkbeschrijving }),
        rawBody,
      );
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

    const structured = enforceGenerationRules(
      toStructuredWorkDescription({ werkbeschrijving }),
      rawBody,
    );
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
