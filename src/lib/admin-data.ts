import 'server-only';

import { initFirebaseAdmin } from '@/firebase/admin';
import { getStripeServerClient } from '@/lib/stripe-server';
import { getFeatureFlags, type FeatureFlagRecord } from '@/lib/feature-flags';
import { supabaseAdmin } from '@/lib/supabase-admin';

export interface AdminSystemStatus {
  appVersion: string;
  environment: string;
  firebaseProjectId: string;
  hasStripeSecret: boolean;
  hasSupabase: boolean;
  hasN8nSecret: boolean;
  generatedAt: string;
}

export interface AdminUserRow {
  uid: string;
  email: string | null;
  companyName: string | null;
  companyId: string;
  createdAt: string | null;
  lastLogin: string | null;
  status: string | null;
  plan: string | null;
  usageSummary: string | null;
}

export interface AdminSubscriptionRow {
  uid: string;
  email: string | null;
  companyName: string | null;
  plan: string | null;
  renewalDate: string | null;
  paymentStatus: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeDashboardUrl: string | null;
  failedPayment: boolean;
}

export interface AdminQuoteRow {
  quoteId: string;
  ownerUid: string | null;
  customerName: string | null;
  companyName: string | null;
  status: string | null;
  updatedAt: string | null;
  calculationStartedAt: string | null;
  calculationFailedAt: string | null;
  hasSupabaseCalculation: boolean;
  supabaseCalculationId: string | null;
  supabaseStatus: string | null;
  quotePreview: Record<string, unknown>;
  generatedOutputPreview: Record<string, unknown> | null;
}

export interface AdminAuditLogEntry {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: string | null;
  supportMode: boolean;
}

function toDateString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'object') {
    const row = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof row.toDate === 'function') {
      return row.toDate().toISOString();
    }
    const seconds =
      typeof row.seconds === 'number'
        ? row.seconds
        : (typeof row._seconds === 'number' ? row._seconds : null);
    if (seconds != null) {
      return new Date(seconds * 1000).toISOString();
    }
  }
  return null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function summarizeUsage(data: Record<string, unknown>): string | null {
  const quota =
    data.calculationQuota && typeof data.calculationQuota === 'object'
      ? (data.calculationQuota as Record<string, unknown>)
      : null;
  if (!quota) return null;

  const used = typeof quota.usedJobs === 'number' ? quota.usedJobs : Number(quota.usedJobs ?? 0);
  const limit = quota.limit == null ? null : Number(quota.limit);

  if (limit == null) {
    return Number.isFinite(used) ? `${used} gebruikt` : null;
  }

  if (!Number.isFinite(used) || !Number.isFinite(limit)) return null;
  return `${used}/${limit} gebruikt`;
}

function buildStripeDashboardUrl(type: 'customer' | 'subscription', id: string | null): string | null {
  if (!id) return null;
  const secret = process.env.STRIPE_SECRET_KEY?.trim() || '';
  const isLive = secret.startsWith('sk_live_');
  const prefix = isLive ? 'https://dashboard.stripe.com' : 'https://dashboard.stripe.com/test';
  return `${prefix}/${type === 'customer' ? 'customers' : 'subscriptions'}/${encodeURIComponent(id)}`;
}

async function listRecentBusinesses(limit = 25): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const { firestore } = initFirebaseAdmin();
  const snap = await firestore.collection('businesses').orderBy('updatedAt', 'desc').limit(limit).get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    data: (doc.data() || {}) as Record<string, unknown>,
  }));
}

export async function getAdminSystemStatus(): Promise<AdminSystemStatus> {
  return {
    appVersion:
      process.env.K_REVISION?.trim()
      || process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7)
      || '0.1.0',
    environment: process.env.NODE_ENV || 'unknown',
    firebaseProjectId:
      process.env.FIREBASE_PROJECT_ID
      || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      || 'unknown',
    hasStripeSecret: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    hasSupabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    hasN8nSecret: Boolean(process.env.N8N_HEADER_SECRET?.trim()),
    generatedAt: new Date().toISOString(),
  };
}

