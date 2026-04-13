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

function normalizeStepRows(input: unknown, max = 100): string[] {
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

function hasStructuredContent(value: WorkDescriptionStructured): boolean {
  return Boolean(
    value.title
    || value.context
    || value.sections.uitvoering.length > 0
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

  const directCandidate = row.werkbeschrijving_structured ?? row.werkbeschrijvingStructured;
  if (directCandidate) {
    const structured = sanitizeWorkDescriptionStructured(directCandidate);
    if (hasStructuredContent(structured)) return structured;
  }

  const n8nRows = extractDirectWerkbeschrijving(row);
  const n8nTitle = safeString(row.korteTitel) || safeString(row.hoofdtitel);
  const n8nSummary = safeString(row.korteBeschrijving) || safeString(row.samenvatting);
  if (n8nRows.length > 0 || n8nTitle || n8nSummary) {
    const structured = toStructuredWorkDescription({
      korteTitel: n8nTitle,
      korteBeschrijving: n8nSummary,
      werkbeschrijving: n8nRows,
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
        hoofdtitel?: unknown;
        samenvatting?: unknown;
        werkbeschrijving?: unknown;
      };

      const parsedDirectCandidate = parsed.werkbeschrijving_structured ?? parsed.werkbeschrijvingStructured;
      if (parsedDirectCandidate) {
        const structured = sanitizeWorkDescriptionStructured(parsedDirectCandidate);
        if (hasStructuredContent(structured)) return structured;
      }

      const parsedRows = normalizeStepRows(parsed.werkbeschrijving);
      if (parsedRows.length > 0) {
        const structured = toStructuredWorkDescription({
          korteTitel: safeString(parsed.korteTitel) || safeString(parsed.hoofdtitel),
          korteBeschrijving: safeString(parsed.korteBeschrijving) || safeString(parsed.samenvatting),
          werkbeschrijving: parsedRows,
        });
        if (hasStructuredContent(structured)) return structured;
      }
    } catch {
      // ignore malformed JSON output wrapper
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
      return normalizeStepRows(candidate, 100);
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

function buildPromptFromBody(body: RequestBody): string {
  const directPrompt = safeString(body.prompt);
  if (directPrompt) return directPrompt;

  const parts = [
    safeString(body.title) ? `Titel: ${safeString(body.title)}` : '',
    safeString(body.context) ? `Context: ${safeString(body.context)}` : '',
    safeString(body.category) ? `Categorie: ${safeString(body.category)}` : '',
    safeString(body.notesContext) ? `Notities: ${safeString(body.notesContext)}` : '',
    safeString(body.measurementsContext) ? `Maatvoering: ${safeString(body.measurementsContext)}` : '',
  ].filter(Boolean);

  return parts.join('\n');
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
      const structured = sanitizeWorkDescriptionStructured(directStructured);
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
      const structured = toStructuredWorkDescription({ werkbeschrijving: directWerkbeschrijving });
      if (quoteId) {
        await persistWorkDescription(quoteId, userId, directWerkbeschrijving, structured);
      }
      return NextResponse.json({
        werkbeschrijving: directWerkbeschrijving,
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

    const structured = toStructuredWorkDescription({ werkbeschrijving });
    if (quoteId) {
      await persistWorkDescription(quoteId, userId, werkbeschrijving, structured);
    }

    return NextResponse.json({
      werkbeschrijving,
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
