import { initializeFirebase } from "@/firebase";
import { serverTimestamp, collection, writeBatch, query, where, getDocs, doc } from "firebase/firestore";
import type { Material } from './types';

// CSV Header mapping to Firestore fields
const CSV_HEADER_MAPPING: Record<string, keyof Omit<Material, 'id' | 'userId' | 'updatedAt'>> = {
  'categorie': 'categorie',
  'materiaalnaam': 'materiaalnaam',
  'prijs': 'prijs' as any, // Cast because type is number
  'eenheid': 'eenheid',
  'leverancier': 'leverancier'
};


/**
 * Parses a CSV file and uploads the material data to Firestore.
 * Updates existing materials based on a unique key (leverancier + materiaalnaam).
 * @param file The CSV file to upload.
 * @param userId The ID of the current user.
 * @returns An object with the count of updated/created materials.
 */
export async function uploadMaterialsCsv(file: File, userId: string): Promise<{ updatedCount: number }> {
    const { firestore } = initializeFirebase();
    
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
    const existingMaterialsQuery = query(collection(firestore, "materials"), where("userId", "==", userId));
    const querySnapshot = await getDocs(existingMaterialsQuery);
    const existingMaterials = new Map<string, { id: string }>();
    querySnapshot.forEach(doc => {
        const data = doc.data();
        const key = `${data.leverancier?.toLowerCase() || ''}|${data.materiaalnaam?.toLowerCase() || ''}`;
        existingMaterials.set(key, { id: doc.id });
    });

    // --- Stap 2: Bereid een batch write voor ---
    const batch = writeBatch(firestore);
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
        if (!materialData.materiaalnaam || !materialData.eenheid) continue;

        // --- Stap 3: Bepaal of het een nieuw of een te updaten document is ---
        const uniqueKey = `${materialData.leverancier?.toLowerCase() || ''}|${materialData.materiaalnaam?.toLowerCase() || ''}`;
        const existingDoc = existingMaterials.get(uniqueKey);

        if (existingDoc) {
            // Update bestaand document
            const docRef = doc(firestore, "materials", existingDoc.id);
            batch.update(docRef, materialData);
        } else {
            // Maak nieuw document
            const docRef = doc(collection(firestore, "materials"));
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

    