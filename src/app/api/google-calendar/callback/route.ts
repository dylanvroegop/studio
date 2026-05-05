import { NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { initFirebaseAdmin } from '@/firebase/admin';
import { getGoogleOAuthClient } from '@/lib/integrations/google-calendar';

function parseState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const [uid, timestampRaw, sig] = decoded.split('.');
    if (!uid || !timestampRaw || !sig) return null;

    const secret = process.env.GOOGLE_CALENDAR_STATE_SECRET?.trim();
    if (!secret) return null;

    const payload = `${uid}.${timestampRaw}`;
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    if (expected !== sig) return null;

    const timestamp = Number(timestampRaw);
    if (!Number.isFinite(timestamp) || Date.now() - timestamp > 15 * 60_000) return null;

    return uid;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      return NextResponse.redirect(new URL('/instellingen?calendar=error', url.origin));
    }

    const uid = parseState(state);
    if (!uid) {
      return NextResponse.redirect(new URL('/instellingen?calendar=invalid_state', url.origin));
    }

    const oauth2Client = getGoogleOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL('/instellingen?calendar=no_refresh_token', url.origin));
    }

    const { firestore } = initFirebaseAdmin();
    await firestore.collection('users').doc(uid).set({
      integrations: {
        googleCalendar: {
          connected: true,
          refreshToken: tokens.refresh_token,
          accessToken: tokens.access_token || null,
          expiryDate: tokens.expiry_date || null,
          updatedAt: new Date(),
        }
      }
    }, { merge: true });

    return NextResponse.redirect(new URL('/instellingen?calendar=connected', url.origin));
  } catch (error) {
    console.error('google calendar callback error', error);
    const url = new URL(request.url);
    return NextResponse.redirect(new URL('/instellingen?calendar=error', url.origin));
  }
}
