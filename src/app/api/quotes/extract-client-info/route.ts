import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPENAI_MODEL = 'gpt-5.2';

const EXTRACTION_PROMPT = `
Je extraheert klantgegevens uit maximaal twee Nederlandse screenshots/foto's. De afbeeldingen horen bij dezelfde klant. Combineer de informatie uit alle afbeeldingen tot één klantrecord; contactgegevens kunnen op de ene afbeelding staan en het adres op de andere.

Geef ALTIJD exact 1 JSON object terug (geen markdown, geen uitleg) met deze velden:
{
  "klanttype": "particulier" | "zakelijk",
  "bedrijfsnaam": string,
  "contactpersoon": string,
  "voornaam": string,
  "achternaam": string,
  "emailadres": string,
  "telefoonnummer": string,
  "straat": string,
  "huisnummer": string,
  "postcode": string,
  "plaats": string,
  "afwijkendProjectadres": boolean,
  "projectStraat": string,
  "projectHuisnummer": string,
  "projectPostcode": string,
  "projectPlaats": string
}

Regels:
- Gebruik lege string "" als een waarde niet duidelijk leesbaar is.
- Gebruik alleen gegevens die in de afbeelding staan; niet gokken.
- "klanttype" is "zakelijk" als er duidelijke bedrijfsnaam/bedrijfscontext is, anders "particulier".
- Als er maar 1 adres is: gebruik dat als factuuradres en zet afwijkendProjectadres=false met lege projectvelden.
- Als er expliciet een apart projectadres/werkadres staat: zet afwijkendProjectadres=true en vul project* velden.
- Postcode in NL formaat als mogelijk (bijv. "1234 AB").
- Contactpersoon alleen invullen bij zakelijk, anders leeg laten tenzij expliciet genoemd.
`;

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toImageDataUrl(contentType: string, bytes: Buffer): string {
  const type = safeString(contentType) || 'image/jpeg';
  return `data:${type};base64,${bytes.toString('base64')}`;
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

function parseExtractionJson(rawOutput: string): Record<string, unknown> {
  const cleaned = stripCodeFences(rawOutput);
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const firstCurly = cleaned.indexOf('{');
    const lastCurly = cleaned.lastIndexOf('}');
    if (firstCurly !== -1 && lastCurly > firstCurly) {
      const embedded = cleaned.slice(firstCurly, lastCurly + 1);
      return JSON.parse(embedded) as Record<string, unknown>;
    }
    throw new Error('OpenAI output bevat geen geldig JSON-object.');
  }
}

function normalizeKlantType(value: unknown): 'particulier' | 'zakelijk' {
  const raw = safeString(value).toLowerCase();
  if (raw === 'zakelijk') return 'zakelijk';
  return 'particulier';
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const raw = safeString(value).toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'ja';
}

function normalizeClientPayload(input: Record<string, unknown>): Record<string, unknown> {
  const payload = {
    klanttype: normalizeKlantType(input.klanttype),
    bedrijfsnaam: safeString(input.bedrijfsnaam),
    contactpersoon: safeString(input.contactpersoon),
    voornaam: safeString(input.voornaam),
    achternaam: safeString(input.achternaam),
    emailadres: safeString(input.emailadres),
    telefoonnummer: safeString(input.telefoonnummer),
    straat: safeString(input.straat),
    huisnummer: safeString(input.huisnummer),
    postcode: safeString(input.postcode),
    plaats: safeString(input.plaats),
    afwijkendProjectadres: normalizeBoolean(input.afwijkendProjectadres),
    projectStraat: safeString(input.projectStraat),
    projectHuisnummer: safeString(input.projectHuisnummer),
    projectPostcode: safeString(input.projectPostcode),
    projectPlaats: safeString(input.projectPlaats),
  };

  if (!payload.afwijkendProjectadres) {
    payload.projectStraat = '';
    payload.projectHuisnummer = '';
    payload.projectPostcode = '';
    payload.projectPlaats = '';
  }

  return payload;
}

async function callOpenAiExtraction(params: {
  apiKey: string;
  imageDataUrls: string[];
}): Promise<Record<string, unknown>> {
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
          content: [
            { type: 'input_text', text: EXTRACTION_PROMPT },
            ...params.imageDataUrls.map((imageDataUrl) => ({
              type: 'input_image' as const,
              image_url: imageDataUrl,
            })),
          ],
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

  return parseExtractionJson(outputText);
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
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
    const uploadedFiles = formData.getAll('files');
    const legacyFile = formData.get('file');
    const images = uploadedFiles.length > 0
      ? uploadedFiles
      : legacyFile
        ? [legacyFile]
        : [];

    if (images.length === 0 || images.some((image) => !(image instanceof File))) {
      return NextResponse.json({ ok: false, message: 'Afbeelding ontbreekt.' }, { status: 400 });
    }

    if (images.length > 2) {
      return NextResponse.json({ ok: false, message: 'Upload maximaal 2 afbeeldingen.' }, { status: 400 });
    }

    const imageDataUrls = await Promise.all(images.map(async (image, index) => {
      const file = image as File;
      const filename = safeString(file.name) || `client-${Date.now()}-${index + 1}.jpg`;
      const contentType = inferContentType(safeString(file.type), filename);

      if (!isSupportedImage(contentType, filename)) {
        throw new Error('Alleen JPG, PNG, WEBP of HEIC/HEIF zijn toegestaan.');
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      return toImageDataUrl(contentType, bytes);
    }));

    const extracted = await callOpenAiExtraction({
      apiKey,
      imageDataUrls,
    });

    const normalized = normalizeClientPayload(extracted);

    return NextResponse.json({
      ok: true,
      model: OPENAI_MODEL,
      client: normalized,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon klantgegevens niet extraheren.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
