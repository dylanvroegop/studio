import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export function initFirebaseAdmin() {
  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
    });
  }

  const auth = getAuth();
  return { auth };
}
