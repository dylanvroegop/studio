import { getApps, initializeApp, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { firebaseConfig } from './config';

// This function should only be called on the server.
export function initializeFirebaseServer() {
  if (!getApps().length) {
    // When running on the server, we need to provide the config explicitly.
    const firebaseApp = initializeApp(firebaseConfig);
    return {
      firebaseApp,
      firestore: getFirestore(firebaseApp),
      auth: getAuth(firebaseApp),
    };
  }
  
  // If already initialized, return the existing instances.
  const firebaseApp = getApp();
  return {
    firebaseApp,
    firestore: getFirestore(firebaseApp),
    auth: getAuth(firebaseApp),
  };
}
