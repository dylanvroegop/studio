import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPENAI_MODEL = 'gpt-5.2';
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const OPENAI_EXTRACTION_TIMEOUT_MS = 60_000;

type OptionSets = {
  categories: string[];
  subsections: string[];
  suppliers: string[];
  categorySubsections: Record<string, string[]>;
  activeCategory: string;
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

function parseCategorySubsections(raw: string | null): Record<string, string[]> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, string[]> = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([category, values]) => {
      const normalizedCategory = safeString(category);
      if (!normalizedCategory || !Array.isArray(values)) return;
      const normalizedValues = values
        .map((value) => safeString(value))
        .filter(Boolean)
        .slice(0, 200);
      if (normalizedValues.length > 0) {
        result[normalizedCategory] = normalizedValues;
      }
    });
    return result;
  } catch {
    return {};
  }
}

function parseOptionSets(formData: FormData): OptionSets {
  return {
    categories: parseOptionList(safeString(formData.get('categories')) || null),
    subsections: parseOptionList(safeString(formData.get('subsections')) || null),
    suppliers: parseOptionList(safeString(formData.get('suppliers')) || null),
    categorySubsections: parseCategorySubsections(safeString(formData.get('categorySubsections')) || null),
    activeCategory: safeString(formData.get('activeCategory')),
  };
}

