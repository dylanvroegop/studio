import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('firebaseIdToken');
  const { pathname } = request.nextUrl;

  // If the user is trying to access the login page but is already authenticated,
  // redirect them to the home page.
  if (token && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // If the user is not authenticated and trying to access a protected page,
  // redirect them to the login page.
  if (!token && pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - login (the login page itself)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|login).*)',
  ],
};
