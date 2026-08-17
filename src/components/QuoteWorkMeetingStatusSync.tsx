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

function normalizeName(value: string): string {
  return value
    .replace(/^\d{1,2}:\d{2}\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getQuoteClientName(data: Record<string, unknown>): string {
  const info = data.klantinformatie;
  if (!info || typeof info !== 'object' || Array.isArray(info)) return '';
  const client = info as Record<string, unknown>;
  const company = String(client.bedrijfsnaam || '').trim();
  if (company) return company;
  return `${String(client.voornaam || '').trim()} ${String(client.achternaam || '').trim()}`.trim();
}

function findQuoteIdForMeeting(
  clientName: string,
  quotes: Array<{ id: string; clientName: string; archived: boolean; status: string }>,
): string | null {
  const normalizedMeetingName = normalizeName(clientName);
  if (!normalizedMeetingName) return null;

  const activeQuotes = quotes.filter((quote) => !quote.archived && quote.status === 'werkbespreking');
  const exactMatches = activeQuotes.filter((quote) => normalizeName(quote.clientName) === normalizedMeetingName);
  if (exactMatches.length === 1) return exactMatches[0].id;

  const firstName = normalizedMeetingName.split(' ')[0];
  const firstNameMatches = activeQuotes.filter((quote) => normalizeName(quote.clientName).split(' ')[0] === firstName);
  return firstNameMatches.length === 1 ? firstNameMatches[0].id : null;
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
    let quoteRows: Array<{ id: string; clientName: string; archived: boolean; status: string }> = [];
    let synchronizationInProgress = false;
    let synchronizationQueued = false;

    const planningQuery = query(
      collection(firestore, 'planning_entries'),
      where('userId', '==', user.uid),
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
        .map((entry) => ({
          quoteId: entry.quoteId || findQuoteIdForMeeting(entry.clientName, quoteRows) || '',
          startDate: entry.startDate,
        }))
        .filter((entry): entry is { quoteId: string; startDate: Date } => !!entry.quoteId)
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
            if (!quote.exists() || quote.data()?.status !== 'werkbespreking') return;
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
        .filter((entry) => entry.planningType === 'werkbespreking' && entry.status !== 'cancelled')
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
          return {
            id: quote.id,
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
