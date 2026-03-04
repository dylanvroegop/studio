import { NextResponse } from 'next/server';
import { requireAdminApiAccess, assertAdminMutationOrigin } from '@/lib/admin-auth';
import { regenerateQuoteArtifactsForAdmin } from '@/lib/quote-generation-service';
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

  const result = await regenerateQuoteArtifactsForAdmin({
    quoteId: params.quoteId,
    actorUid: authResult.decoded.uid,
    actorEmail: authResult.decoded.email || null,
  });

  await writeAdminAuditLog({
    actorUserId: authResult.decoded.uid,
    actorEmail: authResult.decoded.email || null,
    action: 'admin.quote.regenerate_pdf',
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
