import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import {
  archiveTaxDocument,
  createTaxDocumentSignedUrl,
  TAX_DOCUMENT_MAX_BYTES,
  toArchivedReceiptFile,
  type TaxDocumentSource,
} from '@/lib/tax-document-archive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function resolveAutomationUid(request: Request, formData: FormData): string | null {
  const expectedSecret = safeString(process.env.N8N_HEADER_SECRET);
  const providedSecret = safeString(request.headers.get('x-offertehulp-secret'));
  if (!expectedSecret || providedSecret !== expectedSecret) return null;
  return safeString(formData.get('user_id')) || safeString(request.headers.get('x-offertehulp-user-id')) || null;
}

function inferContentType(rawType: string, filename: string): string {
  if (rawType) return rawType;
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  return 'application/octet-stream';
}

function isSupportedDocument(contentType: string, filename: string): boolean {
  return contentType === 'application/pdf'
    || contentType.startsWith('image/')
    || /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(filename);
}

function sourceFromForm(value: unknown): TaxDocumentSource {
  return safeString(value) === 'n8n_import' ? 'n8n_import' : 'manual_upload';
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const token = extractBearerToken(request.headers.get('authorization'));
    let uid = '';
    if (token) {
      const { auth } = initFirebaseAdmin();
      const decoded = await auth.verifyIdToken(token);
      uid = decoded?.uid || '';
    } else {
      uid = resolveAutomationUid(request, formData) || '';
    }

    if (!uid) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const sourceFile = formData.get('file');
    if (!(sourceFile instanceof File)) {
      return NextResponse.json({ ok: false, message: 'Bestand ontbreekt.' }, { status: 400 });
    }
    if (sourceFile.size <= 0 || sourceFile.size > TAX_DOCUMENT_MAX_BYTES) {
      return NextResponse.json({ ok: false, message: 'Bestand moet groter zijn dan 0 en maximaal 15 MB.' }, { status: 400 });
    }

    const filename = sourceFile.name || 'document';
    const contentType = inferContentType(safeString(sourceFile.type), filename);
    if (!isSupportedDocument(contentType, filename)) {
      return NextResponse.json({ ok: false, message: 'Alleen PDF of afbeelding is toegestaan.' }, { status: 400 });
    }

    const record = await archiveTaxDocument({
      userId: uid,
      bytes: Buffer.from(await sourceFile.arrayBuffer()),
      originalFilename: filename,
      contentType,
      source: sourceFromForm(formData.get('source')),
      pendingImportId: safeString(formData.get('pending_import_id')) || null,
      metadata: {
        source_attachment_filename: safeString(formData.get('source_attachment_filename')) || null,
        source_message_id: safeString(formData.get('source_message_id')) || null,
      },
    });
    const signedUrl = await createTaxDocumentSignedUrl(record);

    return NextResponse.json({
      ok: true,
      data: {
        archive: record,
        receipt_file: toArchivedReceiptFile(record, signedUrl),
        signed_url_expires_in: 900,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon document niet archiveren.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
