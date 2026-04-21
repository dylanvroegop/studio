/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parsePriceToNumber } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPENAI_MODEL = 'gpt-5.1';
const DEFAULT_COLUMNS = [
  'gebruikerid',
  'materiaalnaam',
  'eenheid',
  'prijs_excl_btw',
  'prijs_incl_btw',
  'categorie',
  'sub_categorie',
  'leverancier',
  'lengte',
  'breedte',
  'dikte',
  'hoogte',
  'ai_extra_data',
];

type RawImportMaterial = {
  materiaalnaam?: unknown;
  eenheid?: unknown;
  prijs_excl_btw?: unknown;
  prijs_incl_btw?: unknown;
  categorie?: unknown;
  sub_categorie?: unknown;
  leverancier?: unknown;
  lengte?: unknown;
  breedte?: unknown;
  dikte?: unknown;
  hoogte?: unknown;
  source_url?: unknown;
  source_product_id?: unknown;
  unit_price_text?: unknown;
  bulk_price_text?: unknown;
  confidence?: unknown;
};

type CanonicalMaterial = {
  materiaalnaam: string;
  eenheid: string;
  prijs_excl_btw: number | null;
  prijs_incl_btw: number | null;
  categorie: string;
  sub_categorie: string;
  leverancier: string;
  lengte: string;
  breedte: string;
  dikte: string;
  hoogte: string;
  source_url: string;
  source_product_id: string;
  unit_price_text: string;
  bulk_price_text: string;
  confidence: number | null;
};

type AiMappedRow = {
  index?: number;
  mapped?: Record<string, unknown>;
  confidence?: number;
  issues?: string[];
};

type AiMappingPayload = {
  rows?: AiMappedRow[];
};

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function roundToCents(value: number): number {
  return Number(value.toFixed(2));
}

function normalizeUnit(value: unknown): string {
  const normalized = safeString(value).toLowerCase();
  if (!normalized) return 'stuk';
  if (normalized.includes('m2') || normalized.includes('m²')) return 'p/m2';
  if (normalized.includes('m1') || normalized === 'm' || normalized === 'p/m') return 'p/m1';
  if (normalized.includes('stuk') || normalized === 'st') return 'stuk';
  if (normalized.includes('doos')) return 'doos';
  if (normalized.includes('set')) return 'set';
  if (normalized.includes('pak')) return 'pak';
  return normalized;
}

function normalizeCanonicalRow(input: RawImportMaterial): CanonicalMaterial | null {
  const materiaalnaam = safeString(input.materiaalnaam);
  if (!materiaalnaam) return null;

  const prijsExcl = parsePriceToNumber(input.prijs_excl_btw);
  const prijsInclRaw = parsePriceToNumber(input.prijs_incl_btw);
  const prijsIncl = prijsInclRaw ?? (prijsExcl == null ? null : roundToCents(prijsExcl * 1.21));

  return {
    materiaalnaam,
    eenheid: normalizeUnit(input.eenheid),
    prijs_excl_btw: prijsExcl,
    prijs_incl_btw: prijsIncl,
    categorie: safeString(input.categorie),
    sub_categorie: safeString(input.sub_categorie),
    leverancier: safeString(input.leverancier) || 'Bouwmaat',
    lengte: safeString(input.lengte),
    breedte: safeString(input.breedte),
    dikte: safeString(input.dikte),
    hoogte: safeString(input.hoogte),
    source_url: safeString(input.source_url),
    source_product_id: safeString(input.source_product_id),
    unit_price_text: safeString(input.unit_price_text),
    bulk_price_text: safeString(input.bulk_price_text),
    confidence: typeof input.confidence === 'number' && Number.isFinite(input.confidence) ? input.confidence : null,
  };
}

