import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin-auth';
import { getAdminSystemStatus } from '@/lib/admin-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authResult = await requireAdminApiAccess(request);
  if (authResult instanceof NextResponse) return authResult;

  const status = await getAdminSystemStatus();
  return NextResponse.json({ ok: true, status });
}
