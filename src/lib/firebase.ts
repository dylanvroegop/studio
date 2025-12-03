// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
// This is the reliable, hardcoded config to ensure connection.
const firebaseConfig = {
  apiKey: "AIzaSyCJJui8jHgydY6viq3r7IbTk7--51QryFo",
  authDomain: "offertehulp-cff35.firebaseapp.com",
  projectId: "offertehulp-cff35",
  storageBucket: "offertehulp-cff35.appspot.com",
  messagingSenderId: "103536627244",
  appId: "1:103536627244:web:88165e2eee8c84ff520b89",
  measurementId: "G-E2C2S96XN8"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

export { app, auth };
