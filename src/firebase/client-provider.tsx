'use client';
import { useEffect, useState } from 'react';
import { initializeFirebase } from '.';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { FirebaseProvider } from './provider';

type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
};

export function FirebaseClientProvider({ children }: { children: React.ReactNode }) {
  const [firebase, setFirebase] = useState<FirebaseServices | null>(null);

  useEffect(() => {
    const services = initializeFirebase();
    setFirebase(services);
  }, []);

  if (!firebase) {
    // You can return a loading spinner here
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Initializing Firebase...</div>
      </div>
    );
  }

  return (
    <FirebaseProvider
      app={firebase.app}
      auth={firebase.auth}
      firestore={firebase.firestore}
    >
      {children}
    </FirebaseProvider>
  );
}
