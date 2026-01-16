
import {
    doc,
    runTransaction,
    serverTimestamp,
    addDoc,
    collection,
    Firestore
} from 'firebase/firestore';

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
 * Creates a new empty quote document in Firestore immediately.
 * Uses 'concept' status and reserves a quote number.
 */
export async function createEmptyQuote(firestore: Firestore, userId: string): Promise<string> {
    const number = await reserveQuoteNumber(firestore, userId);

    const docRef = await addDoc(collection(firestore, 'quotes'), {
        userId,
        status: 'concept',
        offerteNummer: number,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        klantinformatie: {
            klanttype: 'Particulier', // Default
            // Initialize with empty strings if needed, or leave mostly empty.
            // We'll trust the form to fill these in on update.
        }
    });

    return docRef.id;
}
