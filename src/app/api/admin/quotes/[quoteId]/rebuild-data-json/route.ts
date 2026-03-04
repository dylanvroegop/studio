import { NextResponse } from 'next/server';
import { requireAdminApiAccess, assertAdminMutationOrigin } from '@/lib/admin-auth';
import { initFirebaseAdmin } from '@/firebase/admin';
import { rebuildQuoteDataJsonForUser } from '@/lib/quote-calculation-cache';
import { writeAdminAuditLog } from '@/lib/admin-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { quoteId: string } }
) {
  const originError = assertAdminMutationOrigin(request);
  if (originError) return originError;

  const authResult = await requireAdminApiAccess(request);
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json().catch(() => null) as { supportMode?: unknown } | null;
  if (body?.supportMode === true) {
    return NextResponse.json({ ok: false, message: 'Support mode active' }, { status: 409 });
  }

  const { firestore } = initFirebaseAdmin();
  const quoteSnap = await firestore.collection('quotes').doc(params.quoteId).get();
  if (!quoteSnap.exists) {
    return NextResponse.json({ ok: false, message: 'Offerte niet gevonden' }, { status: 404 });
  }

  const ownerUid = typeof quoteSnap.data()?.userId === 'string' ? quoteSnap.data()?.userId : '';
  if (!ownerUid) {
    return NextResponse.json({ ok: false, message: 'Geen eigenaar gevonden' }, { status: 400 });
  }

  const result = await rebuildQuoteDataJsonForUser({
    quoteId: params.quoteId,
    uid: ownerUid,
  });

  await writeAdminAuditLog({
    actorUserId: authResult.decoded.uid,
    actorEmail: authResult.decoded.email || null,
    action: 'admin.quote.rebuild_data_json',
    targetType: 'quote',
    targetId: params.quoteId,
    after: result,
    ip: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
    requestPath: new URL(request.url).pathname,
    supportMode: false,
  });

  return NextResponse.json({ ok: true, result });
}
