'use client';

import { useEffect } from 'react';

export function PushBootstrap() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => {
      // noop
    });
  }, []);

  return null;
}
