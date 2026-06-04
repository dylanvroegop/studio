import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { redactMaterialPresentationPayload } from '@/lib/material-presentations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPENAI_MODEL = 'gpt-5.2';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isAllowedStorageUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === 'https:' &&
      (
        url.hostname === 'firebasestorage.googleapis.com' ||
        url.hostname === 'storage.googleapis.com' ||
        url.hostname.endsWith('.firebasestorage.app')
      )
    );
  } catch {
    return false;
  }
}

async function imageUrlToDataUrl(rawUrl: string): Promise<string | null> {
  if (!rawUrl || !isAllowedStorageUrl(rawUrl)) return null;

  const response = await fetch(rawUrl);
  if (!response.ok) {
    throw new Error('Kon afbeelding niet ophalen voor analyse.');
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  if (!contentType.startsWith('image/')) {
    throw new Error('Bestand is geen afbeelding.');
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('Afbeelding is te groot voor analyse.');
  }

  return `data:${contentType};base64,${bytes.toString('base64')}`;
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
      ? (entry as Record<string, unknown>).content as unknown[]
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
  return trimmed
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function parseJsonObject(rawOutput: string): Record<string, unknown> {
  const cleaned = stripCodeFences(rawOutput);
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const firstCurly = cleaned.indexOf('{');
    const lastCurly = cleaned.lastIndexOf('}');
    if (firstCurly !== -1 && lastCurly > firstCurly) {
      return JSON.parse(cleaned.slice(firstCurly, lastCurly + 1)) as Record<string, unknown>;
    }
    throw new Error('AI output bevat geen geldig JSON-object.');
  }
}

function buildPrompt(): string {
  return `
Je analyseert product- en specificatiescreenshots voor een Nederlandse offerte.

Geef ALTIJD exact 1 JSON object terug (geen markdown, geen uitleg) met exact deze velden:
{
  "title": string,
  "application": string,
  "clientDescription": string,
  "whyChosen": string,
  "keyProperties": string[],
  "visibleSpecifications": [{"label": string, "value": string}]
}

Doel:
- Maak klantvriendelijke vertrouwensinformatie voor een offerte.
- Beschrijf materiaalrichting, toepassing, afwerking en kwaliteitsindicatoren professioneel.

Je mag ALLEEN opnemen:
- Generieke of brand-veilige producttype/naam als die zichtbaar is.
- Toepassing zoals boeidelen, gevelbekleding, binnendeur, isolatie.
- Kleur, afwerking, maat, dikte, profiel, materiaaltype, brand/sound/isolatiewaarde als relevant.
- Klantvoordelen en waarom het materiaal geschikt is.
- Zichtbare kwaliteitsindicatoren zoals onderhoudsarm, UV-bestendig, weerbestendig, kleurvast, geluiddempend, vochtbestendig.

Je mag NOOIT opnemen:
- Leveranciersnaam, winkelnaam, artikelnummer, EAN/GTIN, SKU, productcode, bestelnummer.
- Product URL, website, voorraadstatus, levertijd, leverancier.
- Inkoopprijs, verkoopprijs, actieprijs, korting, marge, staffelprijs of bedragen.
- Informatie waarmee een klant makkelijk exact de inkoopprijs kan vergelijken.

Als verboden informatie zichtbaar is in OCR: negeer die stilzwijgend. Noem niet dat je iets hebt weggelaten.
Gebruik Nederlands, professioneel en concreet. Verzin geen technische specificaties.
`;
}

async function callOpenAi(params: {
  apiKey: string;
  images: string[];
}): Promise<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [
    {
      type: 'input_text',
      text: buildPrompt(),
    },
    ...params.images.map((imageUrl) => ({
      type: 'input_image',
      image_url: imageUrl,
    })),
  ];

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
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
    const message = safeString((payload as { error?: { message?: unknown } }).error?.message) || 'OpenAI analyse mislukt.';
    throw new Error(message);
  }

  const outputText = extractResponseText(payload);
  if (!outputText) {
    throw new Error('OpenAI gaf geen leesbare output terug.');
  }

  return parseJsonObject(outputText);
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

    const body = await request.json().catch(() => null) as {
      productImageUrl?: unknown;
      specsImageUrl?: unknown;
    } | null;

    const productImageUrl = safeString(body?.productImageUrl);
    const specsImageUrl = safeString(body?.specsImageUrl);
    if (!productImageUrl && !specsImageUrl) {
      return NextResponse.json({ ok: false, message: 'Upload eerst een product- of specificatieafbeelding.' }, { status: 400 });
    }

    const images = (await Promise.all([
      imageUrlToDataUrl(productImageUrl),
      imageUrlToDataUrl(specsImageUrl),
    ])).filter((image): image is string => Boolean(image));

    if (images.length === 0) {
      return NextResponse.json({ ok: false, message: 'Geen geldige Firebase Storage afbeelding gevonden.' }, { status: 400 });
    }

    const extracted = await callOpenAi({ apiKey, images });
    const presentation = redactMaterialPresentationPayload(extracted);

    return NextResponse.json({
      ok: true,
      model: OPENAI_MODEL,
      presentation,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon materiaalpresentatie niet analyseren.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
