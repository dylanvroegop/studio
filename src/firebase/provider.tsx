'use client';

import React, { createContext, useContext } from 'react';
import { type Auth } from 'firebase/auth';
import { type Firestore } from 'firebase/firestore';

interface FirebaseContextValue {
  auth: Auth | null;
  firestore: Firestore | null;
}

const FirebaseContext = createContext<FirebaseContextValue>({ auth: null, firestore: null });

export function FirebaseProvider({ 
  children, 
  auth, 
  firestore 
}: { 
  children: React.ReactNode, 
  auth: Auth | null, 
  firestore: Firestore | null 
}) {
  return (
    <FirebaseContext.Provider value={{ auth, firestore }}>
      {children}
    </FirebaseContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within a FirebaseProvider');
  }
  return context.auth;
};

export const useFirestore = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirestore must be used within a FirebaseProvider');
  }
  return context.firestore;
};
