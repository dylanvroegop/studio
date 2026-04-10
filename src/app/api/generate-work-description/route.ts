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
};

const DEFAULT_OPENAI_MODEL = 'gpt-5.2';
const OPENAI_SYSTEM_PROMPT = `
Je bent een Nederlandse werkvoorbereider in timmer/bouw.
Schrijf praktische, uitvoerbare werkbeschrijvingen.
Gebruik alleen relevante info uit de input.
`;

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
      'Geef output als lijst met concrete stappen.',
    ].filter(Boolean).join('\n');
  }

  if (input.action === 'improve') {
    return [
      'Verbeter de bestaande werkbeschrijving zodat deze professioneel, helder en uitvoerbaar is.',
      titleLine,
      contextLine,
      categoryLine,
      ...materialLines,
      ...notesLines,
      ...measurementsLines,
      'Behoud Nederlandse taal en praktische volgorde.',
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
    'Geef output als duidelijke stappen in het Nederlands.',
  ].filter(Boolean).join('\n');
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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

function buildOpenAiUserPrompt(params: {
  prompt: string;
  action: AiAction | null;
  baseStructured: WorkDescriptionStructured;
}): string {
  const actionRule =
    params.action === 'uitvoering-only'
      ? 'Werk alleen de sectie uitvoering bij; voorbereiding/afwerking mogen leeg blijven als er geen input voor is.'
      : params.action === 'improve'
        ? 'Verbeter en herschrijf de bestaande inhoud professioneel.'
        : 'Genereer een volledige werkbeschrijving.';

  return [
    params.prompt,
    '',
    'Bestaande werkbeschrijving (JSON):',
    JSON.stringify(params.baseStructured),
    '',
    actionRule,
    '',
    'Geef uitsluitend JSON terug in exact dit formaat:',
    '{"werkbeschrijvingStructured":{"title":"string","context":"string","sections":{"voorbereiding":["..."],"uitvoering":["..."],"afwerking":["..."]}}}',
    'Geen markdown, geen extra uitleg.',
  ].join('\n');
}

async function callOpenAiWorkDescription(params: {
  apiKey: string;
  model: string;
  prompt: string;
  action: AiAction | null;
  baseStructured: WorkDescriptionStructured;
}): Promise<unknown> {
  const userPrompt = buildOpenAiUserPrompt({
    prompt: params.prompt,
    action: params.action,
    baseStructured: params.baseStructured,
  });

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0.2,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: OPENAI_SYSTEM_PROMPT }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: userPrompt }],
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

  try {
    return parseJsonWithFallback(outputText);
  } catch {
    return outputText;
  }
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
      return { name, quantity, unit, type };
    })
    .filter((item): item is MaterialContextItem => item !== null);
}

function ensureMaterialsIncluded(
  structuredInput: WorkDescriptionStructured,
  materialContext: MaterialContextItem[],
): WorkDescriptionStructured {
  if (materialContext.length === 0) return structuredInput;

  const structured = sanitizeWorkDescriptionStructured(structuredInput);
  const allRows = flattenStructuredWorkDescription(structured).map((row) => row.toLowerCase());

  const missing = materialContext.filter((item) => {
    const nameLower = item.name.toLowerCase();
    return !allRows.some((row) => row.includes(nameLower));
  });

  if (missing.length === 0) return structured;

  const materialChecklistRows = missing.map((item) =>
    `Materiaal verwerken: ${item.name} (${item.quantity} ${item.unit}).`
  );

  return {
    ...structured,
    sections: {
      ...structured.sections,
      uitvoering: [...structured.sections.uitvoering, ...materialChecklistRows],
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

  if (typeof row.output === 'string' && row.output.trim()) {
    try {
      const parsed = JSON.parse(row.output) as {
        werkbeschrijving_structured?: unknown;
        werkbeschrijvingStructured?: unknown;
      };
      const candidate = parsed.werkbeschrijving_structured ?? parsed.werkbeschrijvingStructured;
      const structured = sanitizeWorkDescriptionStructured(candidate);
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

    const result = await callOpenAiWorkDescription({
      apiKey,
      model,
      prompt,
      action,
      baseStructured,
    });

    const directStructured = extractDirectStructured(result);
    if (directStructured) {
      const mergedStructured = mergeStructuredFromStructured({
        action,
        base: baseStructured,
        generated: directStructured,
      });
      const mergedWithMaterials = ensureMaterialsIncluded(mergedStructured, materialContext);
      const flattened = flattenStructuredWorkDescription(mergedWithMaterials);
      if (quoteId) {
        await persistWorkDescription(quoteId, userId, flattened, mergedWithMaterials);
      }
      return NextResponse.json({
        werkbeschrijving: flattened,
        werkbeschrijvingStructured: mergedWithMaterials,
      });
    }

    const directWerkbeschrijving = extractDirectWerkbeschrijving(result);
    if (directWerkbeschrijving.length > 0) {
      const mergedStructured = mergeStructuredFromRows({
        action,
        base: baseStructured,
        rows: directWerkbeschrijving,
      });
      const mergedWithMaterials = ensureMaterialsIncluded(mergedStructured, materialContext);
      const flattened = flattenStructuredWorkDescription(mergedWithMaterials);
      if (quoteId) {
        await persistWorkDescription(quoteId, userId, flattened, mergedWithMaterials);
      }
      return NextResponse.json({
        werkbeschrijving: flattened,
        werkbeschrijvingStructured: mergedWithMaterials,
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
    const mergedWithMaterials = ensureMaterialsIncluded(mergedStructured, materialContext);
    const flattened = flattenStructuredWorkDescription(mergedWithMaterials);

    if (quoteId) {
      await persistWorkDescription(quoteId, userId, flattened, mergedWithMaterials);
    }

    return NextResponse.json({
      werkbeschrijving: flattened,
      werkbeschrijvingStructured: mergedWithMaterials,
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
