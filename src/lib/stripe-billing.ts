import type Stripe from 'stripe';
import { initFirebaseAdmin } from '@/firebase/admin';
import { resolvePlanFromPriceId } from '@/lib/calculation-quota';

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function unixToDate(seconds: number | null | undefined): Date | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000);
}

function getSubscriptionCurrentPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const itemEnds = (subscription.items?.data || [])
    .map((item) => (typeof item.current_period_end === 'number' ? item.current_period_end : null))
    .filter((value): value is number => value !== null);

  if (itemEnds.length === 0) return null;
  return unixToDate(Math.max(...itemEnds));
}

function parseFirestoreDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'object') {
    const row = value as { toDate?: () => Date };
    if (typeof row.toDate === 'function') {
      const date = row.toDate();
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  return null;
}

function extractFirebaseUid(metadata: Stripe.Metadata | null | undefined): string | null {
  if (!metadata) return null;
  return normalizeString(metadata.firebaseUid || metadata.firebase_uid || metadata.uid);
}

function getStripeCustomerId(value: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!value) return null;
  if (typeof value === 'string') return normalizeString(value);
  return normalizeString(value.id);
}

export function isStripeSubscriptionActive(status: string | null | undefined): boolean {
  if (!status) return false;
  return ACTIVE_SUBSCRIPTION_STATUSES.has(status.toLowerCase());
}

function getPendingDocId(input: { subscriptionId?: string | null; sessionId?: string | null }): string | null {
  const subscriptionId = normalizeString(input.subscriptionId);
  if (subscriptionId) return `sub_${subscriptionId}`;
  const sessionId = normalizeString(input.sessionId);
  if (sessionId) return `sess_${sessionId}`;
  return null;
}

type BusinessLookupResult = {
  uid: string;
  source: 'firebase_uid' | 'stripe_customer' | 'email';
};

export async function findBusinessUidByStripeCustomerId(customerId: string): Promise<string | null> {
  const { firestore } = initFirebaseAdmin();

  const directSnap = await firestore
    .collection('businesses')
    .where('stripeCustomerId', '==', customerId)
    .limit(2)
    .get();
  if (directSnap.size === 1) {
    return directSnap.docs[0].id;
  }
  if (directSnap.size > 1) {
    console.warn(`Meerdere businesses gevonden voor stripeCustomerId=${customerId}.`);
    return null;
  }

  const nestedSnap = await firestore
    .collection('businesses')
    .where('billing.stripeCustomerId', '==', customerId)
    .limit(2)
    .get();
  if (nestedSnap.size === 1) {
    return nestedSnap.docs[0].id;
  }
  if (nestedSnap.size > 1) {
    console.warn(`Meerdere businesses gevonden voor billing.stripeCustomerId=${customerId}.`);
    return null;
  }

  return null;
}

export async function findBusinessUidByEmail(email: string): Promise<string | null> {
  const { firestore } = initFirebaseAdmin();

  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const snap = await firestore
    .collection('businesses')
    .where('email', '==', normalized)
    .limit(3)
    .get();

  if (snap.size === 1) return snap.docs[0].id;
  if (snap.size > 1) {
    console.warn(`Meerdere businesses gevonden voor email=${normalized}. Gebruik firebaseUid metadata.`);
    return null;
  }
  return null;
}

export async function resolveBusinessUidForCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<BusinessLookupResult | null> {
  const metadataUid = extractFirebaseUid(session.metadata);
  if (metadataUid) {
    return { uid: metadataUid, source: 'firebase_uid' };
  }

  const refUid = normalizeString(session.client_reference_id);
  if (refUid) {
    return { uid: refUid, source: 'firebase_uid' };
  }

  const customerId = getStripeCustomerId(session.customer);
  if (customerId) {
    const uidByCustomer = await findBusinessUidByStripeCustomerId(customerId);
    if (uidByCustomer) return { uid: uidByCustomer, source: 'stripe_customer' };
  }

  const email = normalizeEmail(session.customer_details?.email || session.customer_email);
  if (email) {
    const uidByEmail = await findBusinessUidByEmail(email);
    if (uidByEmail) return { uid: uidByEmail, source: 'email' };
  }

  return null;
}

