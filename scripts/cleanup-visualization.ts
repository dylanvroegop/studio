
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables (locally)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Initialize Firebase Admin
if (!getApps().length) {
    try {
        initializeApp({
            credential: applicationDefault(),
            projectId: 'studio-6011690104-60fbf',
        });
        console.log('Firebase Admin initialized.');
    } catch (error) {
        console.error('Failed to initialize Firebase Admin:', error);
        process.exit(1);
    }
}

const db = getFirestore();

async function cleanupVisualizationUrl() {
    const quoteId = 'q7oH9mtv4gEpP6gA73wi';
    const klusId = '3bde8136-ce4d-4a47-b1d6-bb5e7ad741d1';
    const docRef = db.collection('quotes').doc(quoteId);

    try {
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
            console.error(`Document quotes/${quoteId} not found.`);
            return;
        }

        const data = docSnap.data();
        const klus = data?.klussen?.[klusId];

        if (!klus) {
            console.error(`Klus ${klusId} not found in document.`);
            return;
        }

        if (!klus.visualisatieUrl) {
            console.log(`No visualisatieUrl found for klus ${klusId}. It might have been already deleted.`);
            return;
        }

        console.log(`Found visualisatieUrl: ${klus.visualisatieUrl}`);
        console.log('Deleting field...');

        // Use FieldValue.delete() to remove the specific nested field
        await docRef.update({
            [`klussen.${klusId}.visualisatieUrl`]: FieldValue.delete()
        });

        console.log('Successfully deleted visualisatieUrl.');

    } catch (error) {
        console.error('Error cleaning up visualization URL:', error);
    }
}

cleanupVisualizationUrl();
