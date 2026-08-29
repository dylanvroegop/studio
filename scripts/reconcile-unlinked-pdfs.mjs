#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';

const USER_ID = 'C29EkAPLJzQSQgv7nwm6Uwj6agv2';
const BUCKET = 'tax-documents';
const CACHE_PATH = '/tmp/calvora-unlinked-pdf-extractions.json';
const APPLY = process.argv.includes('--apply');
const REFRESH = process.argv.includes('--refresh');
const RECONCILE_LINKED = process.argv.includes('--reconcile-linked');
const APP_BASE_URL = process.env.CALVORA_APP_URL || 'https://app.calvora.nl';

const requiredEnvironment = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'N8N_HEADER_SECRET',
];

for (const name of requiredEnvironment) {
  if (!process.env[name]) throw new Error(`${name} ontbreekt.`);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}
const firestore = getFirestore();

const EXTRACTION_PROMPT = `You extract bookkeeping data from Dutch supplier invoices and receipts.

HIGHEST PRIORITY — PROJECT/OFFERTE REFERENCE:
Before all other fields, inspect every page and all order-information rows for labels Referentie, Uw referentie, Klantreferentie, Memo, Project, Projectnummer, Offerte or Offertenummer. Read the value directly right of, below, or on the same row as the label. For Bouwmaat, "Referentie 260347" and "Memo: 260313" are customer quote numbers. A visible labelled 5-8 digit value must be returned as offerte_reference. Never use invoice/factuurnummer, debiteurnummer, bonnummer, pakbonnummer, order/bestelnummer, article number, barcode, POI, terminal, transaction, dates or totals as offerte_reference. Return null only after a second inspection of these labelled rows.

Return ONLY valid JSON with:
supplier_name, date (YYYY-MM-DD), receipt_description, document_type (invoice|receipt|credit_note|purchase_proof|supplier_cost_document|other), supplier_invoice_number, payment_type (bon|factuur|unknown), payment_status (paid|openstaand|unknown), due_date (YYYY-MM-DD|null), reconciliation_group_id (string|null), offerte_reference (string|null), reference_candidates (array of {label,value,context}), line_items (array of {description,quantity,unit,unit_price,total_price,total_incl_btw,btw_percentage,category}), subtotal_excl_btw, btw_percentage, btw_amount, total_incl_btw.

line_items.category must be one of materiaal, autokosten, boetes, schulden, afval, gereedschap, brandstof, hotel, telefoon, leadkosten, overig. Construction materials and consumables => materiaal; reusable tools => gereedschap; fuel/charging => brandstof; vehicle costs => autokosten; fines => boetes; debt repayments => schulden; waste/container/disposal => afval. Bouwmaat temporary transport and fuel surcharges => materiaal. Preserve printed discounts, deposits, multiple VAT rates and negative credit-note signs. total_price is EXCL. VAT. Printed totals take precedence. Validate total_incl_btw = subtotal_excl_btw + btw_amount.`;

const REFERENCE_PROMPT = `Inspect every page only for the customer's project/offerte number. Return ONLY JSON: {"offerte_reference":string|null,"reference_candidates":[{"label":string,"value":string|null,"context":string}]}. Valid labels: Referentie, Uw referentie, Klantreferentie, Memo, Project, Projectnummer, Offerte, Offertenummer. For Bouwmaat, a row "Referentie 260347" means 260347 and "Memo: 260313" means 260313. Read the same row and immediately adjacent text twice before returning null. Reject invoice/factuurnummer, debtor, bon, pakbon, order, article, barcode, transaction, date and total numbers.`;

