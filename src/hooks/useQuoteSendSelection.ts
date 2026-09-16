'use client';
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { isMatchingDraft, quoteSendPrice, type SendableQuote } from '@/lib/quote-send-selection';
import { formatOfferteNummerLabel } from '@/lib/quote-number';
import type { QuoteSendOption } from '@/components/quote/SendQuoteWhatsAppModal';

export function useQuoteSendSelection(isOpen: boolean, current: SendableQuote | null, currentPrice: number) {
    const firestore = useFirestore();
    const { user } = useUser();
    const [drafts, setDrafts] = useState<SendableQuote[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (!isOpen || !firestore || !user) return;
        setDrafts([]);
        setLoading(true);
        setError(null);
        return onSnapshot(query(collection(firestore, 'quotes'), where('userId', '==', user.uid)), (snapshot) => {
            setDrafts(snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id } as SendableQuote)));
            setLoading(false);
        }, () => {
            setError('Conceptoffertes laden mislukt. Sluit dit scherm en probeer opnieuw.');
            setLoading(false);
        });
    }, [isOpen, firestore, user]);
    const options: QuoteSendOption[] = current ? [current, ...drafts.filter((quote) => isMatchingDraft(quote, current))
        .sort((a, b) => (b.offerteNummer || 0) - (a.offerteNummer || 0))].map((quote) => ({
            id: quote.id,
            number: formatOfferteNummerLabel(quote.offerteNummer, quote.offerteVersie),
            title: quote.titel || quote.werkomschrijving || '',
            price: quote.id === current.id ? currentPrice : quoteSendPrice(quote),
        })) : [];
    return { currentId: current?.id || '', options, loading, error };
}
