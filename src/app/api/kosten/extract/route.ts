import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import {
  extractOfferteReference,
  inferProjectCostCategory,
  normalizeProjectCostLineItems,
  normalizeProjectCostLineItem,
  roundEuro,
  sumProjectCostLineItems,
} from '@/lib/project-costs';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXTRACTION_PROMPT =
  'You are an expert at extracting data from Dutch supplier invoices and receipts for construction/carpentry materials. Extract: supplier_name, date (YYYY-MM-DD), line_items (array of {description, quantity, unit, unit_price, total_price}), subtotal_excl_btw, btw_percentage, btw_amount, total_incl_btw, and any project/offerte reference number. Return ONLY valid JSON, no markdown.';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeDate(input: unknown): string {
  const raw = safeString(input);
  if (!raw) return new Date().toISOString().slice(0, 10);
  const datePart = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

function sanitizeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function looksLikePdf(contentType: string, filename: string): boolean {
  return contentType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
}

function isBucketNotFoundError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('bucket not found') || lower.includes('bucket') && lower.includes('not found');
}

async function ensureReceiptsBucketExists(): Promise<void> {
  const create = await supabaseAdmin.storage.createBucket('receipts', {
    public: true,
    fileSizeLimit: 15728640,
    allowedMimeTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
    ],
  });

  if (!create.error) return;
  const message = safeString(create.error.message);
  if (message.toLowerCase().includes('already exists')) return;
  throw new Error(message || 'Kon receipts-bucket niet aanmaken.');
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
  if (chunks.length > 0) return chunks.join('\n');

  const fallbackChoices = Array.isArray(row.choices) ? row.choices : [];
  const fallback = fallbackChoices[0];
  if (fallback && typeof fallback === 'object') {
    const message = (fallback as { message?: { content?: unknown } }).message;
    const content = safeString(message?.content);
    if (content) return content;
  }

  return '';
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

async function uploadFileToOpenAi(params: {
  apiKey: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
}): Promise<string> {
  const form = new FormData();
  form.append('purpose', 'user_data');
  form.append(
    'file',
    new Blob([params.bytes], { type: params.contentType || 'application/octet-stream' }),
    params.filename
  );

  const response = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: form,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = safeString((payload as { error?: { message?: unknown } }).error?.message) || 'OpenAI file upload mislukt.';
    throw new Error(message);
  }

  const fileId = safeString((payload as { id?: unknown }).id);
  if (!fileId) {
    throw new Error('OpenAI gaf geen file-id terug.');
  }
  return fileId;
}