function parseJsonLoose<T>(text: string): T | null {
  const raw = text.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || raw;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const root = payload as Record<string, unknown>;
  const outputText = root.output_text;
  if (typeof outputText === 'string' && outputText.trim()) return outputText.trim();
  const output = Array.isArray(root.output) ? root.output : [];
  const chunks: string[] = [];
  output.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const content = Array.isArray((entry as Record<string, unknown>).content)
      ? (entry as Record<string, unknown>).content as Array<Record<string, unknown>>
      : [];
    content.forEach((part) => {
      const text = part?.text;
      if (typeof text === 'string' && text.trim()) chunks.push(text.trim());
    });
  });
  return chunks.join('\n').trim();
}

async function getTableColumns(): Promise<Set<string>> {
  const response = await supabaseAdmin
    .from('main_material_list')
    .select('*')
    .limit(1);

  if (response.error) {
    return new Set(DEFAULT_COLUMNS);
  }
  const firstRow = Array.isArray(response.data) ? response.data[0] : null;
  if (!firstRow || typeof firstRow !== 'object') {
    return new Set(DEFAULT_COLUMNS);
  }
  return new Set(Object.keys(firstRow));
}

async function runAiMapper(rows: CanonicalMaterial[], tableColumns: string[]): Promise<Map<number, AiMappedRow>> {
  const apiKey = safeString(process.env.OPENAI_API_KEY);
  if (!apiKey || rows.length === 0) return new Map();

  const payloadRows = rows.map((row, index) => ({
    index,
    ...row,
  }));

  const prompt = [
    'Map deze productregels naar de kolommen van Supabase tabel main_material_list.',
    'Geef alleen JSON terug.',
    `Beschikbare kolommen: ${JSON.stringify(tableColumns)}`,
    'Regels:',
    '1) Gebruik alleen velden die logisch zijn voor deze tabel.',
    '2) prijs_excl_btw moet EXCL btw zijn.',
    '3) prijs_incl_btw moet 21% boven prijs_excl_btw zijn (afgerond op 2 decimalen).',
    '4) Vul lengte/breedte/dikte/hoogte wanneer afleidbaar.',
    '5) Laat onzekere velden leeg.',
    'Output formaat:',
    '{"rows":[{"index":0,"mapped":{"materiaalnaam":"...","eenheid":"...","prijs_excl_btw":1.23,"prijs_incl_btw":1.49,"categorie":"...","sub_categorie":"...","leverancier":"...","lengte":"...","breedte":"...","dikte":"...","hoogte":"..."},"confidence":0.9,"issues":["..."]}]}',
    `Input rows: ${JSON.stringify(payloadRows)}`,
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
      input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) return new Map();
  const text = extractResponseText(json);
  if (!text) return new Map();
  const parsed = parseJsonLoose<AiMappingPayload>(text);
  if (!parsed || !Array.isArray(parsed.rows)) return new Map();

  const result = new Map<number, AiMappedRow>();
  parsed.rows.forEach((row) => {
    if (typeof row.index !== 'number' || !Number.isFinite(row.index)) return;
    result.set(row.index, row);
  });
  return result;
}

function parseDimensionToMeters(value: string): number | null {
  const raw = safeString(value).toLowerCase();
  if (!raw) return null;
  const match = raw.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const number = Number.parseFloat(match[1].replace(',', '.'));
  if (!Number.isFinite(number) || number <= 0) return null;
  if (raw.includes('mm')) return number / 1000;
  if (raw.includes('cm')) return number / 100;
  if (raw.includes('m')) return number;
  return null;
}

function calculateTotalExcl(params: {
  eenheid: string;
  prijsExcl: number | null;
  lengte: string;
  breedte: string;
}): number | null {
  const { eenheid, prijsExcl, lengte, breedte } = params;
  if (prijsExcl == null) return null;
  if (eenheid === 'p/m2') {
    const l = parseDimensionToMeters(lengte);
    const b = parseDimensionToMeters(breedte);
    if (l == null || b == null) return null;
    return roundToCents(prijsExcl * l * b);
  }
  if (eenheid === 'p/m1') {
    const l = parseDimensionToMeters(lengte);
    if (l == null) return null;
    return roundToCents(prijsExcl * l);
  }
  return roundToCents(prijsExcl);
}

