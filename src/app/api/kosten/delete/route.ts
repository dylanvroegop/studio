import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function noStoreHeaders(): HeadersInit {
  return {
    'Cache-Control': 'no-store',
  };
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json(
        { ok: false, message: 'Unauthorized' },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid || '';
    if (!uid) {
      return NextResponse.json(
        { ok: false, message: 'Unauthorized' },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const costId = safeString(body?.id || body?.cost_id);
    if (!costId) {
      return NextResponse.json(
        { ok: false, message: 'id is verplicht.' },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    if (!isUuid(costId)) {
      return NextResponse.json(
        { ok: false, message: 'id is geen geldige UUID.' },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const lookup = await supabaseAdmin
      .from('project_costs')
      .select('*')
      .eq('id', costId)
      .maybeSingle();

    if (lookup.error) {
      return NextResponse.json(
        { ok: false, message: lookup.error.message },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    if (!lookup.data) {
      return NextResponse.json(
        { ok: false, message: 'Kost niet gevonden.' },
        { status: 404, headers: noStoreHeaders() }
      );
    }

    const costRow = lookup.data as Record<string, unknown>;
    const rowUserId = safeString(costRow.user_id);
    const offerteId = safeString(costRow.offerte_id);

    let hasAccess = rowUserId === uid;
    if (!hasAccess && offerteId) {
      const quoteSnap = await firestore.collection('quotes').doc(offerteId).get();
      const quoteData = quoteSnap.data() || {};
      const ownerId = safeString((quoteData as { userId?: unknown }).userId);
      hasAccess = quoteSnap.exists && ownerId === uid;
    }

    if (!hasAccess) {
      return NextResponse.json(
        { ok: false, message: 'Geen toegang tot deze kost.' },
        { status: 403, headers: noStoreHeaders() }
      );
    }

    const deletion = await supabaseAdmin
      .from('project_costs')
      .delete()
      .eq('id', costId)
      .select('id')
      .maybeSingle();

    if (deletion.error) {
      return NextResponse.json(
        { ok: false, message: deletion.error.message },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    if (!deletion.data?.id) {
      return NextResponse.json(
        { ok: false, message: 'Kost niet gevonden of al verwijderd.' },
        { status: 404, headers: noStoreHeaders() }
      );
    }

    return NextResponse.json(
      { ok: true, id: costId },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon kost niet verwijderen.';
    return NextResponse.json(
      { ok: false, message },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}
