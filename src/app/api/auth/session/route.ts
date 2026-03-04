import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/firebase/admin';
import {
  FIREBASE_SESSION_COOKIE_NAME,
  getSessionCookieMaxAgeMs,
} from '@/lib/admin-auth';
import {
  ADMIN_GUARD_COOKIE_NAME,
  createAdminGuardCookieValue,
  getAdminGuardCookieMaxAgeSeconds,
} from '@/lib/admin-guard-cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clearAuthCookies(response: NextResponse): NextResponse {
  response.cookies.set(FIREBASE_SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set(ADMIN_GUARD_COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as
      | { idToken?: unknown; clear?: unknown }
      | null;

    if (body?.clear === true) {
      return clearAuthCookies(NextResponse.json({ ok: true, cleared: true }));
    }

    const idToken = typeof body?.idToken === 'string' ? body.idToken.trim() : '';
    if (!idToken) {
      return NextResponse.json({ ok: false, message: 'Missing idToken' }, { status: 400 });
    }

    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(idToken, true).catch(() => null);
    if (!decoded?.uid) {
      return clearAuthCookies(
        NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 })
      );
    }

    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: getSessionCookieMaxAgeMs(),
    });

    const response = NextResponse.json({
      ok: true,
      uid: decoded.uid,
      isAdmin: decoded.admin === true,
    });

    response.cookies.set(FIREBASE_SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(getSessionCookieMaxAgeMs() / 1000),
    });

    if (decoded.admin === true) {
      const guardValue = await createAdminGuardCookieValue({
        uid: decoded.uid,
        email: decoded.email || null,
        isAdmin: true,
      });

      response.cookies.set(ADMIN_GUARD_COOKIE_NAME, guardValue, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: getAdminGuardCookieMaxAgeSeconds(),
      });

      await firestore.collection('admin_roles').doc(decoded.uid).set(
        {
          uid: decoded.uid,
          email: decoded.email || null,
          role: 'admin',
          active: true,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      response.cookies.set(ADMIN_GUARD_COOKIE_NAME, '', {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });
    }

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Session sync failed';
    return clearAuthCookies(NextResponse.json({ ok: false, message }, { status: 500 }));
  }
}

export async function DELETE() {
  return clearAuthCookies(NextResponse.json({ ok: true, cleared: true }));
}
