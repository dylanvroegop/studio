'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { isBusinessProfileComplete } from '@/lib/business-profile-completion';

const ONBOARDING_BYPASS_PATH_PREFIXES = ['/instellingen', '/login', '/register', '/view', '/support', '/trial-verlopen', '/admin'];
const CACHE_KEY = 'calvora.business_profile_gate.v1';
const CACHE_TTL_MS = 10 * 60 * 1000;

function isOnboardingBypassPath(pathname: string): boolean {
  return ONBOARDING_BYPASS_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

interface GateCheckCache {
  uid: string;
  checkedAt: number;
  isProfileComplete: boolean;
}

function loadGateCache(uid: string): GateCheckCache | null {
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GateCheckCache;
    if (parsed.uid !== uid) return null;
    if (!Number.isFinite(parsed.checkedAt)) return null;
    if (Date.now() - parsed.checkedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveGateCache(cache: GateCheckCache): void {
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage write errors.
  }
}

export function BusinessProfileGate() {
  const router = useRouter();
  const pathname = usePathname();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const inFlightForPathRef = useRef<string | null>(null);
  const [cachedState, setCachedState] = useState<GateCheckCache | null>(null);

  useEffect(() => {
    if (isUserLoading || !user || !firestore || !pathname || isOnboardingBypassPath(pathname)) return;

    const existingCache = loadGateCache(user.uid);
    if (existingCache) {
      setCachedState(existingCache);
      return;
    }

    const key = `${user.uid}:${pathname}`;
    if (inFlightForPathRef.current === key) return;
    inFlightForPathRef.current = key;

    let cancelled = false;
    (async () => {
      try {
        const [userSnap, businessSnap] = await Promise.all([
          getDoc(doc(firestore, 'users', user.uid)),
          getDoc(doc(firestore, 'businesses', user.uid)),
        ]);

        if (cancelled) return;

        const settings = userSnap.exists() ? (userSnap.data()?.settings ?? {}) : {};
        const business = businessSnap.exists() ? businessSnap.data() : {};
        const nextCache: GateCheckCache = {
          uid: user.uid,
          checkedAt: Date.now(),
          isProfileComplete: isBusinessProfileComplete(settings, business),
        };
        saveGateCache(nextCache);
        if (!cancelled) setCachedState(nextCache);
      } catch (error) {
        console.warn('BusinessProfileGate check failed:', error);
      } finally {
        if (inFlightForPathRef.current === key) {
          inFlightForPathRef.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, isUserLoading, firestore, pathname, router]);

  useEffect(() => {
    if (!pathname || !cachedState || !user) return;
    if (cachedState.uid !== user.uid) return;

    if (!cachedState.isProfileComplete && !isOnboardingBypassPath(pathname)) {
      router.replace('/instellingen?onboarding=1');
    }
  }, [cachedState, pathname, router, user]);

  return null;
}
