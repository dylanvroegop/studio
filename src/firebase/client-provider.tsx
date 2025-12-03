'use client';

import { initializeFirebase } from '@/firebase';
import { FirebaseProvider } from '@/firebase/provider';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { ReactNode, useMemo } from 'react';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const { app } = useMemo(() => initializeFirebase(), []);
  const auth = useMemo(() => getAuth(app), [app]);
  const firestore = useMemo(() => getFirestore(app), [app]);

  return (
    <FirebaseProvider app={app} auth={auth} firestore={firestore}>
      {children}
    </FirebaseProvider>
  );
}
