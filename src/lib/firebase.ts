'use client';

import { initializeFirebase, errorEmitter, FirestorePermissionError } from "@/firebase";
import { serverTimestamp, doc, setDoc, collection } from "firebase/firestore";

/**
 * Parses a CSV string into an array of objects, using the first row as headers.
 * This parser correctly maps headers to values.
 * @param csvText The raw CSV text.
 * @returns An array of objects, where each object represents a row.
 */
function simpleCsvParse(csvText: string): Record<string, string>[] {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const dataRows = lines.slice(1);

    return dataRows.map(line => {
        const values = line.split(',');
        const rowObject: Record<string, string> = {};
        headers.forEach((header, index) => {
            rowObject[header] = values[index];
        });
        return rowObject;
    });
}


export async function uploadMaterialsCsv(file: File, userId: string) {
    const { firestore } = initializeFirebase();

    if (!userId) throw new Error("Geen gebruiker.");
    if (!file) throw new Error("Geen CSV geselecteerd.");

    const csvText = await file.text();
    const rows = simpleCsvParse(csvText);

    if (rows.length === 0) {
        throw new Error("CSV bevat geen data of alleen een header.");
    }
    
    let count = 0;
    const materialsCollection = collection(firestore, "materials");

    for (const row of rows) {
        // Direct mapping from header names. NO transformations.
        const categorie = row['categorie'] || "";
        const materiaalnaam = row['materiaalnaam'] || "";
        const prijs = row['prijs'] || "";
        const eenheid = row['eenheid'] || "";
        const leverancier = row['leverancier'] || "";

        // Skip row if essential fields for ID are missing
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

        // Use setDoc to create or completely overwrite the document.
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
