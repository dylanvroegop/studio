// --- SUPER SIMPLE CSV IMPORTER ---
// CSV → Firestore with 1:1 mapping
// No magic. No transformations. No formatting.

import { initializeFirebase, errorEmitter, FirestorePermissionError } from "@/firebase";
import { serverTimestamp, doc, setDoc } from "firebase/firestore";

export async function uploadMaterialsCsv(file: File, userId: string) {
    const { firestore } = initializeFirebase();

    if (!userId) throw new Error("Geen gebruiker.");
    if (!file) throw new Error("Geen CSV geselecteerd.");

    const csvText = await file.text();

    // Split into rows
    const rows = csvText.split(/\r?\n/).filter(r => r.trim() !== "");

    if (rows.length < 2) throw new Error("CSV bevat geen data.");

    // First row is header
    const headers = rows[0].split(",");

    let count = 0;

    for (let i = 1; i < rows.length; i++) {
        const line = rows[i];
        if (!line.trim()) continue;

        const values = line.split(",");

        // Map raw row into object
        const row: Record<string,string> = {};
        headers.forEach((h, index) => {
            row[h] = values[index] || "";
        });

        // Extract fields RAW
        const categorie = row["categorie"];
        const materiaalnaam = row["materiaalnaam"];
        const prijs = row["prijs"];
        const eenheid = row["eenheid"];
        const leverancier = row["leverancier"];

        if (!materiaalnaam || !leverancier) continue;

        // Build document ID
        const forbidden = /[\/\?\#\[\]]/g;
        const docId =
            `${leverancier}__${materiaalnaam}`.replace(forbidden, "-");
            
        const materialData = {
            userId: userId,
            categorie: categorie,
            materiaalnaam: materiaalnaam,
            prijs: prijs, // store EXACT string from CSV
            eenheid: eenheid,
            leverancier: leverancier,
            updatedAt: serverTimestamp(),
        };

        const docRef = doc(firestore, "materials", docId);

        // Save to Firestore EXACT as CSV
        setDoc(docRef, materialData).catch(error => {
            errorEmitter.emit(
                'permission-error',
                new FirestorePermissionError({
                    path: docRef.path,
                    operation: 'write',
                    requestResourceData: materialData,
                })
            );
        });

        count++;
    }

    return { updatedCount: count };
}
