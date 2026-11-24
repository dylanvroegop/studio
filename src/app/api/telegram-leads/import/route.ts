import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { processClientIntakeImport } from '@/lib/client-intake-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveAutomationUid(request: Request): string | null {
  const expectedSecret = process.env.N8N_HEADER_SECRET?.trim() || '';
  const providedSecret = request.headers.get('x-offertehulp-secret')?.trim() || '';
  if (!expectedSecret || !providedSecret || !safeEqual(providedSecret, expectedSecret)) return null;

  return (
    request.headers.get('x-offertehulp-user-id')?.trim()
    || process.env.CALVORA_USER_ID?.trim()
    || null
  );
}

export async function POST(request: Request): Promise<Response> {
  const uid = resolveAutomationUid(request);
  if (!uid) return NextResponse.json({ success: false, message: 'Unauthorized or CALVORA_USER_ID is not configured' }, { status: 401 });
  return processClientIntakeImport(request, uid);
}
