import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';

import { createClient } from '@supabase/supabase-js';

const args = Object.fromEntries(process.argv.slice(2).map((value) => {
  const index = value.indexOf('=');
  return index === -1 ? [value, ''] : [value.slice(0, index), value.slice(index + 1)];
}));

const filePath = args['--file'];
const costId = args['--cost-id'];
const messageId = args['--message-id'] || null;
const userId = args['--user-id'];

if (!filePath || !costId || !userId) {
  throw new Error('Gebruik --file=... --cost-id=... --user-id=... [--message-id=...]');
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase-omgeving ontbreekt.');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const bytes = await readFile(filePath);
const fileStat = await stat(filePath);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const originalFilename = basename(filePath);

const costResult = await supabase
  .from('project_costs')
  .select('id, receipt_files, receipt_url')
  .eq('id', costId)
  .eq('user_id', userId)
  .single();
if (costResult.error) throw new Error(costResult.error.message);

let archiveResult = await supabase
  .from('cost_document_archives')
  .select('*')
  .eq('user_id', userId)
  .eq('sha256', sha256)
  .maybeSingle();
if (archiveResult.error) throw new Error(archiveResult.error.message);

let archive = archiveResult.data;
if (!archive) {
  const archiveId = randomUUID();
  const storagePath = `${userId}/2026/08/29/${archiveId}-${originalFilename}`;
  const upload = await supabase.storage.from('tax-documents').upload(storagePath, bytes, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (upload.error) throw new Error(upload.error.message);

  const insert = await supabase.from('cost_document_archives').insert({
    id: archiveId,
    user_id: userId,
    linked_cost_ids: [costId],
    bucket: 'tax-documents',
    storage_path: storagePath,
    original_filename: originalFilename,
    content_type: 'application/pdf',
    size_bytes: fileStat.size,
    sha256,
    source: 'import',
    metadata: {
      backfill: 'knab_gmail_direct',
      source_message_id: messageId,
      source_attachment_filename: originalFilename,
    },
  }).select('*').single();
  if (insert.error) throw new Error(insert.error.message);
  archive = insert.data;
} else {
  const ids = Array.from(new Set([...(archive.linked_cost_ids || []), costId]));
  const update = await supabase.from('cost_document_archives')
    .update({ linked_cost_ids: ids, updated_at: new Date().toISOString() })
    .eq('id', archive.id)
    .eq('user_id', userId);
  if (update.error) throw new Error(update.error.message);
}

const signed = await supabase.storage.from(archive.bucket).createSignedUrl(archive.storage_path, 60 * 60 * 24 * 365);
if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message || 'Signed URL mislukt.');

const receiptFile = {
  url: signed.data.signedUrl,
  path: archive.storage_path,
  archive_id: archive.id,
  bucket: archive.bucket,
  filename: archive.original_filename,
  content_type: archive.content_type,
  size_bytes: archive.size_bytes,
  sha256: archive.sha256,
  uploaded_at: archive.archived_at,
};
const currentFiles = Array.isArray(costResult.data.receipt_files) ? costResult.data.receipt_files : [];
const nextFiles = currentFiles.some((file) => file?.archive_id === archive.id)
  ? currentFiles
  : [...currentFiles, receiptFile];

const updateCost = await supabase.from('project_costs').update({
  receipt_url: signed.data.signedUrl,
  receipt_files: nextFiles,
  source_email: messageId,
  source_filename: archive.original_filename,
  updated_at: new Date().toISOString(),
}).eq('id', costId).eq('user_id', userId);
if (updateCost.error) throw new Error(updateCost.error.message);

console.log(JSON.stringify({ ok: true, archive_id: archive.id, cost_id: costId, filename: archive.original_filename }));
