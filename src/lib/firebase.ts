
'use client';

import { initializeFirebase, errorEmitter, FirestorePermissionError } from "@/firebase";
import { serverTimestamp, doc, setDoc, collection } from "firebase/firestore";

/**
 * A robust CSV parser that handles quoted fields.
 * It correctly maps headers from the first row to the values in subsequent rows.
 * @param csvText The raw CSV text.
 * @returns An array of objects, where each object represents a row.
 */
function robustCsvParse(csvText: string): Record<string, string>[] {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const dataRows = lines.slice(1);

    return dataRows.map(line => {
        const rowObject: Record<string, string> = {};
        // This regex handles comma-separated values, including quoted values that may contain commas.
        const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
        
        headers.forEach((header, index) => {
            if (values[index]) {
                // Remove quotes from the beginning and end of the string
                rowObject[header] = values[index].replace(/^"|"$/g, '').trim();
            } else {
                rowObject[header] = '';
            }
        });
        return rowObject;
    });
}


export async function uploadMaterialsCsv(file: File, userId: string) {
    const { firestore } = initializeFirebase();

    if (!userId) throw new Error("Geen gebruiker.");
    if (!file) throw new Error("Geen CSV geselecteerd.");

    const csvText = await file.text();
    const rows = robustCsvParse(csvText);

    if (rows.length === 0) {
        throw new Error("CSV bevat geen data of alleen een header.");
    }
    
    let count = 0;
    const materialsCollection = collection(firestore, "materials");

    for (const row of rows) {
        // Direct, 1-on-1 mapping from header names. NO transformations.
        const categorie = row['categorie'] || "";
        const materiaalnaam = row['materiaalnaam'] || "";
        const prijs = row['prijs'] || "";
        const eenheid = row['eenheid'] || "";
        const leverancier = row['leverancier'] || "";

        if (!leverancier || !materiaalnaam) {
            console.warn("Skipping row due to missing leverancier or materiaalnaam:", row);
            continue;
        }

        // Build document ID based on raw values, replacing only forbidden chars
        const forbiddenChars = /[\/\?\#\[\]]/g;
        const docId = `${leverancier}__${materiaalnaam}`.replace(forbiddenChars, "-");
            
        const materialData = {
            userId: userId,
            categorie: categorie,
            materiaalnaam: materiaalnaam,
            prijs: prijs, // Store as string, exactly as in CSV
            eenheid: eenheid,
            leverancier: leverancier,
            updatedAt: serverTimestamp(),
        };

        const docRef = doc(materialsCollection, docId);

        setDoc(docRef, materialData, { merge: true }).catch(error => {
            const permissionError = new FirestorePermissionError({
                path: docRef.path,
                operation: 'write', 
                requestResourceData: materialData,
            });
            errorEmitter.emit('permission-error', permissionError);
            console.error(`Failed to write document ${docId}:`, error, { originalError: error, customError: permissionError });
        });

        count++;
    }

    return { updatedCount: count };
}
