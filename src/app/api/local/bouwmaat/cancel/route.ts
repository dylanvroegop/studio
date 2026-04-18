import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { isLocalRequest } from '@/lib/scrapers/bouwmaat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

declare global {
  // eslint-disable-next-line no-var
  var __bouwmaatScrapeCancelRequested: boolean | undefined;
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

async function verifyUser(request: Request): Promise<string | null> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) return null;
  const { auth } = initFirebaseAdmin();
  const decoded = await auth.verifyIdToken(token).catch(() => null);
  return decoded?.uid || null;
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json(
      { ok: false, message: 'Bouwmaat import is alleen lokaal beschikbaar.' },
      { status: 403 }
    );
  }

  const uid = await verifyUser(request);
  if (!uid) {
    return NextResponse.json({ ok: false, message: 'Niet ingelogd.' }, { status: 401 });
  }

  globalThis.__bouwmaatScrapeCancelRequested = true;
  return NextResponse.json({ ok: true, message: 'Stopverzoek ontvangen.' });
}

