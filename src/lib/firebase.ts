
import { initializeFirebase } from "@/firebase";
import { serverTimestamp, collection, writeBatch, query, where, getDocs, doc } from "firebase/firestore";
import type { Material } from './types';

/**
 * Parses a string in European currency format (e.g., "1.234,56") to a number.
 * @param value The string value to parse.
 * @returns The parsed number, or 0 if parsing fails.
 */
function parseEuroToNumber(value: string | undefined | null): number {
    if (!value) {
        return 0;
    }
    const stringValue = String(value).trim();
    // 1. Remove thousand separators ('.')
    // 2. Replace the decimal comma ',' with a decimal point '.'
    const normalizedValue = stringValue.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(normalizedValue);
    return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parses a CSV file and uploads the material data to Firestore.
 * It uses the CSV headers for mapping and updates existing materials
 * based on a unique key (leverancier + materiaalnaam).
 * @param file The CSV file to upload.
 * @param userId The ID of the current user.
 * @returns An object with the count of processed materials.
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
    const allRowsText = text.split(/\r?\n/).filter(Boolean);

    if (allRowsText.length < 2) {
        throw new Error("CSV is leeg of bevat alleen een header.");
    }

    const headerRow = allRowsText[0];
    const dataRowsText = allRowsText.slice(1);
    
    const headers = headerRow.split(',').map(h => h.trim().toLowerCase());
    
    const requiredHeaders = ['categorie', 'materiaalnaam', 'prijs', 'eenheid', 'leverancier'];
    for(const requiredHeader of requiredHeaders) {
        if (!headers.includes(requiredHeader)) {
             throw new Error(`CSV-bestand mist de verplichte kolom: '${requiredHeader}'.`);
        }
    }
    
    const dataRows = dataRowsText.map(row => {
        const values = row.split(',');
        const rowData: Record<string, string> = {};
        headers.forEach((header, index) => {
            rowData[header] = values[index] || '';
        });
        return rowData;
    });


    // --- Stap 1: Haal bestaande materialen op om te checken op duplicaten ---
    const materialsRef = collection(firestore, "materials");
    const existingMaterialsQuery = query(materialsRef, where("userId", "==", userId));
    const querySnapshot = await getDocs(existingMaterialsQuery);
    
    const existingMaterials = new Map<string, string>(); // Map 'leverancier|materiaalnaam' -> docId
    querySnapshot.forEach(doc => {
        const data = doc.data();
        const key = `${data.leverancier?.trim().toLowerCase() || ''}|${data.materiaalnaam?.trim().toLowerCase() || ''}`;
        if (key !== '|') {
            existingMaterials.set(key, doc.id);
        }
    });

    // --- Stap 2: Bereid een batch write voor ---
    const batch = writeBatch(firestore);
    let processedCount = 0;
    let logCount = 0;

    for (const row of dataRows) {
        
        const categorie = String(row['categorie'] || '').trim();
        const materiaalnaam = String(row['materiaalnaam'] || '').trim();
        const eenheid = String(row['eenheid'] || '').trim();
        const leverancier = String(row['leverancier'] || '').trim();
        const prijs = parseEuroToNumber(row['prijs']);
        
        // Debug log for the first 3 rows
        if (logCount < 3) {
            console.log('Parsed CSV row:', { categorie, materiaalnaam, eenheid, leverancier, prijs });
            logCount++;
        }

        if (!materiaalnaam || !leverancier) {
            continue;
        }
        
        let finalCategorie = categorie;
        if (finalCategorie.toLowerCase().startsWith('categorie:')) {
            finalCategorie = finalCategorie.substring(10).trim();
        }

        const materialData = {
            userId: userId,
            categorie: finalCategorie,
            materiaalnaam: materiaalnaam,
            prijs: prijs,
            eenheid: eenheid,
            leverancier: leverancier,
            updatedAt: serverTimestamp(),
        };

        const uniqueKey = `${leverancier.toLowerCase()}|${materiaalnaam.toLowerCase()}`;
        const existingDocId = existingMaterials.get(uniqueKey);

        if (existingDocId) {
            const docRef = doc(firestore, "materials", existingDocId);
            batch.update(docRef, materialData);
        } else {
            const docRef = doc(collection(firestore, "materials"));
            batch.set(docRef, materialData);
        }
        processedCount++;
    }

    if (processedCount === 0) {
        throw new Error("Geen geldige rijen gevonden om te verwerken in de CSV.");
    }

    await batch.commit();

    return { updatedCount: processedCount };
}
