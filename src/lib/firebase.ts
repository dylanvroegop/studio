import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, serverTimestamp, addDoc, collection } from "firebase/firestore";
import { getStorage } from "firebase/storage";

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
const storage = getStorage(app);

export async function uploadMaterialsCsv(file: File, userId: string): Promise<{ updatedCount: number }> {
    if (!userId) {
        throw new Error("Gebruiker is niet ingelogd.");
    }
    const timestamp = new Date().toISOString();
    const storagePath = `materials-csv/${userId}/${timestamp}-${file.name}`;
    
    // In een echte app zou je hier de file uploaden naar Firebase Storage
    console.log(`Bestand zou worden geupload naar: ${storagePath}`);

    // Simuleer een succesvolle upload en een aantal bijgewerkte items
    await new Promise(resolve => setTimeout(resolve, 1500)); 
    
    // De parsing en database update wordt afgehandeld door een (nog te maken) Cloud Function.
    // We simuleren hier een resultaat.
    const updatedCount = Math.floor(Math.random() * 50) + 10;
    
    return { updatedCount };
}

export { app, auth, db, storage, serverTimestamp, addDoc, collection };
