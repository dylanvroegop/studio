import { doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import { isMatchingDraft, quoteSendPrice, type SendableQuote } from './quote-send-selection';

interface MarkQuoteSelectionOptions {
    firestore: Firestore;
    userId: string;
    currentQuote: SendableQuote;
    selectedIds: string[];
    currentTotal: number;
}

export async function markQuoteSelectionAsSent({ firestore, userId, currentQuote, selectedIds, currentTotal }: MarkQuoteSelectionOptions): Promise<void> {
    if (!selectedIds.length) throw new Error('Selecteer minimaal één offerte.');
    await runTransaction(firestore, async (transaction) => {
        const snapshots = await Promise.all([...new Set(selectedIds)].map((quoteId) => transaction.get(doc(firestore, 'quotes', quoteId))));
        for (const snapshot of snapshots) {
            if (!snapshot.exists()) throw new Error('Een geselecteerde offerte bestaat niet meer.');
            const selected = { ...snapshot.data(), id: snapshot.id } as SendableQuote;
            if (selected.userId !== userId || (selected.id !== currentQuote.id && !isMatchingDraft(selected, currentQuote))) {
                throw new Error('De selectie is gewijzigd. Open het verstuurscherm opnieuw.');
            }
            if (['geaccepteerd', 'afgewezen', 'verlopen'].includes(selected.status)) continue;
            const update: Record<string, unknown> = { status: 'verzonden', updatedAt: serverTimestamp() };
            const original = selected.financieel?.oorspronkelijkePrijsInclBtw;
            if (typeof original !== 'number' || !Number.isFinite(original) || original < 0) {
                update['financieel.oorspronkelijkePrijsInclBtw'] = quoteSendPrice(selected)
                    ?? (selected.id === currentQuote.id ? currentTotal : 0);
            }
            transaction.update(snapshot.ref, update);
        }
    });
}
