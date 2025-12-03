// --- SUPER SIMPLE CSV IMPORTER ---
// CSV → Firestore with 1:1 mapping
// No magic. No transformations. No formatting.

import { initializeFirebase } from "@/firebase";
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

    // Expected order EXACT: categorie,materiaalnaam,prijs,eenheid,leverancier
    const required = ["categorie","materiaalnaam","prijs","eenheid","leverancier"];
    for (const r of required) {
        if (!headers.includes(r)) {
            throw new Error(`Kolom '${r}' ontbreekt in CSV.`);
        }
    }

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

        // Save to Firestore EXACT as CSV
        await setDoc(doc(firestore, "materials", docId), {
            userId: userId,
            categorie: categorie,
            materiaalnaam: materiaalnaam,
            prijs: prijs, // store EXACT string from CSV
            eenheid: eenheid,
            leverancier: leverancier,
            updatedAt: serverTimestamp(),
        });

        count++;
    }

    return { updatedCount: count };
}
