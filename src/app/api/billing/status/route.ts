import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { getDemoTrialState } from '@/lib/demo-trial';
import { ensureDemoTrialInitializedByUid } from '@/lib/demo-trial-server';
import { claimPendingStripeSubscriptionForUid } from '@/lib/stripe-billing';
import { ensureCalculationQuotaByUid } from '@/lib/calculation-quota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function GET(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) {
      return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
    }

    try {
      await claimPendingStripeSubscriptionForUid({
        uid: decoded.uid,
        email: decoded.email || null,
      });
    } catch (error) {
      console.warn('claimPendingStripeSubscriptionForUid failed in billing status:', error);
    }
    await ensureDemoTrialInitializedByUid(decoded.uid);
    const quota = await ensureCalculationQuotaByUid(decoded.uid);

    const businessSnap = await firestore.collection('businesses').doc(decoded.uid).get();
    const businessData = businessSnap.exists ? businessSnap.data() : {};
    const trial = getDemoTrialState(businessData || {});

    return NextResponse.json({
      ok: true,
      uid: decoded.uid,
      billing: {
        stripeCustomerId: (businessData as Record<string, unknown>)?.stripeCustomerId || null,
        stripeSubscriptionId: (businessData as Record<string, unknown>)?.stripeSubscriptionId || null,
        subscriptionStatus: trial.subscriptionStatus,
        hasSubscriptionRecord: trial.hasSubscriptionRecord,
        hasPaidAccess: trial.hasPaidAccess,
      },
      plan: quota.plan,
      quota: {
        limit: quota.limit,
        usedJobs: quota.usedJobs,
        remainingJobs: quota.remainingJobs,
        currentCycleStart: quota.currentCycleStart.toISOString(),
        currentCycleEnd: quota.currentCycleEnd.toISOString(),
        isUnlimited: quota.isUnlimited,
      },
      trial: {
        isDemo: trial.isDemo,
        isExpired: trial.isExpired,
        reason: trial.reason,
        startAt: trial.startAt ? trial.startAt.toISOString() : null,
        expiresAt: trial.expiresAt ? trial.expiresAt.toISOString() : null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Billing status error';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
