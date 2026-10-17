import { linkStoredGpsPurchases } from '@/lib/gps-purchase-link-server';
import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { autoConfirmUnambiguousGpsSessions, confirmGpsWorkSession, gpsCandidateIds } from '@/lib/gps-work-session-confirm';
import { prepareGpsWorkSessions } from '@/lib/gps-work-session-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bearer(request: Request): string {
  const value = request.headers.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function authorize(request: Request): Promise<{ uid: string; firestore: FirebaseFirestore.Firestore } | NextResponse> {
  const { auth, firestore } = initFirebaseAdmin();
  const decoded = await auth.verifyIdToken(bearer(request)).catch(() => null);
  if (!decoded?.uid) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  const blocked = await ensureDemoTrialActiveByUid(decoded.uid);
  return blocked || { uid: decoded.uid, firestore };
}

function validCandidate(session: Record<string, unknown>, quoteId: string): boolean {
  return gpsCandidateIds(session).includes(quoteId);
}

export async function GET(request: Request) {
  try {
    const access = await authorize(request);
    if (access instanceof NextResponse) return access;
    await prepareGpsWorkSessions(access.firestore, access.uid);
    const autoConfirmed = await autoConfirmUnambiguousGpsSessions(access.uid);
    // Bon kan eerder binnenkomen dan de voltooide GPS-werkdag: probeer dan opnieuw.
    let gpsPurchases = null;
    if (autoConfirmed > 0) {
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date());
      const from = new Date(`${today}T12:00:00Z`);
      from.setUTCDate(from.getUTCDate() - 7);
      gpsPurchases = await linkStoredGpsPurchases(access.uid, from.toISOString().slice(0, 10), today, false)
        .catch(() => ({ error: 'GPS-aankopen konden nog niet worden gekoppeld.' }));
    }
    const { data, error } = await supabaseAdmin
      .from('gps_work_sessions')
      .select('*')
      .eq('user_id', access.uid)
      .eq('status', 'pending')
      .order('work_date', { ascending: true })
      .order('start_at', { ascending: true })
      .limit(30);
    if (error) throw new Error(error.message);
    const needsReview = (data || []).filter((session) => gpsCandidateIds(session as Record<string, unknown>).length > 1);
    return NextResponse.json({ ok: true, data: needsReview, autoConfirmed, gpsPurchases });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'GPS-werkdagen konden niet worden geladen.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await authorize(request);
    if (access instanceof NextResponse) return access;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const sessionId = String(body?.sessionId || '').trim();
    const action = String(body?.action || 'confirm');
    if (!sessionId) return NextResponse.json({ ok: false, message: 'Sessie ontbreekt.' }, { status: 400 });

    const { data: session, error } = await supabaseAdmin
      .from('gps_work_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', access.uid)
      .eq('status', 'pending')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!session) return NextResponse.json({ ok: false, message: 'Sessie niet gevonden of al verwerkt.' }, { status: 404 });

    if (action === 'dismiss') {
      const { error: dismissError } = await supabaseAdmin.from('gps_work_sessions')
        .update({ status: 'dismissed', updated_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('user_id', access.uid);
      if (dismissError) throw new Error(dismissError.message);
      return NextResponse.json({ ok: true });
    }

    const quoteId = String(body?.quoteId || '').trim();
    if (!quoteId || !validCandidate(session as Record<string, unknown>, quoteId)) {
      return NextResponse.json({ ok: false, message: 'Kies een offerte uit deze locatie.' }, { status: 400 });
    }
    const includeOutbound = body?.includeOutbound !== false;
    const includeReturn = body?.includeReturn !== false;
    const includeSupplier = body?.includeSupplier !== false;
    const timeEntry = await confirmGpsWorkSession(access.uid, session as Record<string, unknown>, quoteId, {
      includeOutbound,
      includeReturn,
      includeSupplier,
    });
    const gpsPurchases = await linkStoredGpsPurchases(access.uid, String(session.work_date), String(session.work_date), false)
      .catch(() => ({ error: 'GPS-aankopen konden nog niet worden gekoppeld.' }));
    return NextResponse.json({ ok: true, data: timeEntry, gpsPurchases });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'GPS-werkdag kon niet worden opgeslagen.' }, { status: 500 });
  }
}