export async function resolveBusinessUidForSubscription(
  subscription: Stripe.Subscription,
  fallbackEmail?: string | null
): Promise<BusinessLookupResult | null> {
  const metadataUid = extractFirebaseUid(subscription.metadata);
  if (metadataUid) {
    return { uid: metadataUid, source: 'firebase_uid' };
  }

  const customerId = getStripeCustomerId(subscription.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null);
  if (customerId) {
    const uidByCustomer = await findBusinessUidByStripeCustomerId(customerId);
    if (uidByCustomer) return { uid: uidByCustomer, source: 'stripe_customer' };
  }

  const email = normalizeEmail(fallbackEmail);
  if (email) {
    const uidByEmail = await findBusinessUidByEmail(email);
    if (uidByEmail) return { uid: uidByEmail, source: 'email' };
  }

  return null;
}

export async function upsertStripeBillingForUid(params: {
  uid: string;
  subscription: Stripe.Subscription;
  customerId?: string | null;
  customerEmail?: string | null;
}): Promise<void> {
  const { firestore } = initFirebaseAdmin();
  const { uid, subscription } = params;
  const businessRef = firestore.collection('businesses').doc(uid);
  const existingSnap = await businessRef.get();
  const existing = existingSnap.exists ? ((existingSnap.data() || {}) as Record<string, unknown>) : {};
  const existingBilling = (existing.billing || {}) as Record<string, unknown>;
  const existingQuota = (existing.calculationQuota || {}) as Record<string, unknown>;
  const customerId = params.customerId || getStripeCustomerId(subscription.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null);
  const currentPeriodEnd = getSubscriptionCurrentPeriodEnd(subscription);
  const status = normalizeString(subscription.status)?.toLowerCase() || 'incomplete';
  const isActive = isStripeSubscriptionActive(status);
  const priceId = normalizeString(subscription.items?.data?.[0]?.price?.id) || null;
  const subscriptionPlan = resolvePlanFromPriceId(priceId) || 'zzp';
  const firstPaidAt = parseFirestoreDate(existingBilling.firstPaidAt);
  const quotaAnchorAt = parseFirestoreDate(existingQuota.cycleAnchorAt);
  const now = new Date();
  const resolvedFirstPaidAt = isActive ? (firstPaidAt || now) : firstPaidAt;

  const patch: Record<string, unknown> = {
    subscriptionPlan,
    stripeCustomerId: customerId || '',
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: status,
    subscriptionCurrentPeriodEnd: currentPeriodEnd,
    subscriptionCancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    subscriptionPriceId: priceId,
    billing: {
      provider: 'stripe',
      status,
      stripeCustomerId: customerId || null,
      stripeSubscriptionId: subscription.id,
      currentPeriodEnd,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      priceId,
      customerEmail: normalizeEmail(params.customerEmail),
      firstPaidAt: resolvedFirstPaidAt || null,
      updatedAt: now,
    },
    updatedAt: now,
  };

  if (isActive) {
    patch.isDemo = false;
    if (!quotaAnchorAt) {
      patch.calculationQuota = {
        cycleAnchorAt: resolvedFirstPaidAt || now,
      };
    }
  }

  await businessRef.set(patch, { merge: true });
}

export async function upsertStripeCustomerMappingForUid(params: {
  uid: string;
  customerId?: string | null;
  email?: string | null;
}): Promise<void> {
  const { firestore } = initFirebaseAdmin();
  const patch: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  const normalizedCustomer = normalizeString(params.customerId);
  const normalizedEmail = normalizeEmail(params.email);
  if (normalizedCustomer) patch.stripeCustomerId = normalizedCustomer;
  if (normalizedEmail) patch.email = normalizedEmail;
  if (normalizedCustomer) {
    patch.billing = {
      provider: 'stripe',
      stripeCustomerId: normalizedCustomer,
      customerEmail: normalizedEmail,
      updatedAt: new Date(),
    };
  }

  await firestore.collection('businesses').doc(params.uid).set(patch, { merge: true });
}

