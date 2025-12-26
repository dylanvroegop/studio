// src/firebase/admin.ts
import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export function initFirebaseAdmin() {
  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
    });
  }

  const firestore = getFirestore();
  return { firestore };
}
