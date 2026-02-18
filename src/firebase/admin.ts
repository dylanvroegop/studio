import { getApps, initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export function initFirebaseAdmin() {
  if (!getApps().length) {
    const projectId =
      process.env.FIREBASE_PROJECT_ID
      || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      || 'studio-6011690104-60fbf';
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
    const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY?.trim();
    const privateKey = privateKeyRaw
      ? privateKeyRaw.replace(/^['"]|['"]$/g, '').replace(/\\n/g, '\n')
      : null;

    const credential =
      clientEmail && privateKey
        ? cert({
          projectId,
          clientEmail,
          privateKey,
        })
        : applicationDefault();

    initializeApp({
      credential,
      projectId,
    });
  }

  const auth = getAuth();
  const firestore = getFirestore();
  return { auth, firestore };
}
