'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '@/firebase';
import { getLocalDateKey } from '@/lib/quote-time-summary';

export interface TodayQuoteHours {
  workedHours: number;
  driveMinutes: number;
}

interface QuoteReference {
  id: string;
}

/** Returns booked hours recorded for the current local day, grouped by quote. */
export function useTodayQuoteHours(
  quotes: QuoteReference[] = [],
): Record<string, TodayQuoteHours> {
  const { user } = useUser();
  const [hoursByQuoteId, setHoursByQuoteId] = useState<Record<string, TodayQuoteHours>>({});
  const userRef = useRef(user);
  userRef.current = user;
  // Keep the polling callback independent from object identity changes.
  // Callers may construct the quote array inline. Depend on its stable IDs,
  // not on the array identity, so updating the fetched hours cannot restart
  // this effect indefinitely.
  const quoteIdsKey = quotes.map((quote) => quote.id).join('|');

  const loadHours = useCallback(async () => {
    const currentUser = userRef.current;
    if (!currentUser) {
      setHoursByQuoteId({});
      return;
    }

    try {
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/uren/entries?limit=1000', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; data?: unknown[] } | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) return;

      const quoteIds = new Set(quoteIdsKey ? quoteIdsKey.split('|') : []);
      const today = getLocalDateKey();
      const next: Record<string, TodayQuoteHours> = {};

      payload.data.forEach((raw) => {
        if (!raw || typeof raw !== 'object') return;
        const row = raw as Record<string, unknown>;
        const quoteId = String(row.quote_id ?? row.quoteId ?? '').trim();
        const workDate = String(row.work_date ?? row.workDate ?? row.date ?? '').trim();
        const hours = Number(row.worked_hours ?? row.workedHours ?? row.hours ?? 0);
        if (!quoteId || !quoteIds.has(quoteId) || workDate !== today || !Number.isFinite(hours) || hours <= 0) return;

        const current = next[quoteId]?.workedHours || 0;
        next[quoteId] = {
          workedHours: Number((current + hours).toFixed(2)),
          driveMinutes: 0,
        };
      });

      setHoursByQuoteId(next);
    } catch {
      // Uren mogen de offertepagina nooit blokkeren.
    }
  }, [quoteIdsKey]);

  useEffect(() => {
    void loadHours();
    const intervalId = window.setInterval(() => void loadHours(), 30_000);
    window.addEventListener('focus', loadHours);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', loadHours);
    };
  }, [loadHours]);

  return hoursByQuoteId;
}
