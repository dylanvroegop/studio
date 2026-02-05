
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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
    } catch (error) {
        console.error('Failed to initialize Firebase Admin:', error);
        process.exit(1);
    }
}

const db = getFirestore();

async function countKlussen() {
    const quoteId = 'q7oH9mtv4gEpP6gA73wi';
    const docRef = db.collection('quotes').doc(quoteId);

    try {
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
            console.log('Document not found');
            return;
        }
        const data = docSnap.data();
        const klussen = data?.klussen || {};
        const keys = Object.keys(klussen);
        console.log(`Number of klussen keys: ${keys.length}`);
        keys.forEach(key => {
            const klus = klussen[key];
            console.log(`- Klus ID: ${key}`);
            if (klus.materialen?.savedAt) {
                console.log(`  - materialen.savedAt: ${klus.materialen.savedAt.toDate()}`);
            }
            if (klus.updatedAt) {
                console.log(`  - updatedAt: ${klus.updatedAt.toDate()}`);
            }
        });

    } catch (error) {
        console.error('Error:', error);
    }
}

countKlussen();
