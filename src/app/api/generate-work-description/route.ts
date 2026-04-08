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

const DEFAULT_N8N_WORK_DESCRIPTION_WEBHOOK =
  'https://n8n.dylan8n.org/webhook/38942fcb-1194-4f6b-8032-0c970425af7c';

function truncateForDebug(value: string, max: number = 500): string {
  const text = value.trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function extractN8nErrorDetail(rawBody: string): string {
  const body = rawBody.trim();
  if (!body) return '';

  try {
    const parsed = JSON.parse(body) as {
      message?: unknown;
      error?: unknown;
      code?: unknown;
      details?: unknown;
    };
    const candidates = [parsed.message, parsed.error, parsed.details, parsed.code];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) return truncateForDebug(candidate);
      if (typeof candidate === 'number') return String(candidate);
    }
  } catch {
    // Keep fallback below for non-JSON responses.
  }

  return truncateForDebug(body);
}

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
}): string {
  const titleLine = input.title ? `Titel: ${input.title}` : '';
  const contextLine = input.context ? `Context: ${input.context}` : '';
  const categoryLine = input.category ? `Categorie: ${input.category}` : '';

  if (input.action === 'uitvoering-only') {
    return [
      'Vul alleen de uitvoeringsstappen voor deze werkbeschrijving.',
      titleLine,
      contextLine,
      categoryLine,
      'Geef output als lijst met concrete stappen.',
    ].filter(Boolean).join('\n');
  }

  if (input.action === 'improve') {
    return [
      'Verbeter de bestaande werkbeschrijving zodat deze professioneel, helder en uitvoerbaar is.',
      titleLine,
      contextLine,
      categoryLine,
      'Behoud Nederlandse taal en praktische volgorde.',
    ].filter(Boolean).join('\n');
  }

  return [
    'Genereer een volledige werkbeschrijving met voorbereiding, uitvoering en afwerking.',
    titleLine,
    contextLine,
    categoryLine,
    'Geef output als duidelijke stappen in het Nederlands.',
  ].filter(Boolean).join('\n');
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
    } | null;

    const action = normalizeAction(rawBody?.action);
    const quoteId = typeof rawBody?.quoteId === 'string' ? rawBody.quoteId.trim() : '';
    const title = typeof rawBody?.title === 'string' ? rawBody.title.trim() : '';
    const context = typeof rawBody?.context === 'string' ? rawBody.context.trim() : '';
    const category = typeof rawBody?.category === 'string' ? rawBody.category.trim() : '';

    const explicitPrompt = typeof rawBody?.prompt === 'string' ? rawBody.prompt.trim() : '';
    const fallbackPrompt = buildActionPrompt({ action, title, context, category });
    const prompt = explicitPrompt || fallbackPrompt;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is verplicht.' }, { status: 400 });
    }

    const baseStructured = toStructuredWorkDescription({
      werkbeschrijving_structured: rawBody?.structuredInput,
      korteTitel: title,
      korteBeschrijving: context,
    });

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
          prompt,
          input: prompt,
          quoteId,
          action,
          targetSection: rawBody?.targetSection,
          title,
          context,
          category,
          structuredInput: baseStructured,
          userId,
          userid: userId,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Onbekende fetch-fout';
      return NextResponse.json({
        error: `Werkbeschrijving webhook niet bereikbaar: ${message}`,
        n8nStatus: null,
        n8nDetail: 'Network/fetch error while calling n8n webhook',
      }, { status: 502 });
    }

    const responseText = await response.text();
    if (!response.ok) {
      const detail = extractN8nErrorDetail(responseText);
      const detailSuffix = detail ? `: ${detail}` : '';
      return NextResponse.json({
        error: `Werkbeschrijving webhook mislukt (n8n ${response.status})${detailSuffix}`,
        n8nStatus: response.status,
        n8nDetail: detail || null,
      }, { status: 502 });
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
    if (directStructured) {
      const mergedStructured = mergeStructuredFromStructured({
        action,
        base: baseStructured,
        generated: directStructured,
      });
      const flattened = flattenStructuredWorkDescription(mergedStructured);
      if (quoteId) {
        await persistWorkDescription(quoteId, userId, flattened, mergedStructured);
      }
      return NextResponse.json({
        werkbeschrijving: flattened,
        werkbeschrijvingStructured: mergedStructured,
      });
    }

    const directWerkbeschrijving = extractDirectWerkbeschrijving(result);
    if (directWerkbeschrijving.length > 0) {
      const mergedStructured = mergeStructuredFromRows({
        action,
        base: baseStructured,
        rows: directWerkbeschrijving,
      });
      const flattened = flattenStructuredWorkDescription(mergedStructured);
      if (quoteId) {
        await persistWorkDescription(quoteId, userId, flattened, mergedStructured);
      }
      return NextResponse.json({
        werkbeschrijving: flattened,
        werkbeschrijvingStructured: mergedStructured,
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

    const mergedStructured = mergeStructuredFromRows({
      action,
      base: baseStructured,
      rows: werkbeschrijving,
    });
    const flattened = flattenStructuredWorkDescription(mergedStructured);

    if (quoteId) {
      await persistWorkDescription(quoteId, userId, flattened, mergedStructured);
    }

    return NextResponse.json({
      werkbeschrijving: flattened,
      werkbeschrijvingStructured: mergedStructured,
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
