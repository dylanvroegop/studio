'use client';

import { initializeFirebase } from '@/firebase/index';
import { FirebaseProvider } from '@/firebase/provider';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import type { ReactNode } from 'react';
import React, { useMemo } from 'react';

// Memoized initialization of Firebase services.
// This ensures that Firebase is initialized only once per client session.
const firebaseServices = (() => {
  let app: ReturnType<typeof initializeFirebase>['app'] | null = null;
  let auth: ReturnType<typeof getAuth> | null = null;
  let firestore: ReturnType<typeof getFirestore> | null = null;

  return () => {
    if (!app) {
      const initialized = initializeFirebase();
      app = initialized.app;
      auth = getAuth(app);
      firestore = getFirestore(app);
    }
    return { app, auth: auth!, firestore: firestore! };
  };
})();

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  // useMemo ensures that the Firebase services are only initialized once per component instance.
  // The outer IIFE ensures it's only once per client session.
  const { app, auth, firestore } = useMemo(firebaseServices, []);

  return (
    <FirebaseProvider app={app} auth={auth} firestore={firestore}>
      {children}
    </FirebaseProvider>
  );
}
