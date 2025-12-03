'use client';

import React from 'react';
import { FirebaseProvider } from './provider';
import { initializeFirebase } from '.';

// This ensures Firebase is initialized only once.
const { auth, firestore } = initializeFirebase();

export function FirebaseClientProvider({ children }: { children: React.ReactNode }) {
  // By initializing Firebase outside the component, we avoid hydration issues.
  // The provider's only job is to provide the context.
  return <FirebaseProvider auth={auth} firestore={firestore}>{children}</FirebaseProvider>;
}
