'use client';

import { app, auth, firestore } from '@/firebase/index';
import { FirebaseProvider } from '@/firebase/provider';
import type { ReactNode } from 'react';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  return (
    <FirebaseProvider app={app} auth={auth} firestore={firestore}>
      {children}
    </FirebaseProvider>
  );
}