async function deleteOpenAiFile(apiKey: string, fileId: string): Promise<void> {
  await fetch(`https://api.openai.com/v1/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  }).catch(() => null);
}

async function callOpenAiExtraction(params: {
  apiKey: string;
  model: string;
  prompt: string;
  imageDataUrl?: string;
  fileId?: string;
}): Promise<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [
    { type: 'input_text', text: params.prompt },
  ];

  if (params.imageDataUrl) {
    content.push({ type: 'input_image', image_url: params.imageDataUrl });
  } else if (params.fileId) {
    content.push({ type: 'input_file', file_id: params.fileId });
  } else {
    throw new Error('Geen bronbestand om te analyseren.');
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model,
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
    const sourceFile = formData.get('file');
    if (!(sourceFile instanceof File)) {
      return NextResponse.json({ ok: false, message: 'Bestand ontbreekt.' }, { status: 400 });
    }

    const contentType = safeString(sourceFile.type) || 'application/octet-stream';
    const filename = sanitizeFilename(sourceFile.name || `receipt-${Date.now()}`);
    const isPdf = looksLikePdf(contentType, filename);
    const isImage = contentType.startsWith('image/');
    if (!isPdf && !isImage) {
      return NextResponse.json({ ok: false, message: 'Alleen PDF of afbeelding is toegestaan.' }, { status: 400 });
    }

    const bytes = Buffer.from(await sourceFile.arrayBuffer());
    const storagePath = `${uid}/${Date.now()}-${filename || 'receipt'}`;

    let upload = await supabaseAdmin
      .storage
      .from('receipts')
      .upload(storagePath, bytes, {
        contentType,
        upsert: false,
      });

    if (upload.error && isBucketNotFoundError(upload.error.message)) {
      await ensureReceiptsBucketExists();
      upload = await supabaseAdmin
        .storage
        .from('receipts')
        .upload(storagePath, bytes, {
          contentType,
          upsert: false,
        });
    }

    if (upload.error) {
      return NextResponse.json({ ok: false, message: upload.error.message }, { status: 500 });
    }

    const publicUrlData = supabaseAdmin.storage.from('receipts').getPublicUrl(storagePath);
    const receiptUrl = safeString(publicUrlData.data?.publicUrl) || storagePath;

    const model = safeString(process.env.OPENAI_RECEIPTS_MODEL) || 'gpt-4o';

    let parsedExtraction: Record<string, unknown>;
    if (isPdf) {
      const fileId = await uploadFileToOpenAi({
        apiKey,
        filename,
        contentType,
        bytes,
      });
      try {
        parsedExtraction = await callOpenAiExtraction({
          apiKey,
          model,
          prompt: EXTRACTION_PROMPT,
          fileId,
        });
      } finally {
        await deleteOpenAiFile(apiKey, fileId);
      }
    } else {
      const dataUrl = `data:${contentType};base64,${bytes.toString('base64')}`;
      parsedExtraction = await callOpenAiExtraction({
        apiKey,
        model,
        prompt: EXTRACTION_PROMPT,
        imageDataUrl: dataUrl,
      });
    }

    const lineItems = normalizeProjectCostLineItems(parsedExtraction.line_items);
    const lineItemsFallback = Array.isArray(parsedExtraction.items)
      ? normalizeProjectCostLineItems(parsedExtraction.items)
      : [];
    const normalizedLineItems = lineItems.length > 0 ? lineItems : lineItemsFallback;

    if (normalizedLineItems.length === 0) {
      const fallbackDescription = safeString(parsedExtraction.description) || 'Factuurregel';
      const fallbackQuantity = Math.max(1, safeNumber(parsedExtraction.quantity) || 1);
      const fallbackUnitPrice = Math.max(0, safeNumber(parsedExtraction.unit_price) || safeNumber(parsedExtraction.subtotal_excl_btw));
      normalizedLineItems.push(
        normalizeProjectCostLineItem({
          description: fallbackDescription,
          quantity: fallbackQuantity,
          unit: safeString(parsedExtraction.unit) || 'st',
          unit_price: fallbackUnitPrice,
        })
      );
    }

    const subtotalExcl =
      roundEuro(safeNumber(parsedExtraction.subtotal_excl_btw))
      || roundEuro(safeNumber(parsedExtraction.amount_excl_btw))
      || sumProjectCostLineItems(normalizedLineItems);

    const btwPercentage =
      roundEuro(safeNumber(parsedExtraction.btw_percentage))
      || roundEuro(safeNumber(parsedExtraction.vat_percentage))
      || 21;
    const btwAmount =
      roundEuro(safeNumber(parsedExtraction.btw_amount))
      || roundEuro(safeNumber(parsedExtraction.vat_amount))
      || roundEuro((subtotalExcl * btwPercentage) / 100);
    const totalIncl =
      roundEuro(safeNumber(parsedExtraction.total_incl_btw))
      || roundEuro(safeNumber(parsedExtraction.amount_incl_btw))
      || roundEuro(subtotalExcl + btwAmount);

    const supplierName =
      safeString(parsedExtraction.supplier_name)
      || safeString(parsedExtraction.supplier)
      || safeString(parsedExtraction.vendor_name)
      || 'Onbekende leverancier';
    const description =
      safeString(parsedExtraction.description)
      || normalizedLineItems[0]?.description
      || 'Inkomende kost';
    const extractedDate = normalizeDate(parsedExtraction.date);

    const offerteReference = extractOfferteReference(
      parsedExtraction.offerte_reference
      || parsedExtraction.project_reference
      || parsedExtraction.reference
      || parsedExtraction.reference_number
      || parsedExtraction.offerte_nummer
    );

    const suggestedCategory = inferProjectCostCategory({
      supplierName,
      description,
      lineItems: normalizedLineItems,
    });

    return NextResponse.json({
      ok: true,
      data: {
        supplier_name: supplierName,
        description,
        line_items: normalizedLineItems,
        amount_excl_btw: subtotalExcl,
        btw_percentage: btwPercentage,
        btw_amount: btwAmount,
        amount_incl_btw: totalIncl,
        date: extractedDate,
        offerte_reference: offerteReference,
        suggested_category: suggestedCategory,
        receipt_url: receiptUrl,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Extractie mislukt.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
