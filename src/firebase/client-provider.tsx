'use client';
import { useEffect, useState, ReactNode } from 'react';
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

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const [firebase, setFirebase] = useState<FirebaseServices | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const services = initializeFirebase();
      setFirebase(services);
    } catch (e: any) {
      console.error("Firebase Initialization Error:", e);
      setError("Failed to initialize Firebase: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-lg">Initializing Firebase...</div>
      </div>
    );
  }

  if (error || !firebase) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-red-500">
        <div className="text-lg text-center p-4">
            <p>Firebase Initialization Failed</p>
            <p className="text-sm text-muted-foreground mt-2">{error || "Could not load Firebase services."}</p>
        </div>
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
