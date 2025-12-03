import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseConfig } from './config';

// Export the necessary provider hooks
export {
    useAuth,
} from './provider';

let app: FirebaseApp;
let auth: Auth;
let firestore: Firestore;

export function initializeFirebase() {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    firestore = getFirestore(app);
  } else {
    app = getApps()[0];
    auth = getAuth(app);
    firestore = getFirestore(app);
  }
  return { app, auth, firestore };
}
