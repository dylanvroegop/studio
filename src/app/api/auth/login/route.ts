import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { sessionOptions, type SessionData } from '@/lib/session';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { adminConfig } from '@/firebase/admin-config';

// Initialize Firebase Admin SDK
if (!getApps().length) {
  initializeApp({
    credential: {
        projectId: adminConfig.projectId,
        clientEmail: adminConfig.clientEmail,
        privateKey: adminConfig.privateKey.replace(/\\n/g, '\n'),
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { idToken } = body;

    if (!idToken) {
      return NextResponse.json({ message: 'ID token is required' }, { status: 400 });
    }

    const decodedToken = await getAuth().verifyIdToken(idToken);
    const { uid, email } = decodedToken;

    const session = await getIronSession<SessionData>(cookies(), sessionOptions);

    session.user = {
      uid,
      email,
    };
    session.isLoggedIn = true;
    await session.save();

    return NextResponse.json({ message: 'Login successful' }, { status: 200 });
  } catch (error) {
    console.error('Session login error:', error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