export async function upsertPendingStripeSubscription(params: {
  subscriptionId?: string | null;
  customerId?: string | null;
  customerEmail?: string | null;
  subscriptionStatus?: string | null;
  priceId?: string | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  sessionId?: string | null;
  source: 'checkout_session' | 'subscription_event';
  eventType: string;
  unlinkedReason?: string | null;
}): Promise<void> {
  const docId = getPendingDocId({
    subscriptionId: params.subscriptionId,
    sessionId: params.sessionId,
  });
  if (!docId) return;

  const { firestore } = initFirebaseAdmin();
  const now = new Date();
  const normalizedStatus = normalizeString(params.subscriptionStatus)?.toLowerCase() || null;

  await firestore.collection('stripe_pending_subscriptions').doc(docId).set(
    {
      subscriptionId: normalizeString(params.subscriptionId),
      customerId: normalizeString(params.customerId),
      customerEmail: normalizeEmail(params.customerEmail),
      subscriptionStatus: normalizedStatus,
      isActiveStatus: isStripeSubscriptionActive(normalizedStatus),
      subscriptionPriceId: normalizeString(params.priceId),
      subscriptionCurrentPeriodEnd: params.currentPeriodEnd || null,
      subscriptionCancelAtPeriodEnd: Boolean(params.cancelAtPeriodEnd),
      sessionId: normalizeString(params.sessionId),
      source: params.source,
      lastEventType: params.eventType,
      unlinkedReason: normalizeString(params.unlinkedReason) || null,
      updatedAt: now,
      createdAt: now,
    },
    { merge: true }
  );
}

export async function claimPendingStripeSubscriptionForUid(params: {
  uid: string;
  email?: string | null;
}): Promise<{ claimed: boolean; docId?: string | null }> {
  const normalizedEmail = normalizeEmail(params.email);
  if (!normalizedEmail) return { claimed: false };

  const { firestore } = initFirebaseAdmin();
  const pendingSnap = await firestore
    .collection('stripe_pending_subscriptions')
    .where('customerEmail', '==', normalizedEmail)
    .limit(10)
    .get();

  if (pendingSnap.empty) return { claimed: false };

  const sortedDocs = [...pendingSnap.docs].sort((a, b) => {
    const aDate = parseFirestoreDate((a.data() as Record<string, unknown>).updatedAt)?.getTime() || 0;
    const bDate = parseFirestoreDate((b.data() as Record<string, unknown>).updatedAt)?.getTime() || 0;
    return bDate - aDate;
  });

  const candidate = sortedDocs.find((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return !normalizeString(data.claimedByUid);
  });

  if (!candidate) return { claimed: false };

  const row = candidate.data() as Record<string, unknown>;
  const status = normalizeString(row.subscriptionStatus)?.toLowerCase() || null;
  const isActive = isStripeSubscriptionActive(status);
  const currentPeriodEnd = parseFirestoreDate(row.subscriptionCurrentPeriodEnd);
  const subscriptionPlan = resolvePlanFromPriceId(normalizeString(row.subscriptionPriceId)) || 'zzp';

  const patch: Record<string, unknown> = {
    subscriptionPlan,
    stripeCustomerId: normalizeString(row.customerId) || '',
    stripeSubscriptionId: normalizeString(row.subscriptionId) || '',
    subscriptionStatus: status || 'incomplete',
    subscriptionCurrentPeriodEnd: currentPeriodEnd,
    subscriptionCancelAtPeriodEnd: Boolean(row.subscriptionCancelAtPeriodEnd),
    subscriptionPriceId: normalizeString(row.subscriptionPriceId) || null,
    billing: {
      provider: 'stripe',
      status: status || 'incomplete',
      stripeCustomerId: normalizeString(row.customerId),
      stripeSubscriptionId: normalizeString(row.subscriptionId),
      currentPeriodEnd,
      cancelAtPeriodEnd: Boolean(row.subscriptionCancelAtPeriodEnd),
      priceId: normalizeString(row.subscriptionPriceId),
      customerEmail: normalizedEmail,
      ...(isActive ? { firstPaidAt: new Date() } : {}),
      updatedAt: new Date(),
    },
    updatedAt: new Date(),
  };

  if (isActive) {
    patch.isDemo = false;
  }

  await firestore.collection('businesses').doc(params.uid).set(patch, { merge: true });
  await candidate.ref.set(
    {
      claimedByUid: params.uid,
      claimedAt: new Date(),
      claimStatus: 'claimed',
      updatedAt: new Date(),
    },
    { merge: true }
  );

  return { claimed: true, docId: candidate.id };
}
