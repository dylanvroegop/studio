import { NextResponse } from 'next/server';

import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import {
  archiveTaxDocument,
  createTaxDocumentSignedUrl,
  linkTaxDocumentToCosts,
  sha256ForBytes,
  TAX_DOCUMENT_MAX_BYTES,
  toArchivedReceiptFile,
  type TaxDocumentArchiveRecord,
} from '@/lib/tax-document-archive';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KNAB_BACKFILL_START_DATE = '2026-06-10';

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveAutomationUid(request: Request, formData: FormData): string | null {
  const expectedSecret = safeString(process.env.N8N_HEADER_SECRET);
  const providedSecret = safeString(request.headers.get('x-offertehulp-secret'));
  if (!expectedSecret || providedSecret !== expectedSecret) return null;

  return safeString(formData.get('user_id'))
    || safeString(request.headers.get('x-offertehulp-user-id'))
    || null;
}

function parseCostIds(value: FormDataEntryValue | null): string[] {
  const raw = safeString(value);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.map(safeString).filter(Boolean)));
  } catch {
    return [];
  }
}

function archiveIdFromReceiptFile(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  return safeString((value as Record<string, unknown>).archive_id);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const uid = resolveAutomationUid(request, formData);
    if (!uid) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const sourceFile = formData.get('file');
    const costIds = parseCostIds(formData.get('cost_ids'));
    if (!(sourceFile instanceof File)) {
      return NextResponse.json({ ok: false, message: 'PDF-bestand ontbreekt.' }, { status: 400 });
    }
    if (sourceFile.type !== 'application/pdf' && !sourceFile.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ ok: false, message: 'Alleen PDF-bestanden zijn toegestaan.' }, { status: 400 });
    }
    if (sourceFile.size <= 0 || sourceFile.size > TAX_DOCUMENT_MAX_BYTES) {
      return NextResponse.json({ ok: false, message: 'PDF moet groter zijn dan 0 en maximaal 15 MB.' }, { status: 400 });
    }
    if (costIds.length === 0) {
      return NextResponse.json({ ok: false, message: 'Geen kosten geselecteerd.' }, { status: 400 });
    }

    const costsResult = await supabaseAdmin
      .from('project_costs')
      .select('id, date, receipt_files')
      .eq('user_id', uid)
      .in('id', costIds);
    if (costsResult.error) throw new Error(costsResult.error.message);

    const costs = (costsResult.data || []) as unknown as Array<{
      id: string;
      date: string;
      receipt_files: unknown;
    }>;
    const invalidCostIds = costIds.filter((id) => !costs.some((cost) => cost.id === id));
    if (invalidCostIds.length > 0 || costs.some((cost) => safeString(cost.date) < KNAB_BACKFILL_START_DATE)) {
      return NextResponse.json({ ok: false, message: 'Een of meer kosten vallen buiten de Knab-backfill.' }, { status: 400 });
    }

    const bytes = Buffer.from(await sourceFile.arrayBuffer());
    const digest = sha256ForBytes(bytes);
    const existingArchive = await supabaseAdmin
      .from('cost_document_archives')
      .select('*')
      .eq('user_id', uid)
      .eq('sha256', digest)
      .maybeSingle();
    if (existingArchive.error) throw new Error(existingArchive.error.message);

    const archive = existingArchive.data
      ? existingArchive.data as unknown as TaxDocumentArchiveRecord
      : await archiveTaxDocument({
          userId: uid,
          bytes,
          originalFilename: sourceFile.name || 'factuur.pdf',
          contentType: 'application/pdf',
          source: 'import',
          metadata: {
            backfill: 'knab_gmail',
            source_message_id: safeString(formData.get('source_message_id')) || null,
            source_attachment_filename: sourceFile.name || null,
          },
        });

    const signedUrl = await createTaxDocumentSignedUrl(archive);
    const receiptFile = toArchivedReceiptFile(archive, signedUrl);
    const sourceMessageId = safeString(formData.get('source_message_id')) || null;

    for (const cost of costs) {
      const currentFiles = Array.isArray(cost.receipt_files) ? cost.receipt_files : [];
      const nextFiles = currentFiles.some((file) => archiveIdFromReceiptFile(file) === archive.id)
        ? currentFiles
        : [...currentFiles, receiptFile];
      const update = await supabaseAdmin
        .from('project_costs')
        .update({
          receipt_url: signedUrl,
          receipt_files: nextFiles,
          source_email: sourceMessageId,
          source_filename: archive.original_filename,
        })
        .eq('id', cost.id)
        .eq('user_id', uid);
      if (update.error) throw new Error(update.error.message);
    }

    await linkTaxDocumentToCosts({ archiveId: archive.id, userId: uid, costIds });

    return NextResponse.json({
      ok: true,
      data: {
        archive_id: archive.id,
        filename: archive.original_filename,
        cost_ids: costIds,
        reused_archive: Boolean(existingArchive.data),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon PDF niet koppelen.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
