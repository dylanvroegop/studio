import { createHash, randomUUID } from 'node:crypto';

import { supabaseAdmin } from '@/lib/supabase-admin';

export const TAX_DOCUMENT_BUCKET = 'tax-documents';
export const TAX_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;

export type TaxDocumentSource = 'manual_upload' | 'n8n_import' | 'import';

export interface TaxDocumentArchiveRecord {
  id: string;
  user_id: string;
  linked_cost_ids: string[];
  pending_import_id: string | null;
  bucket: string;
  storage_path: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  source: TaxDocumentSource;
  metadata: Record<string, unknown>;
  received_at: string;
  archived_at: string;
  created_at: string;
  updated_at: string;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isBucketNotFoundError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('bucket not found') || (lower.includes('bucket') && lower.includes('not found'));
}

function isAlreadyExistsError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('already exists') || lower.includes('duplicate');
}

function sanitizeFilename(filename: string): string {
  const normalized = filename.normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g, '-');
  return normalized.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 180) || 'document';
}

function inferExtension(filename: string, contentType: string): string {
  const filenameExtension = filename.match(/\.[a-z0-9]{1,8}$/i)?.[0];
  if (filenameExtension) return filenameExtension.toLowerCase();
  const extensions: Record<string, string> = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'image/heif': '.heif',
  };
  return extensions[contentType.toLowerCase()] || '';
}

export function sha256ForBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function ensureTaxDocumentBucketExists(): Promise<void> {
  const result = await supabaseAdmin.storage.createBucket(TAX_DOCUMENT_BUCKET, {
    public: false,
    fileSizeLimit: TAX_DOCUMENT_MAX_BYTES,
    allowedMimeTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
    ],
  });

  if (!result.error || isAlreadyExistsError(result.error.message)) return;
  throw new Error(result.error.message || 'Kon de privé documentenopslag niet aanmaken.');
}

export async function archiveTaxDocument(params: {
  userId: string;
  bytes: Buffer;
  originalFilename: string;
  contentType: string;
  source: TaxDocumentSource;
  pendingImportId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<TaxDocumentArchiveRecord> {
  const userId = safeString(params.userId);
  if (!userId) throw new Error('Gebruiker ontbreekt voor documentarchief.');
  if (params.bytes.byteLength === 0) throw new Error('Het document is leeg.');
  if (params.bytes.byteLength > TAX_DOCUMENT_MAX_BYTES) {
    throw new Error('Het document is groter dan 15 MB.');
  }

  const originalFilename = sanitizeFilename(safeString(params.originalFilename) || 'document');
  const contentType = safeString(params.contentType) || 'application/octet-stream';
  const digest = sha256ForBytes(params.bytes);
  const extension = inferExtension(originalFilename, contentType);
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  const storagePath = `${userId}/${day}/${randomUUID()}-${originalFilename}${extension && !originalFilename.toLowerCase().endsWith(extension) ? extension : ''}`;
  const storage = supabaseAdmin.storage.from(TAX_DOCUMENT_BUCKET);

  let upload = await storage.upload(storagePath, params.bytes, {
    contentType,
    upsert: false,
    cacheControl: '31536000',
  });
  if (upload.error && isBucketNotFoundError(upload.error.message)) {
    await ensureTaxDocumentBucketExists();
    upload = await storage.upload(storagePath, params.bytes, {
      contentType,
      upsert: false,
      cacheControl: '31536000',
    });
  }
  if (upload.error) throw new Error(upload.error.message || 'Kon het originele document niet opslaan.');

  const insert = await supabaseAdmin
    .from('cost_document_archives')
    .insert({
      user_id: userId,
      pending_import_id: safeString(params.pendingImportId) || null,
      bucket: TAX_DOCUMENT_BUCKET,
      storage_path: storagePath,
      original_filename: originalFilename,
      content_type: contentType,
      size_bytes: params.bytes.byteLength,
      sha256: digest,
      source: params.source,
      metadata: params.metadata || {},
    })
    .select('*')
    .single();

  if (insert.error || !insert.data) {
    await storage.remove([storagePath]).catch(() => null);
    throw new Error(insert.error?.message || 'Kon het documentarchief niet registreren.');
  }

  return insert.data as unknown as TaxDocumentArchiveRecord;
}

export async function getTaxDocumentArchiveForUser(params: {
  id: string;
  userId: string;
}): Promise<TaxDocumentArchiveRecord | null> {
  const result = await supabaseAdmin
    .from('cost_document_archives')
    .select('*')
    .eq('id', safeString(params.id))
    .eq('user_id', safeString(params.userId))
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return (result.data as unknown as TaxDocumentArchiveRecord | null) || null;
}

export async function createTaxDocumentSignedUrl(record: TaxDocumentArchiveRecord, expiresInSeconds = 900): Promise<string> {
  const result = await supabaseAdmin
    .storage
    .from(record.bucket || TAX_DOCUMENT_BUCKET)
    .createSignedUrl(record.storage_path, expiresInSeconds);
  if (result.error || !result.data?.signedUrl) {
    throw new Error(result.error?.message || 'Kon geen tijdelijke documentlink maken.');
  }
  return result.data.signedUrl;
}

export async function linkTaxDocumentToCosts(params: {
  archiveId: string;
  userId: string;
  costIds: string[];
}): Promise<void> {
  const costIds = Array.from(new Set(params.costIds.map(safeString).filter(Boolean)));
  if (costIds.length === 0) return;
  const existing = await getTaxDocumentArchiveForUser({ id: params.archiveId, userId: params.userId });
  if (!existing) throw new Error('Gearchiveerd document niet gevonden.');
  const linkedCostIds = Array.from(new Set([...(existing.linked_cost_ids || []), ...costIds]));
  const result = await supabaseAdmin
    .from('cost_document_archives')
    .update({ linked_cost_ids: linkedCostIds })
    .eq('id', existing.id)
    .eq('user_id', params.userId);
  if (result.error) throw new Error(result.error.message);
}

export function archiveIdsFromReceiptFiles(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      return safeString((item as Record<string, unknown>).archive_id);
    })
    .filter(Boolean)));
}

export function toArchivedReceiptFile(record: TaxDocumentArchiveRecord, url: string): Record<string, unknown> {
  return {
    url,
    path: record.storage_path,
    archive_id: record.id,
    bucket: record.bucket,
    filename: record.original_filename,
    content_type: record.content_type,
    size_bytes: record.size_bytes,
    sha256: record.sha256,
    uploaded_at: record.archived_at,
  };
}
