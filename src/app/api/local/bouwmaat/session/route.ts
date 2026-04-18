import { NextResponse } from 'next/server';
import { chromium } from 'playwright';

import { initFirebaseAdmin } from '@/firebase/admin';
import { getBouwmaatBrowserProfilePath, isLocalRequest } from '@/lib/scrapers/bouwmaat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

declare global {
  // eslint-disable-next-line no-var
  var __bouwmaatPlaywrightContext: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
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
  try {
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

    const context = globalThis.__bouwmaatPlaywrightContext
      ?? await chromium.launchPersistentContext(getBouwmaatBrowserProfilePath(), {
        headless: false,
        viewport: { width: 1440, height: 1000 },
      });
    globalThis.__bouwmaatPlaywrightContext = context;

    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://www.bouwmaat.nl/', { waitUntil: 'domcontentloaded' });

    return NextResponse.json({
      ok: true,
      message: 'Bouwmaat browser geopend. Log in en laat het venster open staan.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bouwmaat browser kon niet openen.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
