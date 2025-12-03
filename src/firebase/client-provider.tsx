'use client';

import React, { useState, useEffect, type ReactNode } from 'react';
import { initializeFirebase, type FirebaseServices } from './index';

export const FirebaseContext = React.createContext<FirebaseServices | null>(null);

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<FirebaseServices | null>(null);

  useEffect(() => {
    // Initialize Firebase on the client and set it in state.
    const firebaseServices = initializeFirebase();
    setServices(firebaseServices);
  }, []);

  return (
    <FirebaseContext.Provider value={services}>
      {children}
    </FirebaseContext.Provider>
  );
}
