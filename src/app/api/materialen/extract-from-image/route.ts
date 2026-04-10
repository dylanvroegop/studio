import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPENAI_MODEL = 'gpt-5.2';
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

type OptionSets = {
  categories: string[];
  subsections: string[];
  suppliers: string[];
};

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toImageDataUrl(contentType: string, bytes: Buffer): string {
  return `data:${contentType};base64,${bytes.toString('base64')}`;
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

function parseOptionList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => safeString(entry))
      .filter(Boolean)
      .slice(0, 200);
  } catch {
    return [];
  }
}

function parseOptionSets(formData: FormData): OptionSets {
  return {
    categories: parseOptionList(safeString(formData.get('categories')) || null),
    subsections: parseOptionList(safeString(formData.get('subsections')) || null),
    suppliers: parseOptionList(safeString(formData.get('suppliers')) || null),
  };
}

function buildExtractionPrompt(options: OptionSets): string {
  const categoriesText = options.categories.length > 0 ? options.categories.join(', ') : '(geen lijst meegegeven)';
  const subsectionsText = options.subsections.length > 0 ? options.subsections.join(', ') : '(geen lijst meegegeven)';
  const suppliersText = options.suppliers.length > 0 ? options.suppliers.join(', ') : '(geen lijst meegegeven)';

  return `
Je extraheert productgegevens uit een screenshot van een Nederlandse bouwmaterialen-webshop (zoals Bouwmaat).

Geef ALTIJD exact 1 JSON object terug (geen markdown, geen uitleg) met exact deze velden:
{
  "materiaalnaam": string,
  "eenheid": string,
  "prijs_excl_btw": number | null,
  "prijs_incl_btw": number | null,
  "categorie": string,
  "subsectie": string,
  "leverancier": string,
  "confidence": number
}

Regels:
- Gebruik alleen informatie die zichtbaar is in de screenshot.
- Gebruik lege string "" als tekst niet betrouwbaar leesbaar is.
- Gebruik null voor onbekende prijzen.
- "confidence" is een getal 0..1.
- Eenheid normaliseren naar: m1, m2, p/m1, p/m2, p/m3, stuk, doos, set, koker, zak. Als onbekend: "stuk".
- Als meerdere prijzen zichtbaar zijn: gebruik standaard prijs voor 1 stuk/eenheid (niet staffelkorting), tenzij alleen staffelprijs zichtbaar is.
- Als alleen excl of incl zichtbaar is, laat de andere null.
- Leverancier: detecteer merk/winkel als duidelijk (bijv. Bouwmaat), anders leeg.
- Categorie/subsectie: kies ALLEEN uit onderstaande lijsten als een duidelijke match bestaat, anders leeg.

Beschikbare categorieen:
${categoriesText}

Beschikbare subsecties:
${subsectionsText}

Beschikbare leveranciers:
${suppliersText}
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
      return JSON.parse(cleaned.slice(firstCurly, lastCurly + 1)) as Record<string, unknown>;
    }
    throw new Error('OpenAI output bevat geen geldig JSON-object.');
  }
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    return Number(value.toFixed(2));
  }
  if (typeof value !== 'string') return null;
  const raw = value.trim().replace(/\u20ac/g, '').replace(/\s+/g, '');
  if (!raw) return null;
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Number(parsed.toFixed(2));
}

function normalizeUnit(raw: unknown): string {
  const value = safeString(raw).toLowerCase();
  if (!value) return 'stuk';
  const compact = value.replace(/\s+/g, '').replace('²', '2').replace('³', '3');
  const aliases: Record<string, string> = {
    m: 'm1',
    m1: 'm1',
    meter: 'm1',
    strekkendemeter: 'm1',
    m2: 'm2',
    m3: 'p/m3',
    st: 'stuk',
    stuk: 'stuk',
    stuks: 'stuk',
    perstuk: 'stuk',
    doos: 'doos',
    set: 'set',
    koker: 'koker',
    zak: 'zak',
    'p/m1': 'p/m1',
    'p/m2': 'p/m2',
    'p/m3': 'p/m3',
    perm1: 'p/m1',
    perm2: 'p/m2',
    perm3: 'p/m3',
  };
  return aliases[compact] || 'stuk';
}

function normalizeConfidence(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0.5;
  if (raw < 0) return 0;
  if (raw > 1) return 1;
  return Number(raw.toFixed(2));
}

function normalizeMaterialPayload(input: Record<string, unknown>) {
  const prijsExcl = normalizeNumber(input.prijs_excl_btw);
  const prijsIncl = normalizeNumber(input.prijs_incl_btw);
  return {
    materiaalnaam: safeString(input.materiaalnaam),
    eenheid: normalizeUnit(input.eenheid),
    prijs_excl_btw: prijsExcl,
    prijs_incl_btw: prijsIncl,
    categorie: safeString(input.categorie),
    subsectie: safeString(input.subsectie),
    leverancier: safeString(input.leverancier),
    confidence: normalizeConfidence(input.confidence),
  };
}

async function callOpenAiExtraction(params: {
  apiKey: string;
  imageDataUrl: string;
  options: OptionSets;
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
            {
              type: 'input_text',
              text: buildExtractionPrompt(params.options),
            },
            { type: 'input_image', image_url: params.imageDataUrl },
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
    const image = formData.get('file');
    if (!(image instanceof File)) {
      return NextResponse.json({ ok: false, message: 'Afbeelding ontbreekt.' }, { status: 400 });
    }
    if (image.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ ok: false, message: 'Afbeelding is te groot (max 8MB).' }, { status: 400 });
    }

    const filename = safeString(image.name) || `materiaal-${Date.now()}.jpg`;
    const contentType = inferContentType(safeString(image.type), filename);
    if (!isSupportedImage(contentType, filename)) {
      return NextResponse.json({ ok: false, message: 'Alleen JPG, PNG, WEBP of HEIC/HEIF zijn toegestaan.' }, { status: 400 });
    }

    const options = parseOptionSets(formData);
    const bytes = Buffer.from(await image.arrayBuffer());
    const imageDataUrl = toImageDataUrl(contentType, bytes);

    const extracted = await callOpenAiExtraction({
      apiKey,
      imageDataUrl,
      options,
    });

    const material = normalizeMaterialPayload(extracted);

    return NextResponse.json({
      ok: true,
      model: OPENAI_MODEL,
      material,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon materiaalgegevens niet extraheren.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
