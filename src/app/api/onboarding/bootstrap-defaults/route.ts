import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { bootstrapDefaultCatalogForUser } from '@/lib/bootstrap-defaults';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function POST(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get('authorization') || req.headers.get('Authorization'));
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid;
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
    }

    const result = await bootstrapDefaultCatalogForUser(uid);
    return NextResponse.json({ ok: true, data: result });
  } catch (error: unknown) {
    console.error('Bootstrap defaults failed:', error);
    const message = error instanceof Error ? error.message : 'Bootstrap failed';
    return NextResponse.json(
      { ok: false, message },
      { status: 500 }
    );
  }
}
