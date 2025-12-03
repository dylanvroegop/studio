'use client';
import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseConfig } from './config';

let firebaseApp: FirebaseApp;
let auth: Auth;
let firestore: Firestore;

// Initialize Firebase on the client side
if (typeof window !== 'undefined' && !getApps().length) {
  firebaseApp = initializeApp(firebaseConfig);
  auth = getAuth(firebaseApp);
  firestore = getFirestore(firebaseApp);
} else if (getApps().length) {
  firebaseApp = getApp();
  auth = getAuth(firebaseApp);
  firestore = getFirestore(firebaseApp);
}

export { firebaseApp, auth, firestore };
export * from './provider';
