
'use client';

import React, { useEffect, useState, type ReactNode } from 'react';
import { initializeFirebase } from '@/firebase';
import { FirebaseProvider, FirebaseContext, type FirebaseContextState } from '@/firebase/provider';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

interface FirebaseClientProviderProps {
  children: ReactNode;
}

interface FirebaseServices {
  firebaseApp: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
}

// This is the dummy state that will be provided on the server
const ssrState: FirebaseContextState = {
  areServicesAvailable: false,
  firebaseApp: null,
  firestore: null,
  auth: null,
  user: null,
  isUserLoading: true, // Components will see that auth is loading
  userError: null,
};

export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  const [firebaseServices, setFirebaseServices] = useState<FirebaseServices | null>(null);

  useEffect(() => {
    // This effect runs only on the client, after the initial server render
    setFirebaseServices(initializeFirebase());
  }, []);

  // If Firebase is not initialized yet (we're on the server or in the initial client render),
  // we provide the dummy 'ssrState'.
  if (!firebaseServices) {
    return (
      <FirebaseContext.Provider value={ssrState}>
        {children}
      </FirebaseContext.Provider>
    );
  }

  // Once the services are available on the client, we render the real provider
  return (
    <FirebaseProvider
      firebaseApp={firebaseServices.firebaseApp}
      auth={firebaseServices.auth}
      firestore={firebaseServices.firestore}
    >
      {children}
    </FirebaseProvider>
  );
}
