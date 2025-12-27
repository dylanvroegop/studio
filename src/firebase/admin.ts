// src/firebase/admin.ts
import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export function initFirebaseAdmin() {
  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
    });
  }

  const auth = getAuth();
  const firestore = getFirestore();

  return { auth, firestore };
}