function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNumber(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function normalizeReference(value) {
  if (value == null) return null;
  const text = String(value).trim();
  const labelled = text.match(/(?:referentie|memo|project(?:nummer)?|offerte(?:nummer)?)\s*[:#-]?\s*(\d{5,8})\b/i);
  if (labelled) return labelled[1];
  const standalone = text.match(/^#?\s*(\d{5,8})\s*$/);
  return standalone?.[1] || null;
}

function resolveReference(extraction) {
  const direct = normalizeReference(extraction.offerte_reference);
  if (direct) return direct;
  for (const candidate of Array.isArray(extraction.reference_candidates) ? extraction.reference_candidates : []) {
    if (!candidate || typeof candidate !== 'object') continue;
    const label = safeString(candidate.label);
    if (!/(referentie|memo|project|offerte)/i.test(label)) continue;
    const fromValue = normalizeReference(candidate.value);
    if (fromValue) return fromValue;
    const fromContext = normalizeReference(`${label} ${safeString(candidate.context)}`);
    if (fromContext) return fromContext;
  }
  return null;
}

function responseText(payload) {
  if (safeString(payload.output_text)) return payload.output_text;
  for (const output of Array.isArray(payload.output) ? payload.output : []) {
    for (const content of Array.isArray(output?.content) ? output.content : []) {
      if (safeString(content?.text)) return content.text;
    }
  }
  return '';
}

function parseJson(text) {
  const clean = safeString(text).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(clean); } catch {}
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
  throw new Error('OpenAI gaf geen geldige JSON terug.');
}

async function uploadOpenAiFile(archive, bytes) {
  const form = new FormData();
  form.append('purpose', 'user_data');
  form.append('file', new Blob([bytes], { type: archive.content_type || 'application/pdf' }), archive.original_filename);
  const response = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  const payload = await response.json();
  if (!response.ok || !payload.id) throw new Error(payload?.error?.message || 'OpenAI upload mislukt.');
  return payload.id;
}

async function callOpenAi(fileId, prompt) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_RECEIPTS_MODEL || 'gpt-5.2',
      temperature: 0,
      input: [{ role: 'user', content: [{ type: 'input_file', file_id: fileId }, { type: 'input_text', text: prompt }] }],
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || 'OpenAI analyse mislukt.');
  return parseJson(responseText(payload));
}

async function extractArchive(archive) {
  const download = await supabase.storage.from(archive.bucket || BUCKET).download(archive.storage_path);
  if (download.error || !download.data) throw new Error(download.error?.message || 'Download mislukt.');
  const bytes = await download.data.arrayBuffer();
  const fileId = await uploadOpenAiFile(archive, bytes);
  try {
    let extraction = await callOpenAi(fileId, EXTRACTION_PROMPT);
    if (!resolveReference(extraction)) {
      try {
        const reference = await callOpenAi(fileId, REFERENCE_PROMPT);
        extraction = { ...extraction, ...reference };
      } catch (error) {
        console.warn(`Referentiecontrole mislukt voor ${archive.original_filename}: ${error.message}`);
      }
    }
    extraction.offerte_reference = resolveReference(extraction);
    return extraction;
  } finally {
    await fetch(`https://api.openai.com/v1/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    }).catch(() => null);
  }
}

function normalizeSupplier(value) {
  return safeString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(b\.?v\.?|nl|nederland|dsg|derdengelden)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function suppliersMatch(left, right) {
  const a = normalizeSupplier(left);
  const b = normalizeSupplier(right);
  if (!a || !b) return false;
  if (a.includes('bouwmaat') && b.includes('bouwmaat')) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const aTokens = new Set(a.split(' ').filter((token) => token.length >= 5));
  return b.split(' ').some((token) => token.length >= 5 && aTokens.has(token));
}

function extractionAmounts(extraction) {
  let subtotal = safeNumber(extraction.subtotal_excl_btw ?? extraction.amount_excl_btw);
  let vat = safeNumber(extraction.btw_amount ?? extraction.vat_amount);
  let total = safeNumber(extraction.total_incl_btw ?? extraction.amount_incl_btw ?? extraction.total);
  if (!subtotal && total && vat) subtotal = safeNumber(total - vat);
  if (!total && subtotal) total = safeNumber(subtotal + vat);
  if (!vat && total && subtotal) vat = safeNumber(total - subtotal);
  return { subtotal, vat, total };
}

function lineItems(extraction) {
  const allowed = new Set(['materiaal', 'autokosten', 'boetes', 'schulden', 'afval', 'gereedschap', 'brandstof', 'hotel', 'telefoon', 'leadkosten', 'overig']);
  return (Array.isArray(extraction.line_items) ? extraction.line_items : []).map((item) => ({
    description: safeString(item?.description) || 'Factuurregel',
    quantity: safeNumber(item?.quantity) || 1,
    unit: safeString(item?.unit) || 'st',
    unit_price: safeNumber(item?.unit_price),
    total_price: safeNumber(item?.total_price),
    total_incl_btw: safeNumber(item?.total_incl_btw),
    btw_percentage: safeNumber(item?.btw_percentage),
    category: allowed.has(safeString(item?.category).toLowerCase()) ? safeString(item.category).toLowerCase() : 'overig',
  }));
}

function inferredCategory(extraction) {
  return lineItems(extraction)[0]?.category || 'overig';
}

function candidateGroups(costs, archive, extraction) {
  const filename = archive.original_filename.toLowerCase();
  const invoiceNumber = safeString(extraction.supplier_invoice_number).toLowerCase();
  const exactIdentity = costs.filter((cost) =>
    safeString(cost.source_filename).toLowerCase() === filename
    || (invoiceNumber && safeString(cost.supplier_invoice_number).toLowerCase() === invoiceNumber)
  );
  if (exactIdentity.length) return [{ reason: 'document_identity', rows: exactIdentity }];

  const { total } = extractionAmounts(extraction);
  const date = safeString(extraction.date).slice(0, 10);
  const compatible = costs.filter((cost) =>
    safeString(cost.date).slice(0, 10) === date
    && suppliersMatch(cost.supplier_name, extraction.supplier_name)
  );

  const groups = [];
  for (const row of compatible) {
    if (Math.abs(safeNumber(row.amount_incl_btw) - total) <= 0.02) {
      groups.push({ reason: 'date_supplier_total', rows: [row] });
    }
  }

  const byMinute = new Map();
  for (const row of compatible) {
    const minute = safeString(row.created_at).slice(0, 16);
    const key = `${minute}|${normalizeSupplier(row.supplier_name)}`;
    const bucket = byMinute.get(key) || [];
    bucket.push(row);
    byMinute.set(key, bucket);
  }
  for (const rows of byMinute.values()) {
    if (rows.length < 2) continue;
    const sum = safeNumber(rows.reduce((value, row) => value + safeNumber(row.amount_incl_btw), 0));
    if (Math.abs(sum - total) <= 0.02) groups.push({ reason: 'split_group_total', rows });
  }

  const unique = new Map();
  for (const group of groups) unique.set(group.rows.map((row) => row.id).sort().join(','), group);
  return [...unique.values()];
}

async function resolveQuote(reference, quoteCache) {
  if (!reference) return null;
  if (quoteCache.has(reference)) return quoteCache.get(reference);
  const number = Number(reference);
  let result = null;
  for (const candidate of [number, String(number)]) {
    const snapshot = await firestore.collection('quotes')
      .where('userId', '==', USER_ID)
      .where('offerteNummer', '==', candidate)
      .limit(1)
      .get();
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      result = { id: doc.id, number: reference, client: safeString(doc.data().klantNaam || doc.data().clientName) };
      break;
    }
  }
  quoteCache.set(reference, result);
  return result;
}

async function receiptFile(archive) {
  const signed = await supabase.storage.from(archive.bucket || BUCKET).createSignedUrl(archive.storage_path, 86400);
  if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message || 'Signed URL mislukt.');
  return {
    url: signed.data.signedUrl,
    path: archive.storage_path,
    archive_id: archive.id,
    bucket: archive.bucket || BUCKET,
    filename: archive.original_filename,
    content_type: archive.content_type,
    size_bytes: archive.size_bytes,
    sha256: archive.sha256,
    uploaded_at: archive.archived_at,
  };
}

async function linkExisting(archive, extraction, group, quote) {
  const file = await receiptFile(archive);
  const costIds = [];
  for (const row of group.rows) {
    const files = Array.isArray(row.receipt_files) ? row.receipt_files : [];
    const nextFiles = files.some((item) => item?.archive_id === archive.id) ? files : [...files, file];
    const patch = {
      receipt_files: nextFiles,
      receipt_url: row.receipt_url || file.url,
      source_filename: row.source_filename || archive.original_filename,
      supplier_invoice_number: row.supplier_invoice_number || safeString(extraction.supplier_invoice_number) || null,
      updated_at: new Date().toISOString(),
    };
    if (!row.offerte_id && quote?.id) patch.offerte_id = quote.id;
    const update = await supabase.from('project_costs').update(patch).eq('id', row.id).eq('user_id', USER_ID);
    if (update.error) throw new Error(update.error.message);
    costIds.push(row.id);
  }
  const archiveUpdate = await supabase.from('cost_document_archives').update({
    linked_cost_ids: costIds,
    metadata: {
      ...(archive.metadata || {}),
      reconciliation: {
        action: 'linked_existing',
        reason: group.reason,
        reference: extraction.offerte_reference || null,
        processed_at: new Date().toISOString(),
      },
    },
  }).eq('id', archive.id).eq('user_id', USER_ID);
  if (archiveUpdate.error) throw new Error(archiveUpdate.error.message);
  return costIds;
}

async function createCost(archive, extraction) {
  const amounts = extractionAmounts(extraction);
  const file = await receiptFile(archive);
  const documentType = safeString(extraction.document_type).toLowerCase();
  let paymentType = safeString(extraction.payment_type).toLowerCase() || 'unknown';
  if (['invoice', 'credit_note'].includes(documentType)) paymentType = 'factuur';
  if (['receipt', 'purchase_proof'].includes(documentType) && paymentType === 'unknown') paymentType = 'bon';
  const paymentStatus = paymentType === 'bon'
    ? 'paid'
    : paymentType === 'factuur'
      ? 'openstaand'
      : safeString(extraction.payment_status).toLowerCase() || 'unknown';
  const payload = {
    user_id: USER_ID,
    supplier_name: safeString(extraction.supplier_name) || 'Onbekende leverancier',
    description: safeString(extraction.receipt_description || extraction.description) || `Factuur ${archive.original_filename}`,
    line_items: lineItems(extraction),
    amount_excl_btw: amounts.subtotal,
    amount_incl_btw: amounts.total,
    btw_percentage: safeNumber(extraction.btw_percentage) || 21,
    btw_amount: amounts.vat,
    manual_amount_override: true,
    date: safeString(extraction.date).slice(0, 10),
    offerte_reference: extraction.offerte_reference || null,
    category: inferredCategory(extraction),
    payment_type: paymentType,
    payment_status: paymentStatus,
    due_date: safeString(extraction.due_date) || null,
    supplier_invoice_number: safeString(extraction.supplier_invoice_number) || null,
    reconciliation_group_id: safeString(extraction.reconciliation_group_id) || null,
    source_filename: archive.original_filename,
    source_email: safeString(archive.metadata?.source_message_id) || null,
    receipt_url: file.url,
    receipt_files: [file],
    status: 'confirmed',
  };
  const response = await fetch(`${APP_BASE_URL}/api/kosten/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-offertehulp-secret': process.env.N8N_HEADER_SECRET,
      'x-offertehulp-user-id': USER_ID,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.message || `Kosten-API gaf HTTP ${response.status}.`);
  const rows = Array.isArray(result.rows) ? result.rows : result.data ? [result.data] : [];
  const ids = rows.map((row) => safeString(row.id)).filter(Boolean);
  if (!ids.length) throw new Error('Kosten-API gaf geen nieuwe kost-id terug.');
  await supabase.from('cost_document_archives').update({
    metadata: {
      ...(archive.metadata || {}),
      reconciliation: {
        action: 'created_cost',
        reference: extraction.offerte_reference || null,
        processed_at: new Date().toISOString(),
      },
    },
  }).eq('id', archive.id).eq('user_id', USER_ID);
  return ids;
}

function sumLineValue(items, field) {
  return safeNumber((Array.isArray(items) ? items : []).reduce(
    (sum, item) => sum + safeNumber(item?.[field]),
    0
  ));
}

async function reconcileLinkedTotals(archive, extraction) {
  const ids = Array.isArray(archive.linked_cost_ids) ? archive.linked_cost_ids : [];
  if (!ids.length) return;
  const rowsResult = await supabase.from('project_costs').select('*').in('id', ids).eq('user_id', USER_ID);
  if (rowsResult.error) throw new Error(rowsResult.error.message);
  const rows = rowsResult.data;
  if (!rows.length) return;

  const target = extractionAmounts(extraction);
  const calculated = rows.map((row) => {
    const lineExcl = sumLineValue(row.line_items, 'total_price');
    const lineIncl = sumLineValue(row.line_items, 'total_incl_btw');
    return {
      row,
      excl: lineExcl || safeNumber(row.amount_excl_btw),
      incl: lineIncl || safeNumber(row.amount_incl_btw),
    };
  });
  const largest = calculated.reduce(
    (best, item, index) => Math.abs(item.excl) > Math.abs(calculated[best].excl) ? index : best,
    0
  );
  const sumExcl = safeNumber(calculated.reduce((sum, item) => sum + item.excl, 0));
  const sumIncl = safeNumber(calculated.reduce((sum, item) => sum + item.incl, 0));
  calculated[largest].excl = safeNumber(calculated[largest].excl + (target.subtotal - sumExcl));
  calculated[largest].incl = safeNumber(calculated[largest].incl + (target.total - sumIncl));

  for (const item of calculated) {
    const vat = safeNumber(item.incl - item.excl);
    const rate = item.excl ? safeNumber((vat / item.excl) * 100) : 0;
    const update = await supabase.from('project_costs').update({
      amount_excl_btw: item.excl,
      btw_amount: vat,
      amount_incl_btw: item.incl,
      btw_percentage: rate,
      updated_at: new Date().toISOString(),
    }).eq('id', item.row.id).eq('user_id', USER_ID);
    if (update.error) throw new Error(update.error.message);
  }
}

async function loadCache() {
  if (REFRESH) return {};
  try { return JSON.parse(await readFile(CACHE_PATH, 'utf8')); } catch { return {}; }
}

async function main() {
  const archivesResult = await supabase.from('cost_document_archives')
    .select('*')
    .eq('user_id', USER_ID)
    .order('received_at', { ascending: true });
  if (archivesResult.error) throw new Error(archivesResult.error.message);
  const archives = archivesResult.data.filter((archive) => {
    if (safeString(archive.content_type).toLowerCase() !== 'application/pdf') return false;
    const linked = Array.isArray(archive.linked_cost_ids) && archive.linked_cost_ids.length > 0;
    if (RECONCILE_LINKED) return linked && Boolean(archive.metadata?.reconciliation);
    return !linked;
  });

  const costsResult = await supabase.from('project_costs').select('*').eq('user_id', USER_ID);
  if (costsResult.error) throw new Error(costsResult.error.message);
  const costs = costsResult.data;
  const cache = await loadCache();
  const quoteCache = new Map();
  const report = [];

  for (const [index, archive] of archives.entries()) {
    process.stdout.write(`[${index + 1}/${archives.length}] ${archive.original_filename} ... `);
    let extraction = cache[archive.sha256];
    if (!extraction) {
      extraction = await extractArchive(archive);
      cache[archive.sha256] = extraction;
      await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
    }
    extraction.offerte_reference = resolveReference(extraction);
    if (RECONCILE_LINKED) {
      if (APPLY) await reconcileLinkedTotals(archive, extraction);
      const amounts = extractionAmounts(extraction);
      report.push({
        archive_id: archive.id,
        filename: archive.original_filename,
        total: amounts.total,
        action: 'reconcile_linked_totals',
        result: APPLY ? 'reconciled' : 'dry_run',
      });
      console.log(`reconcile_linked_totals; €${amounts.total.toFixed(2)}`);
      continue;
    }
    const quote = await resolveQuote(extraction.offerte_reference, quoteCache);
    const groups = candidateGroups(costs, archive, extraction);
    const match = groups.length === 1 ? groups[0] : null;
    const amounts = extractionAmounts(extraction);
    const action = match ? 'link_existing' : groups.length > 1 ? 'ambiguous' : 'create_cost';
    const item = {
      archive_id: archive.id,
      filename: archive.original_filename,
      supplier: safeString(extraction.supplier_name),
      date: safeString(extraction.date).slice(0, 10),
      total: amounts.total,
      invoice_number: safeString(extraction.supplier_invoice_number) || null,
      reference: extraction.offerte_reference || null,
      quote_id: quote?.id || null,
      quote_client: quote?.client || null,
      action,
      match_reason: match?.reason || null,
      matched_cost_ids: match?.rows.map((row) => row.id) || [],
      candidate_group_count: groups.length,
    };

    if (APPLY) {
      if (action === 'ambiguous') {
        item.result = 'skipped_ambiguous';
      } else if (match) {
        item.result_ids = await linkExisting(archive, extraction, match, quote);
        item.result = 'linked_existing';
      } else {
        item.result_ids = await createCost(archive, extraction);
        item.result = 'created_cost';
      }
    }
    report.push(item);
    console.log(`${action}; €${amounts.total.toFixed(2)}; ref ${extraction.offerte_reference || '-'}${quote ? ' ✓' : ''}`);
  }

  const summary = report.reduce((result, item) => {
    result[item.action] = (result[item.action] || 0) + 1;
    return result;
  }, {});
  console.log(JSON.stringify({ apply: APPLY, count: report.length, summary, report }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
