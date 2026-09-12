import { NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { initFirebaseAdmin } from '@/firebase/admin';
import { getGoogleOAuthClient } from '@/lib/integrations/google-calendar';

function token(request: Request): string | null {
  const header = request.headers.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7).trim() || null : null;
}

function createState(uid: string): string {
  const payload = `gmail.${uid}.${Date.now()}`;
  const secret = process.env.GOOGLE_CALENDAR_STATE_SECRET?.trim();
  if (!secret) throw new Error('GOOGLE_CALENDAR_STATE_SECRET ontbreekt');
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

export async function POST(request: Request) {
  try {
    const bearer = token(request);
    if (!bearer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(bearer).catch(() => null);
    if (!decoded?.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const oauth2Client = getGoogleOAuthClient();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/gmail.send'],
      state: createState(decoded.uid),
    });
    return NextResponse.json({ url });
  } catch (error) {
    console.error('google gmail connect-url error', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal error' }, { status: 500 });
  }
}
