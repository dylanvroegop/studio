
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { Firestore } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { createEmptyQuote } from '@/lib/firestore-actions';

// In dev (React Strict Mode) mount-effects can run twice.
// Keep a per-user in-flight promise so a single navigation creates only one quote.
const inFlightQuoteCreates = new Map<string, Promise<string>>();

function createEmptyQuoteDeduped(firestore: Firestore, userId: string): Promise<string> {
  const existing = inFlightQuoteCreates.get(userId);
  if (existing) return existing;

  const promise = createEmptyQuote(firestore, userId).finally(() => {
    inFlightQuoteCreates.delete(userId);
  });

  inFlightQuoteCreates.set(userId, promise);
  return promise;
}

async function ensureManualQuoteData(quoteId: string, token: string): Promise<void> {
  const response = await fetch('/api/quotes/ensure-data-json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ quoteId }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.message || 'Kon lege offerte-data niet initialiseren.');
  }
}

export default function NewQuoteRedirect() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  useEffect(() => {
    if (isUserLoading || !user || !firestore) return;

    let cancelled = false;
    (async () => {
      try {
        const quoteId = await createEmptyQuoteDeduped(firestore, user.uid);
        const token = await user.getIdToken();
        await ensureManualQuoteData(quoteId, token);
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
