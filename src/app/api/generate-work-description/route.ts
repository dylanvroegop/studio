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
};

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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
    const safe = enforceWorkDeliverySafety({
      ...job,
      afvalAfvoeren: enabled,
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

function inferTitleFromNotes(notesContext: unknown): string {
  const notes = safeString(notesContext).toLowerCase();
  if (!notes) return '';

  const hasRoofReplacementSignals = [
    /golfplaten?\s+(weg\s+)?halen|oude\s+golfplaten?\s+(verwijderen|weg\s+halen)/,
    /underlayment\s+platen?\s+leggen|underlayment\s+leggen/,
    /\bepdm\s+leggen\b|\bepdm\b.*\bonderlayment\b/,
  ].filter((pattern) => pattern.test(notes)).length;

  if (hasRoofReplacementSignals >= 2) return 'Dak vervangen';
  if (/\bdak\b/.test(notes) && /\bvervang/.test(notes)) return 'Dak vervangen';
  return '';
}

function applyInferredTitle(
  generated: WorkDescriptionStructured,
  body: RequestBody | null,
): WorkDescriptionStructured {
  const inferredTitle = inferTitleFromNotes(body?.notesContext);
  if (!inferredTitle) return generated;

  const currentTitle = safeString(generated.title);
  const titleLooksTooNarrow =
    !currentTitle
    || /boei|boeiboord|dakrand/i.test(currentTitle)
    || currentTitle.length > 80;

  if (!titleLooksTooNarrow && currentTitle.toLowerCase() === inferredTitle.toLowerCase()) {
    return generated;
  }

  const activeIndex = Math.max(0, Math.min(generated.activeJobIndex || 0, Math.max(0, generated.jobs.length - 1)));
  const jobs = generated.jobs.length > 0
    ? generated.jobs.map((job, index) => (
        index === activeIndex ? { ...job, title: inferredTitle } : job
      ))
    : generated.jobs;

  return {
    ...generated,
    title: titleLooksTooNarrow ? inferredTitle : currentTitle,
    jobs,
  };
}

function enforceGenerationRules(
  generated: WorkDescriptionStructured,
  body: RequestBody | null,
): WorkDescriptionStructured {
  const completed = fillMissingGeneratedScope(generated, body);
  const wasteFiltered = enforceWasteRemovalPreferences(completed, body?.structuredInput);
  const notesCovered = enforceRequiredNoteCoverage(wasteFiltered, body?.notesContext, isWasteRemovalRow);
  const titled = applyInferredTitle(notesCovered, body);
  const productChoicesCovered = enforceProductChoicesInScope(titled, body);
  const withoutMaterialSection = {
    ...productChoicesCovered,
    materials: [],
    jobs: productChoicesCovered.jobs.map((job) => ({ ...job, materials: [] })),
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

function formatProductChoiceScopeLine(value: string): string {
  const material = sanitizeMaterialDescription(value);
  const normalized = normalizeForMaterialComparison(material);

  if (/\bepdm\b/i.test(normalized)) {
    return 'De dakbedekking wordt uitgevoerd met EPDM.';
  }
  if (/underlayment/i.test(normalized)) {
    return 'De dakopbouw wordt uitgevoerd met underlayment platen.';
  }
  if (/daktrim/i.test(normalized)) {
    return /aluminium/i.test(normalized)
      ? 'De dakrand wordt afgewerkt met aluminium daktrim.'
      : 'De dakrand wordt afgewerkt met daktrim.';
  }
  if (/(keralit|trespa|hpl|rockpanel|gevelbekleding|boeiboord|boeiboorden)/i.test(normalized)) {
    return `De zichtbare bekleding wordt uitgevoerd met ${material}.`;
  }
  return `Uitvoering met ${material}.`;
}

function productChoiceCovered(material: string, rows: string[]): boolean {
  const normalizedRows = normalizeForMaterialComparison(rows.join(' '));
  const normalizedMaterial = normalizeForMaterialComparison(material);
  const importantTokens = normalizedMaterial
    .split(/\s+/)
    .filter((token) => (
      token.length >= 4
      && !/^(dikte|lengte|breedte|maat|ca|ral)$/.test(token)
    ));
  if (importantTokens.length === 0) return true;
  return importantTokens.some((token) => normalizedRows.includes(token));
}

function enforceProductChoicesInScope(
  generated: WorkDescriptionStructured,
  body: RequestBody | null,
): WorkDescriptionStructured {
  const productChoices = getMaterialContextRows(body?.materialContext);
  if (productChoices.length === 0) return generated;

  const activeIndex = Math.max(0, Math.min(generated.activeJobIndex || 0, Math.max(0, generated.jobs.length - 1)));
  const appendMissing = (rows: string[]) => {
    const missingRows = productChoices
      .filter((material) => !productChoiceCovered(material, rows))
      .map(formatProductChoiceScopeLine);
    return Array.from(new Set([...rows, ...missingRows]));
  };

  if (generated.jobs.length === 0) {
    return { ...generated, work_scope: appendMissing(generated.work_scope) };
  }

  const jobs = generated.jobs.map((job, index) => (
    index === activeIndex ? { ...job, work_scope: appendMissing(job.work_scope) } : job
  ));
  return {
    ...generated,
    jobs,
    work_scope: jobs[activeIndex]?.work_scope || generated.work_scope,
  };
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
    'Gebruik materials altijd als lege array. Maak geen aparte materialen/productenlijst.',
    'Verwerk alleen klant-relevante productkeuzes in work_scope wanneer ze belangrijk zijn voor vertrouwen of afspraak, zoals Keralit, Trespa/HPL, Rockpanel, EPDM, underlayment of type/kleur gevelbekleding.',
    'Noem geen verbruiksartikelen of hulpmaterialen zoals lijm, kit, cleaner, ontvetter, schroeven, handschoenen, folie, tape, band of schuurpapier.',
    'HARDE REGEL: "Extra kosten" is geen materiaal of product en mag nergens in Werk & Levering worden genoemd.',
    'HARDE REGEL: vermeld NOOIT aantallen of bestelhoeveelheden van materialen. Schrijf dus geen "18 stuk", "2 platen", "3 rollen" of hoeveelheden tussen haakjes. Productafmetingen en productspecificaties mogen wel blijven staan.',
    'Plaats bij onduidelijkheid een veilige uitsluiting onder excluded of laat het onderdeel weg.',
    'Formuleer commercieel en bescherm tegen scope creep en onbetaald meerwerk.',
    'summary mag meerdere zinnen bevatten wanneer dat nodig is om de afgesproken scope duidelijk te maken.',
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
    try {
      const decoded = await auth.verifyIdToken(token);
      const trialBlockedResponse = await ensureDemoTrialActiveByUid(decoded.uid);
      if (trialBlockedResponse) return trialBlockedResponse;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const rawBody = (await request.json().catch(() => null)) as RequestBody | null;
    const prompt = buildPromptFromBody(rawBody || {});

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
