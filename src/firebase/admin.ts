import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export function initFirebaseAdmin() {
  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      // This line is what finally kills the "monospace-13" error
      projectId: 'studio-6011690104-60fbf',
    });
  }

  const auth = getAuth();
  return { auth };
}