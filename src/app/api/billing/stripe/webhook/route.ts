import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripeServerClient } from '@/lib/stripe-server';
import {
  resolveBusinessUidForCheckoutSession,
  resolveBusinessUidForSubscription,
  upsertPendingStripeSubscription,
  upsertStripeBillingForUid,
  upsertStripeCustomerMappingForUid,
} from '@/lib/stripe-billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET ontbreekt.');
  }
  return secret;
}

async function tryGetStripeCustomerEmail(
  stripe: Stripe,
  customerId: string | null
): Promise<string | null> {
  if (!customerId) return null;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer || (customer as Stripe.DeletedCustomer).deleted) return null;
    const row = customer as Stripe.Customer;
    const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : '';
    return email || null;
  } catch {
    return null;
  }
}

async function handleCheckoutSessionCompleted(stripe: Stripe, session: Stripe.Checkout.Session) {
  const business = await resolveBusinessUidForCheckoutSession(session);
  const customerId = typeof session.customer === 'string'
    ? session.customer
    : (session.customer?.id || null);
  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : (session.subscription?.id || null);
  const checkoutEmail = session.customer_details?.email || session.customer_email || null;

  if (!business) {
    console.warn('Stripe checkout.session.completed kon niet gekoppeld worden aan business.', {
      sessionId: session.id,
      clientReferenceId: session.client_reference_id,
    });

    await upsertPendingStripeSubscription({
      source: 'checkout_session',
      eventType: 'checkout.session.completed',
      sessionId: session.id,
      customerId,
      customerEmail: checkoutEmail,
      subscriptionId,
      subscriptionStatus: subscriptionId ? 'incomplete' : null,
      unlinkedReason: 'no_business_uid_match',
    });
    return;
  }

  await upsertStripeCustomerMappingForUid({
    uid: business.uid,
    customerId,
    email: checkoutEmail,
  });

  if (!customerId) return;

  try {
    await stripe.customers.update(customerId, {
      metadata: {
        firebaseUid: business.uid,
      },
    });
  } catch (error) {
    console.warn('Stripe customer metadata update mislukt', { customerId, error });
  }

  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await upsertStripeBillingForUid({
    uid: business.uid,
    subscription,
    customerId,
    customerEmail: checkoutEmail,
  });
}

function getCurrentPeriodEndFromSubscription(subscription: Stripe.Subscription): Date | null {
  const itemEnds = (subscription.items?.data || [])
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === 'number');
  if (itemEnds.length === 0) return null;
  return new Date(Math.max(...itemEnds) * 1000);
}

async function handleSubscriptionEvent(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  eventType: string
) {
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;
  const customerEmail = await tryGetStripeCustomerEmail(stripe, customerId || null);

  const business = await resolveBusinessUidForSubscription(subscription, customerEmail);
  if (!business) {
    console.warn('Stripe subscription event kon niet gekoppeld worden aan business.', {
      subscriptionId: subscription.id,
      customerId,
      status: subscription.status,
    });

    await upsertPendingStripeSubscription({
      source: 'subscription_event',
      eventType,
      subscriptionId: subscription.id,
      customerId,
      customerEmail,
      subscriptionStatus: subscription.status,
      priceId: subscription.items?.data?.[0]?.price?.id || null,
      currentPeriodEnd: getCurrentPeriodEndFromSubscription(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      unlinkedReason: 'no_business_uid_match',
    });
    return;
  }

  await upsertStripeBillingForUid({
    uid: business.uid,
    subscription,
    customerId,
    customerEmail,
  });
}

export async function POST(req: Request) {
  try {
    const stripe = getStripeServerClient();
    const signature = (req.headers.get('stripe-signature') || '').trim();
    if (!signature) {
      return NextResponse.json({ ok: false, message: 'Ontbrekende Stripe signature header.' }, { status: 400 });
    }
    const webhookSecret = getWebhookSecret();
    const rawBody = await req.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Signature validation failed';
      return NextResponse.json({ ok: false, message }, { status: 400 });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        await handleCheckoutSessionCompleted(stripe, event.data.object as Stripe.Checkout.Session);
        break;
      }
      case 'checkout.session.async_payment_succeeded': {
        await handleCheckoutSessionCompleted(stripe, event.data.object as Stripe.Checkout.Session);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed': {
        await handleSubscriptionEvent(stripe, event.data.object as Stripe.Subscription, event.type);
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ ok: true, received: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Stripe webhook failed';
    console.error('Stripe webhook error', error);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