export async function searchAdminUsers(query: string): Promise<AdminUserRow[]> {
  const q = query.trim().toLowerCase();
  const { auth, firestore } = initFirebaseAdmin();
  const rows: AdminUserRow[] = [];

  if (q.includes('@')) {
    const authUser = await auth.getUserByEmail(q).catch(() => null);
    if (authUser?.uid) {
      const businessSnap = await firestore.collection('businesses').doc(authUser.uid).get().catch(() => null);
      const business = businessSnap?.exists ? ((businessSnap.data() || {}) as Record<string, unknown>) : {};

      rows.push({
        uid: authUser.uid,
        email: authUser.email || null,
        companyName: normalizeString(business.bedrijfsnaam) || normalizeString(business.contactNaam),
        companyId: authUser.uid,
        createdAt: authUser.metadata.creationTime || toDateString(business.createdAt),
        lastLogin: authUser.metadata.lastSignInTime || null,
        status: normalizeString(business.subscriptionStatus) || (business.isDemo === true ? 'trial' : null),
        plan: normalizeString(business.subscriptionPlan),
        usageSummary: summarizeUsage(business),
      });
      return rows;
    }
  }

  const businesses = await listRecentBusinesses(50);
  businesses.forEach(({ id, data }) => {
    const email = normalizeString(data.email);
    const companyName = normalizeString(data.bedrijfsnaam) || normalizeString(data.contactNaam);
    const haystack = [email, companyName, normalizeString(data.telefoon)].filter(Boolean).join(' ').toLowerCase();
    if (q && !haystack.includes(q)) return;

    rows.push({
      uid: id,
      email,
      companyName,
      companyId: id,
      createdAt: toDateString(data.createdAt),
      lastLogin: null,
      status: normalizeString(data.subscriptionStatus) || (data.isDemo === true ? 'trial' : null),
      plan: normalizeString(data.subscriptionPlan),
      usageSummary: summarizeUsage(data),
    });
  });

  return rows.slice(0, 25);
}

export async function searchAdminSubscriptions(query: string): Promise<AdminSubscriptionRow[]> {
  const q = query.trim().toLowerCase();
  const businesses = await listRecentBusinesses(25);
  const stripe = process.env.STRIPE_SECRET_KEY?.trim() ? getStripeServerClient() : null;
  const results: AdminSubscriptionRow[] = [];

  for (const { id, data } of businesses) {
    const email = normalizeString(data.email);
    const companyName = normalizeString(data.bedrijfsnaam) || normalizeString(data.contactNaam);
    const customerId =
      normalizeString(data.stripeCustomerId)
      || normalizeString((data.billing as Record<string, unknown> | undefined)?.stripeCustomerId);
    const subscriptionId =
      normalizeString(data.stripeSubscriptionId)
      || normalizeString((data.billing as Record<string, unknown> | undefined)?.stripeSubscriptionId);
    const haystack = [email, companyName, customerId, subscriptionId].filter(Boolean).join(' ').toLowerCase();
    if (q && !haystack.includes(q)) continue;

    let paymentStatus =
      normalizeString((data.billing as Record<string, unknown> | undefined)?.status)
      || normalizeString(data.subscriptionStatus);
    let renewalDate =
      toDateString((data.billing as Record<string, unknown> | undefined)?.currentPeriodEnd)
      || toDateString(data.subscriptionCurrentPeriodEnd);

    if (stripe && subscriptionId) {
      const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId).catch(() => null);
      if (stripeSubscription) {
        paymentStatus = stripeSubscription.status;
        const itemEnd = stripeSubscription.items.data
          .map((item) => item.current_period_end)
          .filter((value): value is number => typeof value === 'number')
          .sort((a, b) => b - a)[0];
        renewalDate = itemEnd ? new Date(itemEnd * 1000).toISOString() : renewalDate;
      }
    }

    results.push({
      uid: id,
      email,
      companyName,
      plan: normalizeString(data.subscriptionPlan),
      renewalDate,
      paymentStatus,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      stripeDashboardUrl: buildStripeDashboardUrl(
        subscriptionId ? 'subscription' : 'customer',
        subscriptionId || customerId
      ),
      failedPayment: paymentStatus === 'past_due' || paymentStatus === 'unpaid',
    });
  }

  return results.slice(0, 25);
}

