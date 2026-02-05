'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

export default function OffertesRedirectPage() {
    const router = useRouter();
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    useEffect(() => {
        if (isUserLoading || !user || !firestore) return;

        const redirectToLatestQuote = async () => {
            try {
                // Fetch user's quotes (without orderBy to avoid index requirement)
                const q = query(
                    collection(firestore, 'quotes'),
                    where('userId', '==', user.uid)
                );

                const snap = await getDocs(q);

                if (!snap.empty) {
                    // Sort client-side to find the most recent
                    const docs = snap.docs.map(doc => ({
                        id: doc.id,
                        createdAt: doc.data().createdAt
                    }));

                    // Sort by createdAt descending (most recent first)
                    docs.sort((a, b) => {
                        const aTime = a.createdAt?.toMillis?.() || 0;
                        const bTime = b.createdAt?.toMillis?.() || 0;
                        return bTime - aTime;
                    });

                    const latestQuoteId = docs[0].id;
                    router.replace(`/offertes/${latestQuoteId}`);
                } else {
                    // No quotes exist - redirect to create new quote
                    router.replace('/offertes/nieuw');
                }
            } catch (err) {
                console.error('Error fetching latest quote:', err);
                // Fallback to create new quote on error
                router.replace('/offertes/nieuw');
            }
        };

        redirectToLatestQuote();
    }, [user, isUserLoading, firestore, router]);

    return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
            <Loader2 className="animate-spin text-emerald-500 w-8 h-8" />
        </div>
    );
}
