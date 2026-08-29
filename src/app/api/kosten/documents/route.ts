import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid || '';
    if (!uid) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const result = await supabaseAdmin
      .from('cost_document_archives')
      .select('id, linked_cost_ids, bucket, storage_path, original_filename, content_type, size_bytes, sha256, metadata, received_at, archived_at')
      .eq('user_id', uid)
      .eq('content_type', 'application/pdf')
      .order('archived_at', { ascending: false });
    if (result.error) throw new Error(result.error.message);

    return NextResponse.json(
      { ok: true, data: result.data || [] },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon PDF-archief niet laden.';
    return NextResponse.json(
      { ok: false, message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
