export interface DemoTrialDataLike {
  isDemo?: unknown;
  demoStartAt?: unknown;
  demoExpiresAt?: unknown;
  subscriptionStatus?: unknown;
  stripeCustomerId?: unknown;
  stripeSubscriptionId?: unknown;
  billing?: {
    status?: unknown;
    stripeCustomerId?: unknown;
    stripeSubscriptionId?: unknown;
  };
}

export interface DemoTrialState {
  isDemo: boolean;
  isExpired: boolean;
  startAt: Date | null;
  expiresAt: Date | null;
  reason: 'demo_trial_expired' | 'subscription_inactive' | null;
  subscriptionStatus: string | null;
  hasSubscriptionRecord: boolean;
  hasPaidAccess: boolean;
}

function parseUnknownDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'object') {
    const row = value as {
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
    };

    if (typeof row.toDate === 'function') {
      const date = row.toDate();
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const seconds = typeof row.seconds === 'number'
      ? row.seconds
      : (typeof row._seconds === 'number' ? row._seconds : null);
    if (seconds != null) {
      const date = new Date(seconds * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }

  return null;
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return false;
}

function parseOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

const BILLING_ACCESS_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
]);

function parseSubscriptionStatus(data?: DemoTrialDataLike | null): string | null {
  const raw =
    parseOptionalString(data?.billing?.status) ||
    parseOptionalString(data?.subscriptionStatus);
  return raw ? raw.toLowerCase() : null;
}

export function getDemoTrialState(
  data?: DemoTrialDataLike | null,
  now: Date = new Date()
): DemoTrialState {
  const isDemo = parseBoolean(data?.isDemo);
  const startAt = parseUnknownDate(data?.demoStartAt);
  const expiresAt = parseUnknownDate(data?.demoExpiresAt);
  const subscriptionStatus = parseSubscriptionStatus(data);
  const hasSubscriptionRecord = Boolean(
    subscriptionStatus ||
    parseOptionalString(data?.billing?.stripeCustomerId) ||
    parseOptionalString(data?.billing?.stripeSubscriptionId) ||
    parseOptionalString(data?.stripeCustomerId) ||
    parseOptionalString(data?.stripeSubscriptionId)
  );
  const hasPaidAccess = Boolean(subscriptionStatus && BILLING_ACCESS_STATUSES.has(subscriptionStatus));

  let isExpired = false;
  let reason: DemoTrialState['reason'] = null;

  if (hasSubscriptionRecord && !hasPaidAccess) {
    isExpired = true;
    reason = 'subscription_inactive';
  } else if (isDemo && (!expiresAt || now.getTime() > expiresAt.getTime())) {
    isExpired = true;
    reason = 'demo_trial_expired';
  }

  return {
    isDemo,
    isExpired,
    startAt,
    expiresAt,
    reason,
    subscriptionStatus,
    hasSubscriptionRecord,
    hasPaidAccess,
  };
}
