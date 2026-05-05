import { NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { initFirebaseAdmin } from '@/firebase/admin';
import { getGoogleOAuthClient } from '@/lib/integrations/google-calendar';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim();
}

function createState(uid: string): string {
  const payload = `${uid}.${Date.now()}`;
  const secret = process.env.GOOGLE_CALENDAR_STATE_SECRET?.trim();
  if (!secret) throw new Error('GOOGLE_CALENDAR_STATE_SECRET ontbreekt');
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const oauth2Client = getGoogleOAuthClient();
    const state = createState(decoded.uid);
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar.events'],
      state,
    });

    return NextResponse.json({ url });
  } catch (error) {
    console.error('google calendar connect-url error', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
