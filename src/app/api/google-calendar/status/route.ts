import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { getCalendarClient, isGoogleInvalidGrantError } from '@/lib/integrations/google-calendar';

export const dynamic = 'force-dynamic';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim();
}

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const snap = await firestore.collection('users').doc(decoded.uid).get();
    const data = snap.data() as {
      integrations?: {
        googleCalendar?: {
          connected?: boolean;
          refreshToken?: string;
          accessToken?: string;
          expiryDate?: number;
        }
      }
    } | undefined;
    const integration = data?.integrations?.googleCalendar;
    let connected = integration?.connected === true && Boolean(integration.refreshToken);

    if (connected && integration?.refreshToken) {
      try {
        const { credentials } = await getCalendarClient({
          refreshToken: integration.refreshToken,
          accessToken: integration.accessToken || undefined,
          expiryDate: integration.expiryDate || undefined,
        });
        await snap.ref.set({
          integrations: {
            googleCalendar: {
              ...integration,
              accessToken: credentials.access_token || integration.accessToken || null,
              expiryDate: credentials.expiry_date || integration.expiryDate || null,
              connected: true,
              updatedAt: new Date(),
            },
          },
        }, { merge: true });
      } catch (error) {
        if (!isGoogleInvalidGrantError(error)) throw error;
        connected = false;
        await snap.ref.set({
          integrations: {
            googleCalendar: {
              ...integration,
              connected: false,
              reconnectRequired: true,
              accessToken: null,
              expiryDate: null,
              updatedAt: new Date(),
            },
          },
        }, { merge: true });
      }
    }

    return NextResponse.json({ connected, reconnectRequired: !connected && Boolean(integration?.refreshToken) });
  } catch (error) {
    console.error('google calendar status error', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
