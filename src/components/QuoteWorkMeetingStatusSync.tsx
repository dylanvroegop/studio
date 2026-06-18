'use client';

import { useEffect } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';

import { useFirestore, useUser } from '@/firebase';

const MAX_TIMEOUT_MS = 2_147_000_000;

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

export function QuoteWorkMeetingStatusSync(): null {
  const firestore = useFirestore();
  const { user } = useUser();

  useEffect(() => {
    if (!firestore || !user) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const planningQuery = query(
      collection(firestore, 'planning_entries'),
      where('userId', '==', user.uid),
    );

    const unsubscribe = onSnapshot(planningQuery, (snapshot) => {
      if (timer) clearTimeout(timer);

      const meetings = snapshot.docs
        .map((entry) => entry.data())
        .filter((entry) => entry.planningType === 'werkbespreking' && entry.status !== 'cancelled')
        .map((entry) => ({ quoteId: String(entry.quoteId || ''), startDate: toDate(entry.startDate) }))
        .filter((entry): entry is { quoteId: string; startDate: Date } => !!entry.quoteId && !!entry.startDate)
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

      const synchronize = async (): Promise<void> => {
        if (disposed) return;
        const now = Date.now();
        const dueQuoteIds = new Set(
          meetings.filter((entry) => entry.startDate.getTime() <= now).map((entry) => entry.quoteId),
        );

        await Promise.all(Array.from(dueQuoteIds).map(async (quoteId) => {
          await runTransaction(firestore, async (transaction) => {
            const ref = doc(firestore, 'quotes', quoteId);
            const quote = await transaction.get(ref);
            if (!quote.exists() || quote.data()?.status !== 'werkbespreking') return;
            transaction.update(ref, { status: 'concept', updatedAt: serverTimestamp() });
          });
        }));

        const nextMeeting = meetings.find((entry) => entry.startDate.getTime() > Date.now());
        if (!nextMeeting || disposed) return;
        const delay = Math.min(MAX_TIMEOUT_MS, Math.max(0, nextMeeting.startDate.getTime() - Date.now()));
        timer = setTimeout(() => void synchronize(), delay);
      };

      void synchronize().catch((error) => {
        console.error('Kon werkbesprekingstatus niet automatisch bijwerken:', error);
      });
    });

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [firestore, user]);

  return null;
}
