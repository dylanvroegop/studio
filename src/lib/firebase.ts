
import { initializeFirebase } from "@/firebase";
import { serverTimestamp, collection, writeBatch, doc, getFirestore } from "firebase/firestore";

/**
 * Creates a Firestore-safe document ID from supplier and material name.
 * Replaces forbidden characters with a hyphen.
 * @param leverancier The supplier name.
 * @param materiaalnaam The material name.
 * @returns A Firestore-safe document ID.
 */
function createMaterialDocId(leverancier: string, materiaalnaam: string): string {
    const combined = `${leverancier}__${materiaalnaam}`;
    // Replace forbidden characters: / ? # [ ]
    return combined.replace(/[\/\?#\[\]]/g, '-');
}


/**
 * Parses a CSV file and uploads the material data to Firestore with minimal processing.
 * It uses the CSV headers for mapping and overwrites existing materials based on a generated document ID.
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
    
    // 1. Use the first row as headers
    const headers = headerRow.split(',').map(h => h.trim());
    
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

    const materialsRef = collection(firestore, "materials");
    const batch = writeBatch(firestore);
    let processedCount = 0;
   
    for (const row of dataRows) {
        // 1. & 4. Use header names to read values and keep them as strings
        const categorie = row['categorie'] || '';
        const materiaalnaam = row['materiaalnaam'] || '';
        const eenheid = row['eenheid'] || '';
        const leverancier = row['leverancier'] || '';
        const prijs = row['prijs'] || ''; // Keep price as a string

        if (!materiaalnaam || !leverancier) {
            continue; // Skip rows without essential identifiers
        }

        // 2. Create document ID
        const docId = createMaterialDocId(leverancier, materiaalnaam);
        
        // The document reference points to a specific document for a specific user
        // But Firestore rules handle user-specific writes, so we just use the generated ID.
        // We will store userId in the document itself to query on.
        const docRef = doc(materialsRef, docId);

        const materialData = {
          userId: userId,
          categorie: categorie,
          materiaalnaam: materiaalnaam,
          prijs: prijs,
          eenheid: eenheid,
          leverancier: leverancier,
          updatedAt: serverTimestamp()
        };

        // 3. Overwrite if exists (setDoc does this automatically)
        // Note: The security rule `isOwner(request.resource.data.userId)` will ensure a user
        // can only write/overwrite documents that contain their own userId.
        batch.set(docRef, materialData);
        
        processedCount++;
    }

    if (processedCount === 0) {
        throw new Error("Geen geldige rijen gevonden om te verwerken in de CSV.");
    }

    await batch.commit();

    return { updatedCount: processedCount };
}
