import { NextResponse } from 'next/server';
import { requireAdminApiAccess, assertAdminMutationOrigin } from '@/lib/admin-auth';
import { getFeatureFlags, setFeatureFlag } from '@/lib/feature-flags';
import { writeAdminAuditLog } from '@/lib/admin-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authResult = await requireAdminApiAccess(request);
  if (authResult instanceof NextResponse) return authResult;

  const rows = await getFeatureFlags();
  return NextResponse.json({ ok: true, rows });
}

export async function POST(request: Request) {
  const originError = assertAdminMutationOrigin(request);
  if (originError) return originError;

  const authResult = await requireAdminApiAccess(request);
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json().catch(() => null) as
    | { key?: unknown; enabled?: unknown; supportMode?: unknown }
    | null;

  if (body?.supportMode === true) {
    return NextResponse.json({ ok: false, message: 'Support mode active' }, { status: 409 });
  }

  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  if (!key) {
    return NextResponse.json({ ok: false, message: 'Missing key' }, { status: 400 });
  }

  const result = await setFeatureFlag({
    key,
    enabled: body?.enabled === true,
    actorUid: authResult.decoded.uid,
    actorEmail: authResult.decoded.email || null,
  });

  await writeAdminAuditLog({
    actorUserId: authResult.decoded.uid,
    actorEmail: authResult.decoded.email || null,
    action: 'admin.feature_flag.update',
    targetType: 'feature_flag',
    targetId: key,
    before: result.before,
    after: result.after,
    ip: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
    requestPath: new URL(request.url).pathname,
    supportMode: false,
  });

  return NextResponse.json({ ok: true, row: result.after });
}
