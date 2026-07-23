import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import {
  createTaxDocumentSignedUrl,
  getTaxDocumentArchiveForUser,
} from '@/lib/tax-document-archive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid || '';
    if (!uid) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const id = safeString(context.params.id);
    const record = await getTaxDocumentArchiveForUser({ id, userId: uid });
    if (!record) return NextResponse.json({ ok: false, message: 'Document niet gevonden.' }, { status: 404 });

    const signedUrl = await createTaxDocumentSignedUrl(record);
    return NextResponse.json({
      ok: true,
      data: {
        url: signedUrl,
        filename: record.original_filename,
        content_type: record.content_type,
        size_bytes: record.size_bytes,
        sha256: record.sha256,
        expires_in: 900,
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon documentlink niet maken.';
    return NextResponse.json({ ok: false, message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
