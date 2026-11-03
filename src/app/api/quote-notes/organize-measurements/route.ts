import { NextResponse } from 'next/server';
import { noteShapeFields, type NoteMeasurement } from '@/lib/note-surfaces';
import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPENAI_MODEL = process.env.OPENAI_WORK_DESCRIPTION_MODEL?.trim()
  || process.env.OPENAI_MODEL?.trim()
  || 'gpt-5.5';
const OPENAI_TIMEOUT_MS = 300_000;

type MeasurementRow = NoteMeasurement;

type RequestBody = {
  title?: unknown;
  notes?: unknown;
};

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const row = payload as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{
        text?: unknown;
        type?: string;
      }>;
    }>;
  };

  if (typeof row.output_text === 'string' && row.output_text.trim()) {
    return row.output_text.trim();
  }

  if (Array.isArray(row.output)) {
    return row.output
      .flatMap((item) => Array.isArray(item.content) ? item.content : [])
      .map((content) => typeof content.text === 'string' ? content.text : '')
      .join('\n')
      .trim();
  }

  return '';
}

function parseJsonOutput(raw: string): unknown {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

function sanitizeRows(value: unknown): MeasurementRow[] {
  if (!value || typeof value !== 'object') return [];
  const rows = Array.isArray((value as { rows?: unknown }).rows)
    ? (value as { rows: unknown[] }).rows
    : Array.isArray(value)
      ? value
      : [];

  return rows.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const measurementRow: MeasurementRow = {
      ...noteShapeFields(row),
      title: safeString(row.title),
      length: safeString(row.length),
      width: safeString(row.width),
      height: safeString(row.height),
      thickness: safeString(row.thickness),
    };
    const hasContent = Object.values(measurementRow).some((field) => field.trim());
    return hasContent ? [measurementRow] : [];
  });
}

function buildPrompt(title: string, notes: string): string {
  return [
    'Zet de vrije notities om naar maatwerk-rijen voor een offerte-app.',
    '',
    'Belangrijk:',
    '- Gebruik AI-interpretatie van de vrije tekst. Geen regex-achtige simpele splitsing.',
    '- Laat de originele notities ongemoeid; geef alleen rijen terug.',
    '- Negeer links, URL’s en secties met titel Links / Link / # Links volledig.',
    '- Maak alleen maatwerk-rijen voor echte maten, aantallen en omschrijvingen uit deze ene note-box.',
    '- Verplaats geen inhoud naar een andere klus en verzin niets.',
    '- Als een regel een aantal heeft zoals "4x 2600x2200", zet "4x" in title en zet de maten in de maatvelden.',
    '- Als tekst een label bevat zoals "voorkant", "zijkant bijkeuken", "achterkant bijkeuken" of "tussen kozijn", gebruik dat als title.',
    '- Als er "hoog" of "hoogte" staat, zet die maat in height.',
    '- Gebruik length, width, height en thickness als vrije stringvelden. Verwijder "mm" als dat logisch is, maar behoud tekst die nodig is om de maat te begrijpen.',
    '- Bewaar de vorm in shape: rectangle, slope (schuin/rechthoekige driehoek), gable (punt), l-shape of u-shape. Laat shape weg als de vorm onbekend is.',
    '- Bij slope: length is de basis, hoogteLinks en hoogteRechts zijn de loodrechte zijhoogten. Alleen bij een expliciete rechthoekige driehoek is één zijhoogte 0. Verzin geen nul of rechte hoek bij ontbrekende informatie.',
    '- Bij gable: length is de basis, height de zijhoogte en hoogteNok de totale hoogte. Bij l-shape/u-shape: bewaar lengte1, lengte2 en hoogte1, hoogte2, hoogte3 zoals opgegeven.',
    '- Geef vormmaten als strings in millimeters terug, ook een expliciete nul. Reken geen onbekende maten uit.',
    '- Als je niet zeker weet welk veld hoort bij een maat, kies de meest logische bouwkundige kolom en laat onzekere velden leeg.',
    '',
    'Antwoord uitsluitend als geldige JSON, zonder markdown:',
    '{"rows":[{"title":"","length":"","width":"","height":"","thickness":""}]}',
    '',
    `Note titel: ${title || '(geen titel)'}`,
    'Note tekst:',
    notes || '(leeg)',
  ].join('\n');
}

async function callOpenAi(apiKey: string, title: string, notes: string): Promise<MeasurementRow[]> {
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
            text: 'Je bent een Nederlandse bouw-calculatie assistent die vrije notities omzet naar maatwerkregels. Geef alleen JSON terug.',
          }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: buildPrompt(title, notes) }],
        },
      ],
    }),
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = safeString((payload as { error?: { message?: unknown } }).error?.message) || 'OpenAI maat-organisatie mislukt.';
    throw new Error(message);
  }

  const outputText = extractResponseText(payload);
  if (!outputText) return [];
  return sanitizeRows(parseJsonOutput(outputText));
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 401 });
    }

    const { auth } = initFirebaseAdmin();
    try {
      const decoded = await auth.verifyIdToken(token);
      const trialBlockedResponse = await ensureDemoTrialActiveByUid(decoded.uid);
      if (trialBlockedResponse) return trialBlockedResponse;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as RequestBody | null;
    const title = safeString(body?.title);
    const notes = safeString(body?.notes);
    if (!title && !notes) {
      return NextResponse.json({ error: 'Titel of notitie is verplicht.' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY is niet geconfigureerd.' }, { status: 500 });
    }

    const rows = await callOpenAi(apiKey, title, notes);
    return NextResponse.json({ rows });
  } catch (error) {
    const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    return NextResponse.json(
      { error: isTimeout ? 'Maten organiseren timeout.' : `Maten organiseren mislukt: ${message}` },
      { status: isTimeout ? 504 : 502 },
    );
  }
}
