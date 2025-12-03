import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  const { idToken } = await request.json();

  if (!idToken) {
    return NextResponse.json({ error: 'idToken is required' }, { status: 400 });
  }

  const cookieStore = cookies();
  
  // The token is set to expire in 7 days, matching Firebase's default session length.
  const expiresIn = 60 * 60 * 24 * 7 * 1000;
  
  cookieStore.set('firebaseAuthToken', idToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: expiresIn,
    path: '/',
  });

  return NextResponse.json({ success: true });
}
