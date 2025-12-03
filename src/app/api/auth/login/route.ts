import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  const { idToken } = await request.json();

  if (!idToken) {
    return NextResponse.json({ error: 'idToken is required' }, { status: 400 });
  }

  // Set the token in a secure, httpOnly cookie
  // The expiration is set to 24 hours
  const expiresIn = 24 * 60 * 60 * 1000;
  
  cookies().set('firebaseIdToken', idToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: expiresIn,
    path: '/',
  });

  return NextResponse.json({ success: true });
}