function buildExtractionPrompt(options: OptionSets, extraRules = ''): string {
  const categoriesText = options.categories.length > 0 ? options.categories.join(', ') : '(geen lijst meegegeven)';
  const subsectionsText = options.subsections.length > 0 ? options.subsections.join(', ') : '(geen lijst meegegeven)';
  const suppliersText = options.suppliers.length > 0 ? options.suppliers.join(', ') : '(geen lijst meegegeven)';
  const activeCategoryText = options.activeCategory || '(geen actieve categorie)';
  const categorySubsectionsText = Object.entries(options.categorySubsections)
    .map(([category, subsections]) => `${category}: ${subsections.join(', ')}`)
    .join('\n') || '(geen categorie->subsectie mapping meegegeven)';

  return `
Je extraheert productgegevens uit een screenshot van een Nederlandse bouwmaterialen-webshop (zoals Bouwmaat).

Geef ALTIJD exact 1 JSON object terug (geen markdown, geen uitleg) met exact deze velden:
{
  "materiaalnaam": string,
  "eenheid": string,
  "prijs_excl_btw": number | null,
  "prijs_incl_btw": number | null,
  "lengte": string,
  "breedte": string,
  "hoogte": string,
  "dikte": string,
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
- "materiaalnaam" moet zo volledig mogelijk zijn op basis van zichtbare productdetails:
  1) Start met de zichtbare producttitel/naam.
  2) Voeg zichtbare variant/maat-info toe (bijv. "3.66 m / Zwart / 1.14 mm") als dit in beeld staat.
  3) Voeg zichtbare afmetingen toe (zoals "Breedte: 3.66 m", "Lengte: 6.00 m") wanneer aanwezig.
  4) Gebruik ALLEEN wat expliciet leesbaar is; nooit afmetingen, kleur of dikte verzinnen.
  5) Laat prijsinformatie weg uit "materiaalnaam" (prijs gaat in prijsvelden).
- Eenheid normaliseren naar: m1, m2, p/m1, p/m2, p/m3, stuk, doos, set, koker, zak. Als onbekend: "stuk".
- Als meerdere prijzen zichtbaar zijn: gebruik standaard prijs voor 1 stuk/eenheid (niet staffelkorting), tenzij alleen staffelprijs zichtbaar is.
- Als alleen excl of incl zichtbaar is, laat de andere null.
- Voor afmetingen:
  - Vul "lengte", "breedte", "hoogte", "dikte" als string met zichtbare maat + eenheid (bijv. "6.00 m", "3.66 m", "1.14 mm").
  - Als niet zichtbaar of niet betrouwbaar leesbaar: lege string "".
  - Zet geen afmetingen om naar andere eenheden; neem exact over zoals zichtbaar.
- Leverancier: detecteer merk/winkel als duidelijk (bijv. Bouwmaat).
- Leverancier: kies bij voorkeur uit onderstaande leverancierslijst. Gebruik zichtbare URL/tabtitel/logo/merknaam als primaire hint (bijv. bouwmaat.nl => Bouwmaat).
- Leverancier: als de webshop niet in de leverancierslijst staat maar de URL zichtbaar is, gebruik alleen de basis-URL t/m de domeinextensie (bijv. https://www.kunststofbouwmateriaal.nl/) en laat productpad/query weg.
- Categorie/subsectie: hergebruik bij een duidelijke inhoudelijke match exact de schrijfwijze uit onderstaande lijsten.
- Voorbeeld: herkenbaar SLS-, ribben- of constructiehout hoort bij "Balkhout" wanneer die categorie beschikbaar is.
- Maak nooit een nieuwe hoofdlettervariant van een bestaande categorie (bijv. niet "balkhout" naast "Balkhout").
- Bij twijfel: laat categorie/subsectie leeg; forceer geen zwakke overeenkomst.
- Als "Actieve categorie" is meegegeven, gebruik die alleen als het product daar inhoudelijk bij past.
- Subsectie MOET passen binnen de categorie->subsectie mapping als die beschikbaar is.

Beschikbare categorieen:
${categoriesText}

Actieve categorie:
${activeCategoryText}

Categorie -> subsecties (gebruik deze mapping):
${categorySubsectionsText}

Beschikbare subsecties:
${subsectionsText}

Beschikbare leveranciers:
${suppliersText}
${extraRules ? `\nExtra correctieregels:\n${extraRules}\n` : ''}
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

function isUrlLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^www\./i.test(trimmed)) return true;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|\?|#|$)/i.test(trimmed);
}

function normalizeSupplierUrlOrigin(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`;

  try {
    const url = new URL(withProtocol);
    if (!url.hostname.includes('.')) return '';
    return `${url.protocol}//${url.hostname}/`;
  } catch {
    const match = withProtocol.match(/^(https?:\/\/)?([^/\s?#]+\.[a-z]{2,})(?:[/?#]|$)/i);
    if (!match) return '';
    return `https://${match[2].replace(/^www\./i, 'www.')}/`;
  }
}

function deriveSupplierNameFromUrl(value: string): string {
  const origin = normalizeSupplierUrlOrigin(value);
  if (!origin) return '';

  try {
    const url = new URL(origin);
    const label = url.hostname
      .replace(/^www\./i, '')
      .replace(/\.[a-z]{2,}$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim();

    return label
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  } catch {
    return '';
  }
}

function isCleanSupplierName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (isUrlLike(trimmed)) return false;
  if (/[/?#@]/.test(trimmed)) return false;
  return /[a-z0-9]/i.test(trimmed);
}

function normalizeLooseMatchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pickBestMatchingOption(raw: string, options: string[]): string {
  const normalizedRaw = normalizeLooseMatchText(raw);
  if (!normalizedRaw || options.length === 0) return '';

  const normalizedOptions = options.map((option) => ({
    original: option,
    normalized: normalizeLooseMatchText(option),
  }));

  const exact = normalizedOptions.find((option) => option.normalized === normalizedRaw);
  if (exact) return exact.original;

  const starts = normalizedOptions.find((option) => option.normalized.startsWith(normalizedRaw));
  if (starts) return starts.original;

  const contains = normalizedOptions.find((option) =>
    option.normalized.includes(normalizedRaw) || normalizedRaw.includes(option.normalized)
  );
  if (contains) return contains.original;

  return '';
}

function resolveSupplier(rawSupplier: string, materialName: string, options: string[]): string {
  if (options.length === 0 && !isUrlLike(rawSupplier)) {
    return isCleanSupplierName(rawSupplier) ? rawSupplier : '';
  }
  const hintText = `${rawSupplier} ${materialName}`.toLowerCase();
  const aliases = [
    { variants: ['bouwmaat', 'bouwmaat.nl'], canonical: 'bouwmaat' },
    { variants: ['hornbach', 'hornbach.nl'], canonical: 'hornbach' },
    { variants: ['gamma', 'gamma.nl'], canonical: 'gamma' },
    { variants: ['karwei', 'karwei.nl'], canonical: 'karwei' },
    { variants: ['praxis', 'praxis.nl'], canonical: 'praxis' },
    { variants: ['stiho', 'stiho.nl'], canonical: 'stiho' },
    { variants: ['jongeneel', 'jongeneel.nl'], canonical: 'jongeneel' },
  ];
  const aliasMatch = aliases.find((entry) => entry.variants.some((variant) => hintText.includes(variant)));
  if (aliasMatch) {
    const canonical = pickBestMatchingOption(aliasMatch.canonical, options);
    if (canonical) return canonical;
  }
  if (isUrlLike(rawSupplier)) {
    const origin = normalizeSupplierUrlOrigin(rawSupplier);
    const derivedName = deriveSupplierNameFromUrl(rawSupplier);
    return (
      pickBestMatchingOption(rawSupplier.replace(/^https?:\/\//i, '').replace(/^www\./i, ''), options)
      || pickBestMatchingOption(derivedName, options)
      || origin
    );
  }
  return (
    pickBestMatchingOption(rawSupplier, options)
    || pickBestMatchingOption(materialName, options)
    || (isCleanSupplierName(rawSupplier) ? rawSupplier : '')
  );
}

function resolveSubsection(params: {
  rawSubsection: string;
  materialName: string;
  resolvedCategory: string;
  options: OptionSets;
}): string {
  const { rawSubsection, materialName, resolvedCategory, options } = params;
  const scopedOptions = resolvedCategory && Array.isArray(options.categorySubsections[resolvedCategory]) && options.categorySubsections[resolvedCategory].length > 0
    ? options.categorySubsections[resolvedCategory]
    : options.subsections;
  if (scopedOptions.length === 0) return '';
  return pickBestMatchingOption(rawSubsection, scopedOptions) || pickBestMatchingOption(materialName, scopedOptions);
}

function normalizeMaterialPayload(input: Record<string, unknown>) {
  const prijsExcl = normalizeNumber(input.prijs_excl_btw);
  const prijsIncl = normalizeNumber(input.prijs_incl_btw);
  return {
    materiaalnaam: safeString(input.materiaalnaam),
    eenheid: normalizeUnit(input.eenheid),
    prijs_excl_btw: prijsExcl,
    prijs_incl_btw: prijsIncl,
    lengte: safeString(input.lengte),
    breedte: safeString(input.breedte),
    hoogte: safeString(input.hoogte),
    dikte: safeString(input.dikte),
    categorie: safeString(input.categorie),
    subsectie: safeString(input.subsectie),
    leverancier: safeString(input.leverancier),
    confidence: normalizeConfidence(input.confidence),
  };
}

function enforceOptions(material: ReturnType<typeof normalizeMaterialPayload>, options: OptionSets) {
  const resolvedCategory = pickBestMatchingOption(
    material.categorie || options.activeCategory,
    options.categories
  ) || pickBestMatchingOption(options.activeCategory, options.categories);

  const resolvedSubsection = resolveSubsection({
    rawSubsection: material.subsectie,
    materialName: material.materiaalnaam,
    resolvedCategory,
    options,
  });

  const resolvedSupplier = resolveSupplier(
    material.leverancier,
    material.materiaalnaam,
    options.suppliers
  );

  return {
    ...material,
    categorie: resolvedCategory,
    subsectie: resolvedSubsection,
    leverancier: resolvedSupplier,
  };
}

async function callOpenAiExtraction(params: {
  apiKey: string;
  imageDataUrl: string;
  options: OptionSets;
  model?: string;
  extraRules?: string;
  timeoutMs?: number;
}): Promise<Record<string, unknown>> {
  const model = params.model || OPENAI_MODEL;
  const timeoutMs = params.timeoutMs ?? OPENAI_EXTRACTION_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: buildExtractionPrompt(params.options, params.extraRules),
              },
              { type: 'input_image', image_url: params.imageDataUrl },
            ],
          },
        ],
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`OpenAI analyse duurde te lang (${Math.round(timeoutMs / 1000)}s).`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

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

    const material = enforceOptions(normalizeMaterialPayload(extracted), options);

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
