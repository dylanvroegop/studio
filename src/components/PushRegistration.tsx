'use client';

import { useEffect } from 'react';
import { useUser } from '@/firebase';
import { disableDevicePush, PUSH_OWNER_KEY, pushRegistration, pushRequest, supportsPush } from '@/lib/push-client';

export function PushRegistration(): null {
  const { user, isUserLoading } = useUser();
  useEffect(() => {
    if (isUserLoading || !supportsPush()) return;
    let cancelled = false;
    const refresh = async (): Promise<void> => {
      const owner = localStorage.getItem(PUSH_OWNER_KEY);
      if (owner && owner !== user?.uid) { await disableDevicePush(); return; }
      if (!user || owner !== user.uid) return;
      const registration = await pushRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (!cancelled && subscription && Notification.permission === 'granted') {
        await pushRequest(user, 'subscription', 'POST', subscription.toJSON());
      }
    };
    const run = () => { void refresh().catch(() => { /* Instellingen biedt zichtbare foutmelding en opnieuw proberen. */ }); };
    run();
    window.addEventListener('online', run);
    return () => { cancelled = true; window.removeEventListener('online', run); };
  }, [user, isUserLoading]);
  return null;
}
