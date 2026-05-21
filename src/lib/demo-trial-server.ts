import { NextResponse } from 'next/server';

const PRICING_URL = 'https://calvora.nl/prijzen';

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

// Private-use mode: demo/subscription trial enforcement is disabled.
export async function ensureDemoTrialInitializedByUid(_uid: string): Promise<void> {
  return;
}

// Private-use mode: always allow access.
export async function ensureDemoTrialActiveByUid(_uid: string): Promise<NextResponse | null> {
  return null;
}
