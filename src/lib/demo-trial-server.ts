import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { getDemoTrialState } from '@/lib/demo-trial';

const PRICING_URL = 'https://calvora.nl/prijzen';
const TRIAL_DURATION_DAYS = 14;

export function demoTrialExpiredResponse(expiresAt?: Date | null) {
  return NextResponse.json(
    {
      ok: false,
      code: 'demo_trial_expired',
      message: 'Uw demo-proefperiode is verlopen.',
      pricingUrl: PRICING_URL,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    },
    { status: 402 }
  );
}

export function subscriptionInactiveResponse(subscriptionStatus?: string | null) {
  return NextResponse.json(
    {
      ok: false,
      code: 'subscription_inactive',
      message: 'Uw abonnement is niet actief.',
      pricingUrl: PRICING_URL,
      subscriptionStatus: subscriptionStatus || null,
    },
    { status: 402 }
  );
}

function plusDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function ensureDemoTrialInitializedByUid(uid: string): Promise<void> {
  const { firestore } = initFirebaseAdmin();
  const businessRef = firestore.collection('businesses').doc(uid);
  const businessSnap = await businessRef.get();
  const businessData = businessSnap.exists ? businessSnap.data() : {};
  const trialState = getDemoTrialState(businessData || {});

  const hasExplicitIsDemo = typeof businessData?.isDemo === 'boolean';
  const hasExpiresAt = trialState.expiresAt !== null;

  const patch: Record<string, unknown> = {};

  // Paid subscribers should never be initialized as demo.
  if (trialState.hasPaidAccess) {
    if (businessData?.isDemo === true) {
      patch.isDemo = false;
    }
  } else {
    // Default for newly created/manual accounts: start demo automatically.
    if (!hasExplicitIsDemo && !hasExpiresAt && !trialState.hasSubscriptionRecord) {
      const now = new Date();
      patch.isDemo = true;
      patch.demoStartAt = now;
      patch.demoExpiresAt = plusDays(now, TRIAL_DURATION_DAYS);
    }

    // If expiry exists but isDemo missing, assume demo account.
    if (!hasExplicitIsDemo && hasExpiresAt) {
      patch.isDemo = true;
    }

    // If marked as demo but no expiry exists, recover window from start or now.
    if ((businessData?.isDemo === true || patch.isDemo === true) && !hasExpiresAt) {
      const startAt = trialState.startAt || new Date();
      patch.demoStartAt = startAt;
      patch.demoExpiresAt = plusDays(startAt, TRIAL_DURATION_DAYS);
    }
  }

  if (Object.keys(patch).length > 0) {
    await businessRef.set(patch, { merge: true });
  }
}

export async function ensureDemoTrialActiveByUid(uid: string): Promise<NextResponse | null> {
  const { firestore } = initFirebaseAdmin();
  await ensureDemoTrialInitializedByUid(uid);

  const businessSnap = await firestore.collection('businesses').doc(uid).get();
  const businessData = businessSnap.exists ? businessSnap.data() : null;
  const trialState = getDemoTrialState(businessData || {});

  if (trialState.isExpired) {
    if (trialState.reason === 'subscription_inactive') {
      return subscriptionInactiveResponse(trialState.subscriptionStatus);
    }
    return demoTrialExpiredResponse(trialState.expiresAt);
  }

  return null;
}
