import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration - THIS IS THE CORRECT, VALID CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyCL2Mh-J4VSd_9lhiUVuizAx3GRjPTMINU",
  authDomain: "studio-6011690104-60fbf.firebaseapp.com",
  projectId: "studio-6011690104-60fbf",
  storageBucket: "studio-6011690104-60fbf.appspot.com",
  messagingSenderId: "354400474758",
  appId: "1:354400474758:web:ec97d6463a627fc7ad2307",
  measurementId: "G-CJM6FVF63T"
};


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
