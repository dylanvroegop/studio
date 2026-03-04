'use client';

import { useEffect } from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import { useAuth } from '@/firebase';

async function syncSession(idToken: string | null): Promise<void> {
  const body = idToken ? { idToken } : { clear: true };
  await fetch('/api/auth/session', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    credentials: 'include',
  }).catch(() => null);
}

export function AuthSessionSync() {
  const auth = useAuth();

  useEffect(() => {
    if (!auth) return;

    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (!user) {
        await syncSession(null);
        return;
      }

      const token = await user.getIdToken().catch(() => null);
      if (!token) return;
      await syncSession(token);
    });

    return () => unsubscribe();
  }, [auth]);

  return null;
}
