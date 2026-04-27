
'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const searchParams = useSearchParams();
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

        const returnTo = searchParams.get('returnTo');
        let successRedirect: string | undefined;

        if (returnTo === 'planningSchedule') {
          const scheduleType = searchParams.get('scheduleType') === 'werkbespreking' ? 'werkbespreking' : 'job';
          const view = (() => {
            const raw = searchParams.get('view');
            if (raw === 'day' || raw === 'week' || raw === 'month') return raw;
            return 'week';
          })();
          const prefillDate = (searchParams.get('prefillDate') || '').trim();
          const prefillTime = (searchParams.get('prefillTime') || '').trim();
          const prefillEmployeeId = (searchParams.get('prefillEmployeeId') || '').trim();
          const prefillHoursRaw = Number(searchParams.get('prefillHours') || '');
          const openScheduleModal = searchParams.get('openScheduleModal') === '1';

          const planningParams = new URLSearchParams({
            mode: 'schedule',
            quoteId,
            hours: String(Number.isFinite(prefillHoursRaw) && prefillHoursRaw > 0 ? prefillHoursRaw : 0),
            view,
            scheduleType,
          });

          if (openScheduleModal) {
            planningParams.set('openScheduleModal', '1');
          }
          if (/^\d{4}-\d{2}-\d{2}$/.test(prefillDate)) {
            planningParams.set('prefillDate', prefillDate);
          }
          if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(prefillTime)) {
            planningParams.set('prefillTime', prefillTime);
          }
          if (prefillEmployeeId) {
            planningParams.set('prefillEmployeeId', prefillEmployeeId);
          }

          successRedirect = `/planning?${planningParams.toString()}`;
        }

        const target = successRedirect
          ? `/offertes/${quoteId}/klant?successRedirect=${encodeURIComponent(successRedirect)}`
          : `/offertes/${quoteId}/klant`;

        if (!cancelled) router.replace(target);
      } catch (error) {
        console.error('Fout bij starten nieuwe offerte:', error);
        if (!cancelled) router.replace('/offertes');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [firestore, isUserLoading, router, searchParams, user]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
