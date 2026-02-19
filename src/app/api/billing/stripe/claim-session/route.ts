import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { getStripeServerClient } from '@/lib/stripe-server';
import {
  upsertStripeBillingForUid,
  upsertStripeCustomerMappingForUid,
} from '@/lib/stripe-billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function POST(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) {
      return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
    }

    const body = await req.json().catch(() => null) as { sessionId?: unknown } | null;
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!sessionId) {
      return NextResponse.json({ ok: false, message: 'sessionId is verplicht.' }, { status: 400 });
    }

    const stripe = getStripeServerClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const customerId = typeof session.customer === 'string'
      ? session.customer
      : (session.customer?.id || null);
    const customerEmail = session.customer_details?.email || session.customer_email || null;

    await upsertStripeCustomerMappingForUid({
      uid: decoded.uid,
      customerId,
      email: customerEmail,
    });

    if (customerId) {
      try {
        await stripe.customers.update(customerId, {
          metadata: {
            firebaseUid: decoded.uid,
          },
        });
      } catch (error) {
        console.warn('Stripe customer metadata update mislukt tijdens claim-session', { customerId, error });
      }
    }

    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription?.id || null);

    if (!subscriptionId) {
      return NextResponse.json({
        ok: true,
        claimed: true,
        message: 'Checkout sessie gekoppeld. Geen subscription id aanwezig.',
      });
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await upsertStripeBillingForUid({
      uid: decoded.uid,
      subscription,
      customerId,
      customerEmail,
    });

    return NextResponse.json({
      ok: true,
      claimed: true,
      subscriptionStatus: subscription.status,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Session claim failed';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
