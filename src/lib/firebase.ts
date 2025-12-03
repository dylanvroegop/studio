'use client';

import { initializeFirebase, errorEmitter, FirestorePermissionError } from "@/firebase";
import { serverTimestamp, doc, setDoc, collection } from "firebase/firestore";

/**
 * Parses a CSV string into an array of objects, using the first row as headers.
 * This is a simple, dependency-free parser.
 * @param csvText The raw CSV text.
 * @returns An array of objects, where each object represents a row.
 */
function simpleCsvParse(csvText: string): Record<string, string>[] {
    const lines = csvText.split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = lines[i].split(',');
        const row: Record<string, string> = {};

        for (let j = 0; j < headers.length; j++) {
            const header = headers[j];
            if (header) {
                row[header] = values[j] || "";
            }
        }
        data.push(row);
    }
    return data;
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
        const categorie = row['categorie'];
        const materiaalnaam = row['materiaalnaam'];
        const prijs = row['prijs'];
        const eenheid = row['eenheid'];
        const leverancier = row['leverancier'];

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
            categorie: categorie || "",
            materiaalnaam: materiaalnaam || "",
            prijs: prijs || "",
            eenheid: eenheid || "",
            leverancier: leverancier || "",
            updatedAt: serverTimestamp(),
        };

        const docRef = doc(materialsCollection, docId);

        // Use setDoc to create or completely overwrite the document.
        // This ensures the data in Firestore is an exact 1:1 match with the CSV row.
        setDoc(docRef, materialData).catch(error => {
            // This is the error handling architecture from previous steps
            errorEmitter.emit(
                'permission-error',
                new FirestorePermissionError({
                    path: docRef.path,
                    operation: 'write', 
                    requestResourceData: materialData,
                })
            );
            console.error(`Failed to write document ${docId}:`, error);
        });

        count++;
    }

    return { updatedCount: count };
}