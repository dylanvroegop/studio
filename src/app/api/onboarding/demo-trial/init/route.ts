import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { getDemoTrialState } from '@/lib/demo-trial';
import { claimPendingStripeSubscriptionForUid, reconcileStripeBillingForUid } from '@/lib/stripe-billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function POST(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get('authorization') || req.headers.get('Authorization'));
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid;
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
    }

    try {
      await claimPendingStripeSubscriptionForUid({
        uid,
        email: decoded.email || null,
      });
    } catch (error) {
      console.warn('claimPendingStripeSubscriptionForUid failed in demo-trial init:', error);
    }

    try {
      await reconcileStripeBillingForUid({
        uid,
        email: decoded.email || null,
      });
    } catch (error) {
      console.warn('reconcileStripeBillingForUid failed in demo-trial init:', error);
    }

    const blocked = await ensureDemoTrialActiveByUid(uid);
    if (blocked) return blocked;

    const businessSnap = await firestore.collection('businesses').doc(uid).get();
    const businessData = businessSnap.exists ? businessSnap.data() : {};
    const state = getDemoTrialState(businessData || {});

    return NextResponse.json({
      ok: true,
      trial: {
        isDemo: state.isDemo,
        isExpired: state.isExpired,
        reason: state.reason,
        subscriptionStatus: state.subscriptionStatus,
        hasSubscriptionRecord: state.hasSubscriptionRecord,
        hasPaidAccess: state.hasPaidAccess,
        startAt: state.startAt ? state.startAt.toISOString() : null,
        expiresAt: state.expiresAt ? state.expiresAt.toISOString() : null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Demo trial init failed';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
