import { doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import { isMatchingDraft, quoteSendPrice, type SendableQuote } from './quote-send-selection';

import { readSharedQuoteAmount, type SharedQuoteAmount } from './quote-shared-amount';

interface MarkQuoteSelectionOptions {
    firestore: Firestore;
    userId: string;
    currentQuote: SendableQuote;
    selectedIds: string[];
    currentTotal: number;
    sharedAmounts?: SharedQuoteAmount[];
}

export async function markQuoteSelectionAsSent({ firestore, userId, currentQuote, selectedIds, currentTotal, sharedAmounts }: MarkQuoteSelectionOptions): Promise<void> {
    if (!selectedIds.length) throw new Error('Selecteer minimaal één offerte.');
    if (sharedAmounts && (sharedAmounts.length !== new Set(selectedIds).size
        || selectedIds.some(id => sharedAmounts.filter(item => item.quoteId === id && readSharedQuoteAmount(item)).length !== 1))) {
        throw new Error('Het gedeelde PDF-bedrag ontbreekt. Bereid de PDF opnieuw voor.');
    }
    await runTransaction(firestore, async (transaction) => {
        const snapshots = await Promise.all([...new Set(selectedIds)].map((quoteId) => transaction.get(doc(firestore, 'quotes', quoteId))));
        for (const snapshot of snapshots) {
            if (!snapshot.exists()) throw new Error('Een geselecteerde offerte bestaat niet meer.');
            const selected = { ...snapshot.data(), id: snapshot.id } as SendableQuote;
            const shared = sharedAmounts?.find(item => item.quoteId === selected.id);
            const previous = snapshot.data();
            const retryOfSamePdf = shared && previous.whatsappQuoteSnapshotHistory?.[shared.id]
                && isMatchingDraft({ ...selected, status: 'concept' }, currentQuote);
            if (selected.userId !== userId || (selected.id !== currentQuote.id && !isMatchingDraft(selected, currentQuote) && !retryOfSamePdf)) {
                throw new Error('De selectie is gewijzigd. Open het verstuurscherm opnieuw.');
            }
            const update: Record<string, unknown> = { updatedAt: serverTimestamp() };
            if (!['geaccepteerd', 'afgewezen', 'verlopen'].includes(selected.status)) update.status = 'verzonden';
            else if (!shared) continue;
            if (shared && !previous.whatsappQuoteSnapshotHistory?.[shared.id]) {
                update[`whatsappQuoteSnapshotHistory.${shared.id}`] = shared;
                const latest = readSharedQuoteAmount(previous.whatsappQuoteSnapshot);
                if (!latest || shared.sharedAt >= latest.sharedAt) update.whatsappQuoteSnapshot = shared;
            }
            const original = selected.financieel?.oorspronkelijkePrijsInclBtw;
            if (typeof original !== 'number' || !Number.isFinite(original) || original < 0) {
                update['financieel.oorspronkelijkePrijsInclBtw'] = (shared ? shared.amountCents / 100 : quoteSendPrice(selected))
                    ?? (selected.id === currentQuote.id ? currentTotal : 0);
            }
            transaction.update(snapshot.ref, update);
        }
    });
}
