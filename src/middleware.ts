import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('firebaseAuthToken');
  const { pathname } = request.nextUrl;

  // If the user is not authenticated and is not on the login page, redirect them to the login page.
  if (!token && pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If the user is authenticated and tries to access the login page, redirect them to the homepage.
  if (token && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
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
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
