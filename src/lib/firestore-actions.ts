
import {
    doc,
    runTransaction,
    serverTimestamp,
    addDoc,
    collection,
    Firestore,
    getDoc
} from 'firebase/firestore';
import { buildEmptyQuoteDefaults } from '@/lib/quote-defaults';

/**
 * Reserves the next available quote number for a specific user.
 * Increments the counter in `counters/quoteNumber_{userId}`.
 */
export async function reserveQuoteNumber(firestore: Firestore, userId: string, startNumber = 260001): Promise<number> {
    const counterRef = doc(firestore, 'counters', `quoteNumber_${userId}`);

    return await runTransaction(firestore, async (tx) => {
        const snap = await tx.get(counterRef);

        const currentNext: number =
            snap.exists() && typeof snap.data()?.next === 'number'
                ? snap.data().next
                : startNumber;

        const nextVal = currentNext + 1;

        // Update the counter
        tx.set(
            counterRef,
            {
                next: nextVal,
                updatedAt: serverTimestamp(),
                userId,
            },
            { merge: true }
        );

        return currentNext;
    });
}

/**
 * Reserves the next available invoice number for a specific user.
 * Increments the counter in `counters/invoiceNumber_{userId}`.
 *
 * Uses `startNumberFromSettings` ONLY when the counter does not exist yet.
 */
export async function reserveInvoiceNumber(
    firestore: Firestore,
    userId: string,
    startNumberFromSettings: number
): Promise<number> {
    const counterRef = doc(firestore, 'counters', `invoiceNumber_${userId}`);

    return await runTransaction(firestore, async (tx) => {
        const snap = await tx.get(counterRef);

        const currentNext: number =
            snap.exists() && typeof snap.data()?.next === 'number'
                ? snap.data().next
                : startNumberFromSettings;

        const nextVal = currentNext + 1;

        tx.set(
            counterRef,
            {
                next: nextVal,
                updatedAt: serverTimestamp(),
                userId,
            },
            { merge: true }
        );

        return currentNext;
    });
}

/**
 * Creates a new empty quote document in Firestore immediately.
 * Uses 'werkbespreking' status and reserves a quote number.
 */
export async function createEmptyQuote(firestore: Firestore, userId: string): Promise<string> {
    const number = await reserveQuoteNumber(firestore, userId);

    let defaults = buildEmptyQuoteDefaults();
    try {
        const userSnap = await getDoc(doc(firestore, 'users', userId));
        if (userSnap.exists()) defaults = buildEmptyQuoteDefaults(userSnap.data());
    } catch (error) {
        console.error('Error fetching user settings for new quote defaults:', error);
    }

    const docRef = await addDoc(collection(firestore, 'quotes'), {
        userId,
        status: 'werkbespreking',
        offerteNummer: number,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        klantinformatie: {
            klanttype: 'Particulier', // Default
            // Initialize with empty strings if needed, or leave mostly empty.
            // We'll trust the form to fill these in on update.
        },
        ...defaults,
    });

    return docRef.id;
}
