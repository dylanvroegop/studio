import { initFirebaseAdmin } from '@/firebase/admin';
import { getDemoTrialState } from '@/lib/demo-trial';

export type SubscriptionPlan = 'demo' | 'zzp' | 'pro' | 'enterprise';

export interface CalculationQuotaStatus {
  plan: SubscriptionPlan;
  limit: number | null;
  isUnlimited: boolean;
  usedJobs: number;
  remainingJobs: number | null;
  cycleAnchorAt: Date;
  currentCycleStart: Date;
  currentCycleEnd: Date;
}

export interface ReserveCalculationQuotaResult {
  ok: boolean;
  reservationId?: string;
  status: CalculationQuotaStatus;
  reason?: 'calculation_limit_reached';
}

const PLAN_LIMITS: Record<SubscriptionPlan, number | null> = {
  demo: 5,
  zzp: 50,
  pro: 150,
  enterprise: null,
};

const PRICING_URL = 'https://calvora.nl/prijzen';

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePlan(value: unknown): SubscriptionPlan | null {
  const raw = normalizeString(value)?.toLowerCase();
  if (raw === 'demo' || raw === 'zzp' || raw === 'pro' || raw === 'enterprise') return raw;
  return null;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object') {
    const row = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof row.toDate === 'function') {
      const parsed = row.toDate();
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const seconds = typeof row.seconds === 'number'
      ? row.seconds
      : (typeof row._seconds === 'number' ? row._seconds : null);
    if (seconds != null) {
      const parsed = new Date(seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }
  return null;
}

function parseNonNegativeInt(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.floor(num);
}

function sameDate(a: Date | null, b: Date | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

function clampDayOfMonth(year: number, month: number, day: number): number {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Math.min(day, lastDay);
}

function addMonthsKeepingAnchor(base: Date, months: number): Date {
  const year = base.getFullYear();
  const month = base.getMonth() + months;
  const day = base.getDate();
  const hour = base.getHours();
  const minute = base.getMinutes();
  const second = base.getSeconds();
  const ms = base.getMilliseconds();

  const normalizedYear = year + Math.floor(month / 12);
  const normalizedMonth = ((month % 12) + 12) % 12;
  const normalizedDay = clampDayOfMonth(normalizedYear, normalizedMonth, day);
  return new Date(normalizedYear, normalizedMonth, normalizedDay, hour, minute, second, ms);
}

function computeCycleWindow(anchor: Date, now: Date): { start: Date; end: Date } {
  let start = new Date(anchor.getTime());

  if (start.getTime() > now.getTime()) {
    while (start.getTime() > now.getTime()) {
      start = addMonthsKeepingAnchor(start, -1);
    }
  } else {
    while (addMonthsKeepingAnchor(start, 1).getTime() <= now.getTime()) {
      start = addMonthsKeepingAnchor(start, 1);
    }
  }

  return {
    start,
    end: addMonthsKeepingAnchor(start, 1),
  };
}

export function resolvePlanFromPriceId(priceId: string | null | undefined): SubscriptionPlan | null {
  const normalized = normalizeString(priceId);
  if (!normalized) return null;

  const zzpPriceId = normalizeString(process.env.PRICE_ZZP_MONTHLY);
  const proPriceId = normalizeString(process.env.PRICE_PRO_MONTHLY);
  const enterprisePriceId = normalizeString(process.env.PRICE_ENTERPRISE_MONTHLY);

  if (zzpPriceId && normalized === zzpPriceId) return 'zzp';
  if (proPriceId && normalized === proPriceId) return 'pro';
  if (enterprisePriceId && normalized === enterprisePriceId) return 'enterprise';

  const lowered = normalized.toLowerCase();
  if (lowered.includes('zzp')) return 'zzp';
  if (lowered.includes('pro')) return 'pro';
  if (lowered.includes('enterprise')) return 'enterprise';
  return null;
}

export function getPlanLimit(plan: SubscriptionPlan): number | null {
  return PLAN_LIMITS[plan];
}

function getBillingPriceId(businessData: Record<string, unknown>): string | null {
  const topLevel = normalizeString(businessData.subscriptionPriceId);
  if (topLevel) return topLevel;
  const billing = (businessData.billing || {}) as Record<string, unknown>;
  return normalizeString(billing.priceId);
}

function resolveEffectivePlan(businessData: Record<string, unknown>, now: Date): SubscriptionPlan {
  const trialState = getDemoTrialState(businessData, now);
  if (trialState.isDemo && !trialState.hasPaidAccess) {
    return 'demo';
  }

  const mappedFromPrice = resolvePlanFromPriceId(getBillingPriceId(businessData));
  if (mappedFromPrice) return mappedFromPrice;

  const storedPlan = normalizePlan(businessData.subscriptionPlan);
  if (storedPlan) return storedPlan;

  if (trialState.hasPaidAccess) {
    console.warn('Geen prijs->plan mapping gevonden voor actieve subscription. Fallback naar ZZP.');
    return 'zzp';
  }

  return trialState.isDemo ? 'demo' : 'zzp';
}

function resolveCycleAnchor(
  businessData: Record<string, unknown>,
  plan: SubscriptionPlan,
  now: Date
): Date {
  const calculationQuota = (businessData.calculationQuota || {}) as Record<string, unknown>;
  const billing = (businessData.billing || {}) as Record<string, unknown>;

  if (plan !== 'demo') {
    return (
      parseDate(calculationQuota.cycleAnchorAt)
      || parseDate(billing.firstPaidAt)
      || parseDate(businessData.createdAt)
      || now
    );
  }

  return parseDate(businessData.demoStartAt) || parseDate(businessData.createdAt) || now;
}

function buildQuotaFromBusinessData(
  businessData: Record<string, unknown>,
  now: Date
): {
  status: CalculationQuotaStatus;
  pendingJobs: number;
  lastIncrementAt: Date | null;
  lastIncrementQuoteId: string | null;
  lastIncrementJobCount: number | null;
} {
  const plan = resolveEffectivePlan(businessData, now);
  const limit = getPlanLimit(plan);
  const isUnlimited = limit == null;
  const anchor = resolveCycleAnchor(businessData, plan, now);
  const cycle = computeCycleWindow(anchor, now);
  const calculationQuota = (businessData.calculationQuota || {}) as Record<string, unknown>;

  const storedCycleStart = parseDate(calculationQuota.currentCycleStart);
  const isSameCycle = sameDate(storedCycleStart, cycle.start);

  const usedJobs = isSameCycle ? parseNonNegativeInt(calculationQuota.usedJobs) : 0;
  const pendingJobs = isSameCycle ? parseNonNegativeInt(calculationQuota.pendingJobs) : 0;

  const remainingJobs = isUnlimited
    ? null
    : Math.max(0, (limit || 0) - usedJobs);

  return {
    status: {
      plan,
      limit,
      isUnlimited,
      usedJobs,
      remainingJobs,
      cycleAnchorAt: anchor,
      currentCycleStart: cycle.start,
      currentCycleEnd: cycle.end,
    },
    pendingJobs,
    lastIncrementAt: isSameCycle ? parseDate(calculationQuota.lastIncrementAt) : null,
    lastIncrementQuoteId: isSameCycle ? normalizeString(calculationQuota.lastIncrementQuoteId) : null,
    lastIncrementJobCount: isSameCycle ? parseNonNegativeInt(calculationQuota.lastIncrementJobCount) : null,
  };
}

function shouldPersistQuotaPatch(
  businessData: Record<string, unknown>,
  status: CalculationQuotaStatus
): boolean {
  const calculationQuota = (businessData.calculationQuota || {}) as Record<string, unknown>;
  const storedPlan = normalizePlan(businessData.subscriptionPlan);
  const storedLimit = calculationQuota.limit === null ? null : parseNonNegativeInt(calculationQuota.limit);

  return (
    storedPlan !== status.plan
    || storedLimit !== (status.limit === null ? null : status.limit)
    || parseNonNegativeInt(calculationQuota.cycleLengthMonths) !== 1
    || !sameDate(parseDate(calculationQuota.cycleAnchorAt), status.cycleAnchorAt)
    || !sameDate(parseDate(calculationQuota.currentCycleStart), status.currentCycleStart)
    || !sameDate(parseDate(calculationQuota.currentCycleEnd), status.currentCycleEnd)
  );
}

export async function ensureCalculationQuotaByUid(uid: string): Promise<CalculationQuotaStatus> {
  const { firestore } = initFirebaseAdmin();
  const ref = firestore.collection('businesses').doc(uid);
  const snap = await ref.get();
  const businessData = (snap.exists ? snap.data() : {}) as Record<string, unknown>;
  const now = new Date();
  const computed = buildQuotaFromBusinessData(businessData, now);

  if (shouldPersistQuotaPatch(businessData, computed.status)) {
    await ref.set(
      {
        subscriptionPlan: computed.status.plan,
        calculationQuota: {
          limit: computed.status.limit,
          cycleAnchorAt: computed.status.cycleAnchorAt,
          cycleLengthMonths: 1,
          currentCycleStart: computed.status.currentCycleStart,
          currentCycleEnd: computed.status.currentCycleEnd,
          usedJobs: computed.status.usedJobs,
          pendingJobs: computed.pendingJobs,
          lastIncrementAt: computed.lastIncrementAt,
          lastIncrementQuoteId: computed.lastIncrementQuoteId,
          lastIncrementJobCount: computed.lastIncrementJobCount,
        },
      },
      { merge: true }
    );
  }

  return computed.status;
}

export async function reserveCalculationQuotaJobs(params: {
  uid: string;
  quoteId: string;
  jobsCount: number;
}): Promise<ReserveCalculationQuotaResult> {
  const { firestore } = initFirebaseAdmin();
  const businessRef = firestore.collection('businesses').doc(params.uid);
  const reservationId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const reservationRef = businessRef.collection('calculation_quota_reservations').doc(reservationId);
  const jobsCount = Math.max(0, Math.floor(params.jobsCount));

  if (jobsCount <= 0) {
    throw new Error('jobsCount moet groter zijn dan 0.');
  }

  return firestore.runTransaction(async (tx) => {
    const businessSnap = await tx.get(businessRef);
    if (!businessSnap.exists) {
      throw new Error('Business niet gevonden voor quota-reservering.');
    }

    const businessData = (businessSnap.data() || {}) as Record<string, unknown>;
    const now = new Date();
    const computed = buildQuotaFromBusinessData(businessData, now);
    const projectedTotal = computed.status.usedJobs + computed.pendingJobs + jobsCount;
    if (!computed.status.isUnlimited && projectedTotal > (computed.status.limit || 0)) {
      return {
        ok: false,
        reason: 'calculation_limit_reached' as const,
        status: computed.status,
      };
    }

    tx.set(
      businessRef,
      {
        subscriptionPlan: computed.status.plan,
        calculationQuota: {
          limit: computed.status.limit,
          cycleAnchorAt: computed.status.cycleAnchorAt,
          cycleLengthMonths: 1,
          currentCycleStart: computed.status.currentCycleStart,
          currentCycleEnd: computed.status.currentCycleEnd,
          usedJobs: computed.status.usedJobs,
          pendingJobs: computed.pendingJobs + jobsCount,
          lastIncrementAt: computed.lastIncrementAt,
          lastIncrementQuoteId: computed.lastIncrementQuoteId,
          lastIncrementJobCount: computed.lastIncrementJobCount,
        },
      },
      { merge: true }
    );

    tx.set(
      reservationRef,
      {
        quoteId: params.quoteId,
        jobsCount,
        status: 'reserved',
        cycleStart: computed.status.currentCycleStart,
        cycleEnd: computed.status.currentCycleEnd,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    return {
      ok: true,
      reservationId,
      status: computed.status,
    };
  });
}

export async function commitCalculationQuotaReservation(params: {
  uid: string;
  reservationId: string;
}): Promise<void> {
  const { firestore } = initFirebaseAdmin();
  const businessRef = firestore.collection('businesses').doc(params.uid);
  const reservationRef = businessRef.collection('calculation_quota_reservations').doc(params.reservationId);
  const usageEventRef = businessRef.collection('calculation_usage_events').doc(params.reservationId);

  await firestore.runTransaction(async (tx) => {
    const [businessSnap, reservationSnap] = await Promise.all([
      tx.get(businessRef),
      tx.get(reservationRef),
    ]);

    if (!businessSnap.exists) {
      throw new Error('Business niet gevonden tijdens quota-commit.');
    }
    if (!reservationSnap.exists) {
      throw new Error('Quota-reservering niet gevonden.');
    }

    const reservationData = (reservationSnap.data() || {}) as Record<string, unknown>;
    const reservationStatus = normalizeString(reservationData.status);
    if (reservationStatus === 'committed') return;
    if (reservationStatus !== 'reserved') {
      throw new Error(`Ongeldige reserveringsstatus: ${reservationStatus || 'onbekend'}`);
    }

    const jobsCount = parseNonNegativeInt(reservationData.jobsCount);
    const now = new Date();
    const businessData = (businessSnap.data() || {}) as Record<string, unknown>;
    const computed = buildQuotaFromBusinessData(businessData, now);
    const nextUsedJobs = computed.status.usedJobs + jobsCount;
    const nextPendingJobs = Math.max(0, computed.pendingJobs - jobsCount);

    if (!computed.status.isUnlimited && nextUsedJobs > (computed.status.limit || 0)) {
      throw new Error('Commit overschrijdt calculatie-limiet.');
    }

    tx.set(
      businessRef,
      {
        subscriptionPlan: computed.status.plan,
        calculationQuota: {
          limit: computed.status.limit,
          cycleAnchorAt: computed.status.cycleAnchorAt,
          cycleLengthMonths: 1,
          currentCycleStart: computed.status.currentCycleStart,
          currentCycleEnd: computed.status.currentCycleEnd,
          usedJobs: nextUsedJobs,
          pendingJobs: nextPendingJobs,
          lastIncrementAt: now,
          lastIncrementQuoteId: normalizeString(reservationData.quoteId),
          lastIncrementJobCount: jobsCount,
        },
      },
      { merge: true }
    );

    tx.set(
      reservationRef,
      {
        status: 'committed',
        committedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    tx.set(
      usageEventRef,
      {
        quoteId: normalizeString(reservationData.quoteId),
        jobsCount,
        status: 'counted',
        countedAt: now,
        cycleStart: computed.status.currentCycleStart,
        cycleEnd: computed.status.currentCycleEnd,
      },
      { merge: true }
    );
  });
}

export async function releaseCalculationQuotaReservation(params: {
  uid: string;
  reservationId: string;
  reason: string;
}): Promise<void> {
  const { firestore } = initFirebaseAdmin();
  const businessRef = firestore.collection('businesses').doc(params.uid);
  const reservationRef = businessRef.collection('calculation_quota_reservations').doc(params.reservationId);

  await firestore.runTransaction(async (tx) => {
    const [businessSnap, reservationSnap] = await Promise.all([
      tx.get(businessRef),
      tx.get(reservationRef),
    ]);

    if (!businessSnap.exists || !reservationSnap.exists) return;

    const reservationData = (reservationSnap.data() || {}) as Record<string, unknown>;
    const reservationStatus = normalizeString(reservationData.status);
    if (reservationStatus !== 'reserved') return;

    const jobsCount = parseNonNegativeInt(reservationData.jobsCount);
    const now = new Date();
    const businessData = (businessSnap.data() || {}) as Record<string, unknown>;
    const computed = buildQuotaFromBusinessData(businessData, now);
    const nextPendingJobs = Math.max(0, computed.pendingJobs - jobsCount);

    tx.set(
      businessRef,
      {
        subscriptionPlan: computed.status.plan,
        calculationQuota: {
          limit: computed.status.limit,
          cycleAnchorAt: computed.status.cycleAnchorAt,
          cycleLengthMonths: 1,
          currentCycleStart: computed.status.currentCycleStart,
          currentCycleEnd: computed.status.currentCycleEnd,
          usedJobs: computed.status.usedJobs,
          pendingJobs: nextPendingJobs,
          lastIncrementAt: computed.lastIncrementAt,
          lastIncrementQuoteId: computed.lastIncrementQuoteId,
          lastIncrementJobCount: computed.lastIncrementJobCount,
        },
      },
      { merge: true }
    );

    tx.set(
      reservationRef,
      {
        status: 'released',
        releaseReason: params.reason,
        releasedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  });
}

export function getPricingUrl(): string {
  return PRICING_URL;
}
