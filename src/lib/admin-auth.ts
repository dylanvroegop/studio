import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest, NextResponse } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { initFirebaseAdmin } from '@/firebase/admin';

export const FIREBASE_SESSION_COOKIE_NAME = 'calvora_session';
const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

function extractBearerToken(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function toUnauthorizedResponse(): NextResponse {
  return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
}

function toForbiddenResponse(): NextResponse {
  return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 });
}

async function verifySessionCookieValue(sessionCookie: string): Promise<DecodedIdToken | null> {
  const { auth } = initFirebaseAdmin();
  try {
    return await auth.verifySessionCookie(sessionCookie, true);
  } catch {
    return null;
  }
}

async function verifyIdTokenValue(idToken: string): Promise<DecodedIdToken | null> {
  const { auth } = initFirebaseAdmin();
  try {
    return await auth.verifyIdToken(idToken, true);
  } catch {
    return null;
  }
}

function isAllowedOrigin(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    return url.host === host;
  } catch {
    return false;
  }
}

export function getSessionCookieMaxAgeMs(): number {
  return SESSION_MAX_AGE_MS;
}

export async function getDecodedRequestAuth(
  request: Request | NextRequest,
  options?: { allowBearer?: boolean }
): Promise<DecodedIdToken | null> {
  const sessionCookie = request.headers.get('cookie') || '';
  const sessionMatch = sessionCookie.match(new RegExp(`${FIREBASE_SESSION_COOKIE_NAME}=([^;]+)`));
  const sessionValue = sessionMatch?.[1] || null;

  if (sessionValue) {
    const decodedSession = await verifySessionCookieValue(decodeURIComponent(sessionValue));
    if (decodedSession) return decodedSession;
  }

  if (options?.allowBearer) {
    const bearer = extractBearerToken(request.headers.get('authorization'));
    if (bearer) {
      return verifyIdTokenValue(bearer);
    }
  }

  return null;
}

export async function requireAdminApiAccess(
  request: Request | NextRequest,
  options?: { allowBearer?: boolean }
): Promise<{ decoded: DecodedIdToken } | NextResponse> {
  const decoded = await getDecodedRequestAuth(request, {
    allowBearer: options?.allowBearer !== false,
  });

  if (!decoded) return toUnauthorizedResponse();
  if (decoded.admin !== true) return toForbiddenResponse();

  return { decoded };
}

export async function requireAdminPageAccess(): Promise<{ decoded: DecodedIdToken }> {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get(FIREBASE_SESSION_COOKIE_NAME)?.value || null;
  const decoded = sessionCookie ? await verifySessionCookieValue(sessionCookie) : null;

  if (!decoded || decoded.admin !== true) {
    redirect('/login');
  }

  return { decoded };
}

export function assertAdminMutationOrigin(request: Request | NextRequest): NextResponse | null {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!isAllowedOrigin(origin, host)) {
    return NextResponse.json({ ok: false, message: 'Invalid origin' }, { status: 403 });
  }

  return null;
}
