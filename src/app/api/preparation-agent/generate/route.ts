import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPENAI_MODEL = 'gpt-5.4';
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

type PreparationResult = {
  titel: string;
  samenvatting: string;
  klantdoelen: string[];
  aannames: string[];
  vragenVoorKlant: string[];
  risicoEnAandacht: string[];
  materiaalRichting: string[];
  vervolgstappen: string[];
};

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function inferContentType(rawType: string, filename: string): string {
  if (rawType) return rawType;
  const lower = filename.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  return 'application/octet-stream';
}

function isSupportedImage(contentType: string, filename: string): boolean {
  if (contentType.startsWith('image/')) {
    return ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(contentType);
  }

  const lower = filename.toLowerCase();
  return (
    lower.endsWith('.jpg')
    || lower.endsWith('.jpeg')
    || lower.endsWith('.png')
    || lower.endsWith('.webp')
    || lower.endsWith('.heic')
    || lower.endsWith('.heif')
  );
}

function toImageDataUrl(contentType: string, bytes: Buffer): string {
  return `data:${contentType};base64,${bytes.toString('base64')}`;
}

function buildPreparationPrompt(userInput: string): string {
  return `
Je bent een werkvoorbereider voor Nederlandse timmer- en afbouwprojecten.

Je taak:
- Analyseer de aangeleverde klantinformatie (tekst en eventueel screenshot).
- Maak een meeting-voorbereiding die een vakman direct kan gebruiken.
- Houd het praktisch, concreet en in het Nederlands.

Belangrijk:
- Verzín geen specifieke maten, merkproducten of afspraken als die niet genoemd zijn.
- Als data onzeker is, zet dit als aanname of vraag.
- Focus op intake/voorbereiding, niet op definitieve offertebedragen.

Geef ALLEEN JSON terug met exact deze keys:
{
  "titel": string,
  "samenvatting": string,
  "klantdoelen": string[],
  "aannames": string[],
  "vragenVoorKlant": string[],
  "risicoEnAandacht": string[],
  "materiaalRichting": string[],
  "vervolgstappen": string[]
}

Kwaliteitseisen:
- titel: max 8 woorden.
- samenvatting: 2-3 zinnen.
- Elke lijst: 3-7 concrete bullets.

Gebruikersinput:
${userInput}
`;
}

function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const root = payload as Record<string, unknown>;
  const direct = safeString(root.output_text);
  if (direct) return direct;

  const output = Array.isArray(root.output) ? root.output : [];
  const chunks: string[] = [];

  output.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const content = Array.isArray((entry as Record<string, unknown>).content)
      ? ((entry as Record<string, unknown>).content as unknown[])
      : [];
    content.forEach((part) => {
      if (!part || typeof part !== 'object') return;
      const row = part as Record<string, unknown>;
      const text = safeString(row.text) || safeString(row.output_text);
      if (text) chunks.push(text);
    });
  });

  return chunks.join('\n').trim();
}

function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => safeString(entry))
    .filter(Boolean)
    .slice(0, 8);
}

function normalizePreparationPayload(input: Record<string, unknown>): PreparationResult {
  const fallbackQuestions = ['Wat is de exacte scope en prioriteit van de klant?'];
  const vragenVoorKlant = toStringList(input.vragenVoorKlant);

  return {
    titel: safeString(input.titel) || 'Voorbereiding klantgesprek',
    samenvatting: safeString(input.samenvatting) || 'Overzicht van de besproken aanvraag en focus voor het intakegesprek.',
    klantdoelen: toStringList(input.klantdoelen),
    aannames: toStringList(input.aannames),
    vragenVoorKlant: vragenVoorKlant.length > 0 ? vragenVoorKlant : fallbackQuestions,
    risicoEnAandacht: toStringList(input.risicoEnAandacht),
    materiaalRichting: toStringList(input.materiaalRichting),
    vervolgstappen: toStringList(input.vervolgstappen),
  };
}

function parsePreparationJson(rawOutput: string): PreparationResult {
  const cleaned = stripCodeFences(rawOutput);

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return normalizePreparationPayload(parsed);
  } catch {
    const firstCurly = cleaned.indexOf('{');
    const lastCurly = cleaned.lastIndexOf('}');
    if (firstCurly !== -1 && lastCurly > firstCurly) {
      const parsed = JSON.parse(cleaned.slice(firstCurly, lastCurly + 1)) as Record<string, unknown>;
      return normalizePreparationPayload(parsed);
    }
    throw new Error('AI output bevat geen geldig JSON-object.');
  }
}

async function callOpenAiPreparation(params: {
  apiKey: string;
  userInput: string;
  imageDataUrl: string | null;
}): Promise<PreparationResult> {
  const content: Array<Record<string, string>> = [
    {
      type: 'input_text',
      text: buildPreparationPrompt(params.userInput),
    },
  ];

  if (params.imageDataUrl) {
    content.push({ type: 'input_image', image_url: params.imageDataUrl });
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      reasoning: { effort: 'medium' },
      input: [
        {
          role: 'user',
          content,
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = safeString((payload as { error?: { message?: unknown } }).error?.message) || 'AI voorbereiding mislukt.';
    throw new Error(message);
  }

  const outputText = extractResponseText(payload);
  if (!outputText) {
    throw new Error('AI gaf geen leesbare output terug.');
  }

  return parsePreparationJson(outputText);
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token).catch(() => null);
    const uid = decoded?.uid || '';
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const apiKey = safeString(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      return NextResponse.json({ ok: false, message: 'OPENAI_API_KEY ontbreekt op de server.' }, { status: 500 });
    }

    const formData = await request.formData();
    const rawInput = safeString(formData.get('input'));
    const image = formData.get('file');

    let imageDataUrl: string | null = null;

    if (image instanceof File) {
      if (image.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json({ ok: false, message: 'Afbeelding is te groot (max 8MB).' }, { status: 400 });
      }

      const filename = safeString(image.name) || `preparation-${Date.now()}.jpg`;
      const contentType = inferContentType(safeString(image.type), filename);
      if (!isSupportedImage(contentType, filename)) {
        return NextResponse.json({ ok: false, message: 'Alleen JPG, PNG, WEBP of HEIC/HEIF zijn toegestaan.' }, { status: 400 });
      }

      const bytes = Buffer.from(await image.arrayBuffer());
      imageDataUrl = toImageDataUrl(contentType, bytes);
    }

    if (!rawInput && !imageDataUrl) {
      return NextResponse.json({ ok: false, message: 'Voer tekst in of upload een screenshot.' }, { status: 400 });
    }

    const preparation = await callOpenAiPreparation({
      apiKey,
      userInput: rawInput,
      imageDataUrl,
    });

    return NextResponse.json({
      ok: true,
      preparation,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Voorbereiding genereren mislukt.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
