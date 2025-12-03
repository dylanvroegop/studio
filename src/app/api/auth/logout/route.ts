import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  // Clear the cookie by setting its maxAge to 0
  cookies().set('firebaseIdToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  });

  return NextResponse.json({ success: true });
}
