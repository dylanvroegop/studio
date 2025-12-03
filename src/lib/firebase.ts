import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, serverTimestamp, addDoc, collection, writeBatch, query, where, getDocs, doc } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import type { Material } from './types';

// Your web app's Firebase configuration
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

// CSV Header mapping to Firestore fields
const CSV_HEADER_MAPPING: Record<string, keyof Omit<Material, 'id' | 'userId' | 'updatedAt'>> = {
  'categorie': 'categorie',
  'materiaalnaam': 'omschrijving',
  'prijs': 'prijs' as any, // Cast because type is number
  'eenheid': 'eenheid',
  'leverancier': 'leverancier'
};


/**
 * Parses a CSV file and uploads the material data to Firestore.
 * Updates existing materials based on a unique key (leverancier + omschrijving).
 * @param file The CSV file to upload.
 * @param userId The ID of the current user.
 * @returns An object with the count of updated/created materials.
 */
export async function uploadMaterialsCsv(file: File, userId: string): Promise<{ updatedCount: number }> {
    if (!userId) {
        throw new Error("Gebruiker is niet ingelogd.");
    }
    if (!file.type.includes('csv')) {
        throw new Error("Ongeldig bestandstype. Upload alleen CSV-bestanden.");
    }

    const text = await file.text();
    const rows = text.split(/\r?\n/).filter(Boolean); // Split into rows and remove empty ones
    
    if (rows.length < 2) {
        throw new Error("CSV is leeg of bevat alleen een header.");
    }

    const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
    const dataRows = rows.slice(1);

    // --- Stap 1: Haal bestaande materialen op om te checken op duplicaten ---
    const existingMaterialsQuery = query(collection(db, "materials"), where("userId", "==", userId));
    const querySnapshot = await getDocs(existingMaterialsQuery);
    const existingMaterials = new Map<string, { id: string }>();
    querySnapshot.forEach(doc => {
        const data = doc.data();
        const key = `${data.leverancier?.toLowerCase() || ''}|${data.omschrijving?.toLowerCase() || ''}`;
        existingMaterials.set(key, { id: doc.id });
    });

    // --- Stap 2: Bereid een batch write voor ---
    const batch = writeBatch(db);
    let processedCount = 0;

    for (const row of dataRows) {
        const values = row.split(',');
        const materialData: any = { userId, updatedAt: serverTimestamp() };
        
        headers.forEach((header, index) => {
            const firestoreField = CSV_HEADER_MAPPING[header];
            if (firestoreField) {
                let value: any = values[index]?.trim() || '';

                // Prijsverwerking: komma naar punt en parsen als float
                if (firestoreField === 'prijs') {
                    value = parseFloat(value.replace(',', '.')) || 0;
                }
                
                materialData[firestoreField] = value;
            }
        });
        
        // Sla over als essentiële velden ontbreken
        if (!materialData.omschrijving || !materialData.eenheid) continue;

        // --- Stap 3: Bepaal of het een nieuw of een te updaten document is ---
        const uniqueKey = `${materialData.leverancier?.toLowerCase() || ''}|${materialData.omschrijving?.toLowerCase() || ''}`;
        const existingDoc = existingMaterials.get(uniqueKey);

        if (existingDoc) {
            // Update bestaand document
            const docRef = doc(db, "materials", existingDoc.id);
            batch.update(docRef, materialData);
        } else {
            // Maak nieuw document
            const docRef = doc(collection(db, "materials"));
            batch.set(docRef, materialData);
        }
        processedCount++;
    }
    
    if (processedCount === 0) {
        throw new Error("Geen geldige rijen gevonden om te verwerken in de CSV.");
    }

    // --- Stap 4: Voer de batch write uit ---
    await batch.commit();

    return { updatedCount: processedCount };
}


export { app, auth, db, storage, serverTimestamp, addDoc, collection };