export async function searchAdminQuotes(query: string): Promise<AdminQuoteRow[]> {
  try {
    const { firestore } = initFirebaseAdmin();
    const q = query.trim().toLowerCase();
    type QuoteDocLike = { id: string; data: () => Record<string, unknown> | undefined };

    let docs: QuoteDocLike[] = [];
    if (query.trim()) {
      const exact = await firestore.collection('quotes').doc(query.trim()).get().catch(() => null);
      if (exact?.exists) {
        docs = [exact as unknown as QuoteDocLike];
      }
    }

    if (docs.length === 0) {
      const recentSnap = await firestore.collection('quotes').orderBy('updatedAt', 'desc').limit(20).get();
      docs = recentSnap.docs as unknown as QuoteDocLike[];
    }

    const quoteIds = docs.map((doc) => doc.id);
    let supabaseRows: Record<string, unknown>[] = [];
    if (quoteIds.length > 0) {
      try {
        const { data } = await supabaseAdmin
          .from('quotes_collection')
          .select('id, quoteid, gebruikerid, status, data_json, created_at')
          .in('quoteid', quoteIds)
          .order('created_at', { ascending: false });
        supabaseRows = (data || []) as Record<string, unknown>[];
      } catch (error) {
        console.error('Admin quotes: Supabase lookup failed, falling back to Firestore only.', error);
      }
    }

    const supabaseMap = new Map<string, Record<string, unknown>>();
    supabaseRows.forEach((row) => {
      const quoteId = normalizeString(row.quoteid);
      if (quoteId && !supabaseMap.has(quoteId)) {
        supabaseMap.set(quoteId, row);
      }
    });

    const results: AdminQuoteRow[] = [];
    docs.forEach((doc) => {
      const data = (doc.data() || {}) as Record<string, unknown>;
      const customerData =
        data.klantinformatie && typeof data.klantinformatie === 'object'
          ? (data.klantinformatie as Record<string, unknown>)
          : {};
      const businessData =
        data.bedrijfsgegevens && typeof data.bedrijfsgegevens === 'object'
          ? (data.bedrijfsgegevens as Record<string, unknown>)
          : {};

      const customerName =
        normalizeString(customerData.bedrijfsnaam)
        || [normalizeString(customerData.voornaam), normalizeString(customerData.achternaam)]
          .filter(Boolean)
          .join(' ')
        || null;
      const companyName = normalizeString(businessData.naam);
      const haystack = [doc.id, customerName, companyName, normalizeString(data.userId)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (q && !haystack.includes(q)) return;

      const supabaseRow = supabaseMap.get(doc.id) || null;
      const preview = {
        titel: normalizeString(data.titel) || normalizeString(data.werkomschrijving),
        offerteNummer: normalizeString(data.offerteNummer),
        klantEmail: normalizeString(customerData['e-mailadres']),
      };

      results.push({
        quoteId: doc.id,
        ownerUid: normalizeString(data.userId),
        customerName,
        companyName,
        status: normalizeString(data.status),
        updatedAt: toDateString(data.updatedAt),
        calculationStartedAt: toDateString(data.calculationStartedAt),
        calculationFailedAt: toDateString(data.calculationFailedAt),
        hasSupabaseCalculation: Boolean(supabaseRow),
        supabaseCalculationId: normalizeString(supabaseRow?.id),
        supabaseStatus: normalizeString(supabaseRow?.status),
        quotePreview: preview,
        generatedOutputPreview:
          supabaseRow && typeof supabaseRow.data_json === 'object'
            ? (supabaseRow.data_json as Record<string, unknown>)
            : null,
      });
    });

    return results.slice(0, 20);
  } catch (error) {
    console.error('Admin quotes: page data failed.', error);
    return [];
  }
}

export async function getAdminAuditLogs(): Promise<AdminAuditLogEntry[]> {
  const { firestore } = initFirebaseAdmin();
  const snap = await firestore.collection('admin_audit_logs').orderBy('createdAt', 'desc').limit(50).get();
  return snap.docs.map((doc) => {
    const data = (doc.data() || {}) as Record<string, unknown>;
    return {
      id: doc.id,
      actorUserId: normalizeString(data.actorUserId),
      actorEmail: normalizeString(data.actorEmail),
      action: normalizeString(data.action),
      targetType: normalizeString(data.targetType),
      targetId: normalizeString(data.targetId),
      createdAt: toDateString(data.createdAt),
      supportMode: data.supportMode === true,
    };
  });
}

export async function getInitialAdminFeatureFlags(): Promise<FeatureFlagRecord[]> {
  return getFeatureFlags();
}