function buildValidatedPayload(params: {
  uid: string;
  source: CanonicalMaterial;
  aiRow: AiMappedRow | undefined;
  tableColumns: Set<string>;
}): { payload: Record<string, unknown> | null; issues: string[] } {
  const { uid, source, aiRow, tableColumns } = params;
  const mapped = aiRow?.mapped && typeof aiRow.mapped === 'object' ? aiRow.mapped : {};
  const pick = (key: keyof CanonicalMaterial): unknown => (mapped as Record<string, unknown>)[key] ?? source[key];

  const materiaalnaam = safeString((mapped as Record<string, unknown>).materiaalnaam ?? source.materiaalnaam);
  const eenheid = normalizeUnit((mapped as Record<string, unknown>).eenheid ?? source.eenheid);
  const prijsExcl = parsePriceToNumber((mapped as Record<string, unknown>).prijs_excl_btw ?? source.prijs_excl_btw);
  const prijsInclRaw = parsePriceToNumber((mapped as Record<string, unknown>).prijs_incl_btw ?? source.prijs_incl_btw);
  const prijsIncl = prijsExcl == null ? null : (prijsInclRaw ?? roundToCents(prijsExcl * 1.21));

  const lengte = safeString((mapped as Record<string, unknown>).lengte ?? source.lengte);
  const breedte = safeString((mapped as Record<string, unknown>).breedte ?? source.breedte);
  const dikte = safeString((mapped as Record<string, unknown>).dikte ?? source.dikte);
  const hoogte = safeString((mapped as Record<string, unknown>).hoogte ?? source.hoogte);
  const categorie = safeString((mapped as Record<string, unknown>).categorie ?? source.categorie);
  const subCategorie = safeString((mapped as Record<string, unknown>).sub_categorie ?? source.sub_categorie);
  const leverancier = safeString((mapped as Record<string, unknown>).leverancier ?? source.leverancier) || 'Bouwmaat';

  const issues = [...(Array.isArray(aiRow?.issues) ? aiRow?.issues : [])].filter((item): item is string => typeof item === 'string');
  if (!materiaalnaam) issues.push('materiaalnaam ontbreekt');
  if (prijsExcl == null) issues.push('prijs_excl_btw ontbreekt');
  if (/\(\s*\d+\s*\)\s*$/.test(materiaalnaam)) issues.push('materiaalnaam lijkt categorie-tile');

  if (!materiaalnaam || prijsExcl == null) {
    return { payload: null, issues };
  }

  const totalExcl = calculateTotalExcl({
    eenheid,
    prijsExcl,
    lengte,
    breedte,
  });
  const totalIncl = totalExcl == null ? null : roundToCents(totalExcl * 1.21);

  const payload: Record<string, unknown> = {};
  const setIfAllowed = (key: string, value: unknown) => {
    if (tableColumns.has(key)) payload[key] = value;
  };

  setIfAllowed('gebruikerid', uid);
  setIfAllowed('materiaalnaam', materiaalnaam);
  setIfAllowed('eenheid', eenheid);
  setIfAllowed('prijs_excl_btw', prijsExcl);
  setIfAllowed('prijs_incl_btw', prijsIncl);
  if (categorie) setIfAllowed('categorie', categorie);
  if (subCategorie) setIfAllowed('sub_categorie', subCategorie);
  if (leverancier) setIfAllowed('leverancier', leverancier);
  if (lengte) setIfAllowed('lengte', lengte);
  if (breedte) setIfAllowed('breedte', breedte);
  if (dikte) setIfAllowed('dikte', dikte);
  if (hoogte) setIfAllowed('hoogte', hoogte);

  setIfAllowed('ai_extra_data', {
    source: 'bouwmaat_authenticated_scraper',
    source_url: source.source_url,
    source_product_id: source.source_product_id,
    unit_price_text: source.unit_price_text,
    bulk_price_text: source.bulk_price_text,
    mapping_confidence: typeof aiRow?.confidence === 'number' ? aiRow.confidence : source.confidence,
    mapping_issues: issues,
    calculated_total_excl_btw: totalExcl,
    calculated_total_incl_btw: totalIncl,
    imported_at: new Date().toISOString(),
  });

  return { payload, issues };
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Niet ingelogd.' }, { status: 401 });
    }

    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token).catch(() => null);
    const uid = decoded?.uid || '';
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Niet ingelogd.' }, { status: 401 });
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const body = await request.json().catch(() => ({}));
    const rawMaterials = Array.isArray(body?.materials) ? body.materials.slice(0, 1200) : [];
    const canonicalRows = rawMaterials
      .map((entry: unknown) => normalizeCanonicalRow(entry as RawImportMaterial))
      .filter((entry: CanonicalMaterial | null): entry is CanonicalMaterial => Boolean(entry));

    if (canonicalRows.length === 0) {
      return NextResponse.json({ ok: false, message: 'Geen geldige materialen om te importeren.' }, { status: 400 });
    }

    const tableColumns = await getTableColumns();
    const aiMappedRows = await runAiMapper(canonicalRows, [...tableColumns]).catch(() => new Map<number, AiMappedRow>());

    const materialPayloads: Array<{ payload: Record<string, unknown>; issues: string[] }> = [];
    const rejected: Array<{ materiaalnaam: string; message: string }> = [];

    canonicalRows.forEach((row: CanonicalMaterial, index: number) => {
      const aiRow = aiMappedRows.get(index);
      const validated = buildValidatedPayload({
        uid,
        source: row,
        aiRow,
        tableColumns,
      });
      if (!validated.payload) {
        rejected.push({
          materiaalnaam: row.materiaalnaam,
          message: validated.issues.join('; ') || 'Mapping/validatie mislukt',
        });
        return;
      }
      materialPayloads.push(validated as { payload: Record<string, unknown>; issues: string[] });
    });

    if (materialPayloads.length === 0) {
      return NextResponse.json({
        ok: false,
        message: 'Alle regels afgekeurd door mapping/validatie.',
        rejected,
      }, { status: 422 });
    }

    let inserted = 0;
    let updated = 0;
    const skipped: Array<{ materiaalnaam: string; message: string }> = [...rejected];

    for (const entry of materialPayloads) {
      const material = entry.payload;
      const naam = safeString(material.materiaalnaam);
      if (!naam) {
        skipped.push({ materiaalnaam: '', message: 'Lege materiaalnaam na mapping' });
        continue;
      }

      const existing = await supabaseAdmin
        .from('main_material_list')
        .select('row_id')
        .eq('gebruikerid', uid)
        .eq('materiaalnaam', naam)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing.error) {
        skipped.push({ materiaalnaam: naam, message: existing.error.message });
        continue;
      }

      if (existing.data?.row_id) {
        const update = await supabaseAdmin
          .from('main_material_list')
          .update(material)
          .eq('gebruikerid', uid)
          .eq('row_id', existing.data.row_id)
          .select('row_id')
          .maybeSingle();

        if (update.error) {
          skipped.push({ materiaalnaam: naam, message: update.error.message });
          continue;
        }
        updated += 1;
      } else {
        const insert = await supabaseAdmin
          .from('main_material_list')
          .insert(material)
          .select('row_id')
          .single();

        if (insert.error) {
          skipped.push({ materiaalnaam: naam, message: insert.error.message });
          continue;
        }
        inserted += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      inserted,
      updated,
      skipped,
      total: materialPayloads.length,
      mapped_with_ai: aiMappedRows.size,
      schema_columns_detected: [...tableColumns],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bulk import mislukt.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
