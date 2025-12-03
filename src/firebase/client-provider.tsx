'use client';

import React, { useState, useEffect } from 'react';
import { FirebaseProvider } from './provider';
import { getApps } from 'firebase/app';

export function FirebaseClientProvider({ children }: { children: React.ReactNode }) {
  const [isFirebaseInitialized, setIsFirebaseInitialized] = useState(getApps().length > 0);

  useEffect(() => {
    if (!isFirebaseInitialized) {
      // The initialization is handled in src/firebase/index.ts
      // We just need to wait for it to complete on the client.
      // A simple state change forces a re-render after initialization.
      setIsFirebaseInitialized(true);
    }
  }, [isFirebaseInitialized]);

  if (!isFirebaseInitialized) {
    return <div>Firebase is loading...</div>; // Or a loading spinner
  }

  return <FirebaseProvider>{children}</FirebaseProvider>;
}
