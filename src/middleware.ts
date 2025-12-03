import { NextResponse, type NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from './lib/session';

export const middleware = async (req: NextRequest) => {
  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);

  const { user } = session;

  const { pathname } = req.nextUrl;

  // If the user is logged in and tries to access the login page, redirect to home
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // If the user is not logged in and tries to access a protected page, redirect to login
  if (!user && pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  
  return res;
};

export const config = {
  // The matcher should include all paths except for API routes, static files, and image optimization files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};
