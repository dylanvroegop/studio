
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { createEmptyQuote } from '@/lib/firestore-actions';

export default function NewQuoteRedirect() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  useEffect(() => {
    if (isUserLoading || !user || !firestore) return;

    let cancelled = false;
    (async () => {
      try {
        const quoteId = await createEmptyQuote(firestore, user.uid);
        if (!cancelled) router.replace(`/offertes/${quoteId}/klant`);
      } catch (error) {
        console.error('Fout bij starten nieuwe offerte:', error);
        if (!cancelled) router.replace('/offertes');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [firestore, isUserLoading, router, user]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
