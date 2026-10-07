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
import { findQuoteIdsForMeeting, type WorkMeetingQuote } from '@/lib/quote-work-meeting';

const MAX_TIMEOUT_MS = 2_147_000_000;

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function getQuoteClientName(data: Record<string, unknown>): string {
  const info = data.klantinformatie;
  if (!info || typeof info !== 'object' || Array.isArray(info)) return '';
  const client = info as Record<string, unknown>;
  const company = String(client.bedrijfsnaam || '').trim();
  if (company) return company;
  return `${String(client.voornaam || '').trim()} ${String(client.achternaam || '').trim()}`.trim();
}

export function QuoteWorkMeetingStatusSync(): null {
  const firestore = useFirestore();
  const { user } = useUser();

  useEffect(() => {
    if (!firestore || !user) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let planningRows: Array<{
      quoteId: string;
      clientName: string;
      startDate: Date;
    }> = [];
    let quoteRows: WorkMeetingQuote[] = [];
    let synchronizationInProgress = false;
    let synchronizationQueued = false;

    const planningQuery = query(
      collection(firestore, 'planning_entries'),
      where('userId', '==', user.uid),
      where('planningType', '==', 'werkbespreking'),
    );

    const synchronize = async (): Promise<void> => {
      if (disposed) return;
      if (synchronizationInProgress) {
        synchronizationQueued = true;
        return;
      }

      synchronizationInProgress = true;
      if (timer) clearTimeout(timer);

      const meetings = planningRows
        .flatMap((entry) => findQuoteIdsForMeeting(entry, quoteRows).map((quoteId) => ({
          quoteId,
          startDate: entry.startDate,
        })))
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

      try {
        const now = Date.now();
        const dueQuoteIds = new Set(
          meetings.filter((entry) => entry.startDate.getTime() <= now).map((entry) => entry.quoteId),
        );

        await Promise.all(Array.from(dueQuoteIds).map(async (quoteId) => {
          await runTransaction(firestore, async (transaction) => {
            const ref = doc(firestore, 'quotes', quoteId);
            const quote = await transaction.get(ref);
            if (!quote.exists() || quote.data()?.status !== 'werkbespreking'
              || quote.data()?.archived === true || quote.data()?.userId !== user.uid) return;
            transaction.update(ref, { status: 'concept', updatedAt: serverTimestamp() });
          });
        }));

        const nextMeeting = meetings.find((entry) => entry.startDate.getTime() > Date.now());
        if (!nextMeeting || disposed) return;
        const delay = Math.min(MAX_TIMEOUT_MS, Math.max(0, nextMeeting.startDate.getTime() - Date.now()));
        timer = setTimeout(() => void synchronize(), delay);
      } finally {
        synchronizationInProgress = false;
        if (synchronizationQueued && !disposed) {
          synchronizationQueued = false;
          void synchronize();
        }
      }
    };

    const unsubscribePlanning = onSnapshot(planningQuery, (snapshot) => {
      planningRows = snapshot.docs
        .map((entry) => entry.data())
        .filter((entry) => entry.planningType === 'werkbespreking' && entry.status !== 'cancelled' && entry.status !== 'pending')
        .map((entry) => ({
          quoteId: String(entry.quoteId || ''),
          clientName: String(entry.cache?.clientName || entry.cache?.projectTitle || ''),
          startDate: toDate(entry.startDate),
        }))
        .filter((entry): entry is { quoteId: string; clientName: string; startDate: Date } => !!entry.startDate);
      void synchronize().catch((error) => {
        console.error('Kon werkbesprekingstatus niet automatisch bijwerken:', error);
      });
    });

    const unsubscribeQuotes = onSnapshot(
      query(collection(firestore, 'quotes'), where('userId', '==', user.uid)),
      (snapshot) => {
        quoteRows = snapshot.docs.map((quote) => {
          const data = quote.data() as Record<string, unknown>;
          const client = data.klantinformatie as Record<string, unknown> | undefined;
          return {
            id: quote.id,
            clientId: String(data.clientId || client?.clientId || ''),
            clientName: getQuoteClientName(data),
            archived: data.archived === true,
            status: String(data.status || ''),
          };
        });
        void synchronize().catch((error) => {
          console.error('Kon werkbesprekingstatus niet automatisch bijwerken:', error);
        });
      },
    );

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      unsubscribePlanning();
      unsubscribeQuotes();
    };
  }, [firestore, user]);

  return null;
}
