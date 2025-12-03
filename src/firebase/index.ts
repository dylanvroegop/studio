'use client';

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseConfig } from './config';
import { useContext } from 'react';
import { FirebaseContext } from './client-provider';

export type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
};

export function initializeFirebase(): FirebaseServices {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  return { app, auth, firestore };
}

// Hook to use Firebase services in components
export function useFirebase() {
  const services = useContext(FirebaseContext);
  if (!services) {
    // This can happen during the initial render before the useEffect in the provider runs.
    // Components should handle this case gracefully (e.g., show a loading state).
  }
  return services;
}

export function useAuth() {
  const services = useFirebase();
  return services?.auth ?? null;
}

export function useFirestore() {
    const services = useFirebase();
    return services?.firestore ?? null;
}
