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
  const filterRows = (rows: string[], enabled: boolean) => (
    enabled ? rows : rows.filter((row) => !isWasteRemovalRow(row))
  );
  const jobs = generated.jobs.map((job, index) => {
    const enabled = preferences.jobs[index] ?? preferences.active;
    return {
      ...job,
      afvalAfvoeren: enabled,
      sections: {
        voorbereiding: filterRows(job.sections.voorbereiding, enabled),
        uitvoering: filterRows(job.sections.uitvoering, enabled),
        afwerking: filterRows(job.sections.afwerking, enabled),
      },
      legacyNotes: filterRows(job.legacyNotes || [], enabled),
    };
  });
  const activeIndex = Math.max(0, Math.min(generated.activeJobIndex || 0, Math.max(0, jobs.length - 1)));
  const activeJob = jobs[activeIndex];
  const rootEnabled = activeJob ? activeJob.afvalAfvoeren === true : preferences.active;

  return {
    ...generated,
    sections: activeJob?.sections || {
      voorbereiding: filterRows(generated.sections.voorbereiding, rootEnabled),
      uitvoering: filterRows(generated.sections.uitvoering, rootEnabled),
      afwerking: filterRows(generated.sections.afwerking, rootEnabled),
    },
    legacyNotes: activeJob?.legacyNotes || filterRows(generated.legacyNotes || [], rootEnabled),
    jobs,
    activeJobIndex: activeIndex,
  };
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
    || value.context
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
    ? 'Afval afvoeren staat expliciet AAN. Neem hiervoor een duidelijke stap op onder Afwerking.'
    : WASTE_REMOVAL_DISABLED_RULE;
  if (directPrompt) return `${directPrompt}\n\n${wasteRemovalRule}`;

  const parts = [
    safeString(body.title) ? `Titel: ${safeString(body.title)}` : '',
    safeString(body.context) ? `Context: ${safeString(body.context)}` : '',
    safeString(body.category) ? `Categorie: ${safeString(body.category)}` : '',
    safeString(body.notesContext) ? `Notities: ${safeString(body.notesContext)}` : '',
    safeString(body.measurementsContext) ? `Maatvoering: ${safeString(body.measurementsContext)}` : '',
  ].filter(Boolean);

  return [...parts, wasteRemovalRule].join('\n');
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
      const structured = enforceWasteRemovalPreferences(
        sanitizeWorkDescriptionStructured(directStructured),
        rawBody?.structuredInput,
      );
      const flattened = flattenStructuredWorkDescription(structured);
      if (quoteId) {
        await persistWorkDescription(quoteId, userId, flattened, structured);
      }
      return NextResponse.json({
        werkbeschrijving: flattened,
        werkbeschrijvingStructured: structured,
      });
    }

    const directWerkbeschrijving = extractDirectWerkbeschrijving(result);
    if (directWerkbeschrijving.length > 0) {
      const structured = enforceWasteRemovalPreferences(
        toStructuredWorkDescription({ werkbeschrijving: directWerkbeschrijving }),
        rawBody?.structuredInput,
      );
      const filteredWerkbeschrijving = flattenStructuredWorkDescription(structured);
      if (quoteId) {
        await persistWorkDescription(quoteId, userId, filteredWerkbeschrijving, structured);
      }
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

    const structured = enforceWasteRemovalPreferences(
      toStructuredWorkDescription({ werkbeschrijving }),
      rawBody?.structuredInput,
    );
    const filteredWerkbeschrijving = flattenStructuredWorkDescription(structured);
    if (quoteId) {
      await persistWorkDescription(quoteId, userId, filteredWerkbeschrijving, structured);
    }

    return NextResponse.json({
      werkbeschrijving: filteredWerkbeschrijving,
      werkbeschrijvingStructured: structured,
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
  if (!quoteId || !userId || werkbeschrijving.length === 0) return;

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
      ...(werkbeschrijvingStructured?.jobs?.length ? { werkbeschrijving_jobs: werkbeschrijvingStructured.jobs } : {}),
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
        ...(werkbeschrijvingStructured?.jobs?.length ? { werkbeschrijving_jobs: werkbeschrijvingStructured.jobs } : {}),
        ...(werkbeschrijvingStructured ? { werkbeschrijving_structured: werkbeschrijvingStructured } : {}),
      },
    });

  if (insertError) throw new Error(insertError.message);
}
