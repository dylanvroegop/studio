import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { firebaseConfig } from './config';

export * from './provider';
export * from './client-provider';

// Initializes and returns a Firebase app instance.
// Caches the app instance to avoid re-initialization.
export function initializeFirebase(): { app: FirebaseApp } {
  const apps = getApps();
  const app = apps.length > 0 ? getApp() : initializeApp(firebaseConfig);
  return { app };
}
