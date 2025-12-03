// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCL2Mh-J4VSd_9lhiUVuizAx3GRjPTMINU",
  authDomain: "studio-6011690104-60fbf.firebaseapp.com",
  projectId: "studio-6011690104-60fbf",
  storageBucket: "studio-6011690104-60fbf.firebasestorage.app",
  messagingSenderId: "354400474758",
  appId: "1:354400474758:web:ec97d6463a627fc7ad2307",
  measurementId: "G-CJM6FVF63T"
};


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

export { app, auth };
