import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  ADMIN_GUARD_COOKIE_NAME,
  verifyAdminGuardCookieValue,
} from '@/lib/admin-guard-cookie';

function buildLoginRedirect(request: NextRequest): NextResponse {
  const nextUrl = new URL('/login', request.url);
  nextUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(nextUrl);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const cookieValue = request.cookies.get(ADMIN_GUARD_COOKIE_NAME)?.value || null;
  const payload = await verifyAdminGuardCookieValue(cookieValue);

  if (payload) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/admin/')) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  return buildLoginRedirect(request);
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
