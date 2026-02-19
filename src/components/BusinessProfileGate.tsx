'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { isBusinessProfileComplete } from '@/lib/business-profile-completion';
import { getDemoTrialState } from '@/lib/demo-trial';

const ONBOARDING_BYPASS_PATH_PREFIXES = ['/instellingen', '/login', '/register', '/view', '/support', '/trial-verlopen'];

function isOnboardingBypassPath(pathname: string): boolean {
  return ONBOARDING_BYPASS_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function BusinessProfileGate() {
  const router = useRouter();
  const pathname = usePathname();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const inFlightForPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (isUserLoading || !user || !firestore || !pathname) return;

    const key = `${user.uid}:${pathname}`;
    if (inFlightForPathRef.current === key) return;
    inFlightForPathRef.current = key;

    let cancelled = false;
    (async () => {
      try {
        // Ensure demo trial state is initialized even if user has not touched any protected API yet.
        try {
          const token = await user.getIdToken();
          const trialInitResponse = await fetch('/api/onboarding/demo-trial/init', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: 'no-store',
          });
          if (trialInitResponse.status === 402) {
            if (!pathname.startsWith('/trial-verlopen')) {
              router.replace('/trial-verlopen');
            }
            return;
          }
        } catch (error) {
          console.warn('BusinessProfileGate demo init failed:', error);
        }

        const [userSnap, businessSnap] = await Promise.all([
          getDoc(doc(firestore, 'users', user.uid)),
          getDoc(doc(firestore, 'businesses', user.uid)),
        ]);

        if (cancelled) return;

        const settings = userSnap.exists() ? (userSnap.data()?.settings ?? {}) : {};
        const business = businessSnap.exists() ? businessSnap.data() : {};

        const trialState = getDemoTrialState(business || {});
        if (trialState.isExpired && !pathname.startsWith('/trial-verlopen')) {
          router.replace('/trial-verlopen');
          return;
        }

        if (!isBusinessProfileComplete(settings, business) && !isOnboardingBypassPath(pathname)) {
          router.replace('/instellingen?onboarding=1');
        }
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

  return null;
}
