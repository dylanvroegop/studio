import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { parseMessyMaterialQuickAdd, type ParsedMaterialLine } from '@/lib/material-lists';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPENAI_MODEL = process.env.OPENAI_MATERIAL_LIST_PARSER_MODEL || 'gpt-5.2';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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
      const record = part as Record<string, unknown>;
      const text = safeString(record.text);
      if (text) chunks.push(text);
    });
  });
  return chunks.join('\n').trim();
}

function parseJsonLoose<T>(value: string): T | null {
  const text = value.trim();
  const candidates = [
    text,
    text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim(),
  ];
  const firstCurly = text.indexOf('{');
  const lastCurly = text.lastIndexOf('}');
  if (firstCurly !== -1 && lastCurly > firstCurly) {
    candidates.push(text.slice(firstCurly, lastCurly + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Continue with the next candidate.
    }
  }
  return null;
}

function sanitizeRows(rows: unknown): ParsedMaterialLine[] {
  if (!Array.isArray(rows)) return [];
  const result: ParsedMaterialLine[] = [];
  rows.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      const record = row as Record<string, unknown>;
      const quantity = typeof record.quantity === 'number'
        ? record.quantity
        : Number(String(record.quantity ?? '').replace(',', '.'));
      const productName = safeString(record.product_name);
      if (!productName) return;
      result.push({
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unit: safeString(record.unit) || 'st',
        product_name: productName,
        supplier: safeString(record.supplier),
        category: safeString(record.category),
        notes: safeString(record.notes),
      });
    });
  return result;
}

function buildPrompt(input: string): string {
  return [
    'Je bent een Nederlandse bouwmateriaal-parser voor een praktische inkooplijst.',
    'Zet rommelige tekst om naar materiaalregels.',
    '',
    'Regels:',
    '- Geef ALLEEN JSON terug.',
    '- Splits meerdere materialen in meerdere regels, ook als ze in een zin staan.',
    '- Corrigeer duidelijke typefouten en afkortingen licht, maar verzin geen extra producten.',
    '- quantity is een getal.',
    '- unit is kort: st, m, m2, m3, kg, l, zak, pak, rol, doos, bus, tube, emmer.',
    '- product_name bevat het materiaal met maten/type, maar niet het aantal of de eenheid.',
    '- supplier alleen invullen als duidelijk genoemd, zoals BMN, PontMeyer, Bouwmaat.',
    '- category alleen invullen als logisch en duidelijk, zoals Gipsplaten, Profielen, Plaatmateriaal, Afwerking, Bevestiging.',
    '- notes alleen voor echte extra opmerkingen uit de input.',
    '',
    'Output formaat:',
    '{"items":[{"quantity":15,"unit":"st","product_name":"Gipsplaat AK2 600x2600mm","supplier":"BMN","category":"Gipsplaten","notes":""}]}',
    '',
    `Input: ${input}`,
  ].join('\n');
}

async function parseWithOpenAi(input: string): Promise<ParsedMaterialLine[]> {
  const apiKey = safeString(process.env.OPENAI_API_KEY);
  if (!apiKey) return [];

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: buildPrompt(input) }],
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return [];
  const outputText = extractResponseText(payload);
  if (!outputText) return [];
  const parsed = parseJsonLoose<{ items?: unknown }>(outputText);
  return sanitizeRows(parsed?.items);
}

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => null) as { input?: unknown } | null;
  const input = safeString(body?.input);
  if (!input) {
    return NextResponse.json({ ok: false, message: 'Geen tekst opgegeven.' }, { status: 400 });
  }

  const aiItems = await parseWithOpenAi(input).catch(() => []);
  const items = aiItems.length > 0 ? aiItems : parseMessyMaterialQuickAdd(input);

  return NextResponse.json({
    ok: true,
    source: aiItems.length > 0 ? 'ai' : 'fallback',
    items,
  });
}
