import { NextResponse } from 'next/server';
import { DrivingDistanceError, getDrivingDistance } from '@/lib/driving-distance-server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { auth } = initFirebaseAdmin();
    let userId = '';
    try {
      const decoded = await auth.verifyIdToken(token);
      userId = decoded.uid;
      const trialBlockedResponse = await ensureDemoTrialActiveByUid(decoded.uid);
      if (trialBlockedResponse) return trialBlockedResponse;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const rawBody = await request.json().catch(() => null) as {
      quoteId?: unknown;
      originAddress?: unknown;
      destinationAddress?: unknown;
      manualQuote?: unknown;
    } | null;

    const quoteId = typeof rawBody?.quoteId === 'string' ? rawBody.quoteId.trim() : '';
    const originAddress = typeof rawBody?.originAddress === 'string' ? rawBody.originAddress.trim() : '';
    const destinationAddress = typeof rawBody?.destinationAddress === 'string' ? rawBody.destinationAddress.trim() : '';
    const manualQuote = Boolean(rawBody?.manualQuote);

    if (!originAddress || !destinationAddress) {
      return NextResponse.json({ error: 'originAddress en destinationAddress zijn verplicht.' }, { status: 400 });
    }

    const distance = await getDrivingDistance({ originAddress, destinationAddress, quoteId, userId, manualQuote });

    return NextResponse.json({ ok: true, quoteId, userId, originAddress, destinationAddress, ...distance });
  } catch (error) {
    if (error instanceof DrivingDistanceError) {
      return NextResponse.json({ error: error.message, raw: error.raw }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Distance genereren mislukt';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
