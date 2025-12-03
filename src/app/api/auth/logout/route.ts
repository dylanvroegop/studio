import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  const cookieStore = cookies();
  
  // Clear the authentication cookie by setting its expiry date to the past.
  cookieStore.set('firebaseAuthToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: -1, // Expire immediately
    path: '/',
  });

  return NextResponse.json({ success: true });
}
