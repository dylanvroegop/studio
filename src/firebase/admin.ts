import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export function initFirebaseAdmin() {
  if (!getApps().length) {
    const projectId =
      process.env.FIREBASE_PROJECT_ID
      || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      || 'studio-6011690104-60fbf';

    initializeApp({
      credential: applicationDefault(),
      projectId,
    });
  }

  const auth = getAuth();
  const firestore = getFirestore();
  return { auth, firestore };
}
