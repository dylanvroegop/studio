'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import {
  detectTrackingStops,
  getClientTimeSummaries,
  type QuoteWithAddress,
  type TrackingPoint,
} from '@/lib/tracking-analysis';
import { getLocalDateKey } from '@/lib/quote-time-summary';

export interface QuoteWorkedHours {
  workedHours: number;
}

function getLocalDayRange(date = new Date()): { from: string; to: string } {
  const fromDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const toDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
  return { from: fromDate.toISOString(), to: toDate.toISOString() };
}

/**
 * Returns the total worked hours for each quote. Stored time entries are the
 * source of truth; today's GPS client stops are added only when no booked
 * entry exists for that quote today, so live work is visible without double
 * counting an already booked day.
 */
export function useQuoteWorkedHours(quotes: QuoteWithAddress[] = []): Record<string, QuoteWorkedHours> {
  const { user } = useUser();
  const [hoursByQuoteId, setHoursByQuoteId] = useState<Record<string, QuoteWorkedHours>>({});

  const loadHours = useCallback(async () => {
    if (!user) {
      setHoursByQuoteId({});
      return;
    }

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/uren/entries?limit=1000', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; data?: unknown[] } | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) return;

      const today = getLocalDateKey();
      const bookedHoursTodayByQuoteId: Record<string, number> = {};
      const next: Record<string, QuoteWorkedHours> = {};

      payload.data.forEach((raw) => {
        if (!raw || typeof raw !== 'object') return;
        const row = raw as Record<string, unknown>;
        const quoteId = String(row.quote_id ?? row.quoteId ?? '').trim();
        const workDate = String(row.work_date ?? row.workDate ?? row.date ?? '').trim();
        const hours = Number(row.worked_hours ?? row.workedHours ?? row.hours ?? 0);
        if (!quoteId || !Number.isFinite(hours) || hours <= 0) return;

        const current = next[quoteId]?.workedHours || 0;
        next[quoteId] = { workedHours: Number((current + hours).toFixed(2)) };
        if (workDate === today) {
          bookedHoursTodayByQuoteId[quoteId] = (bookedHoursTodayByQuoteId[quoteId] || 0) + hours;
        }
      });

      if (quotes.length > 0) {
        try {
          const range = getLocalDayRange();
          const trackingResponse = await fetch(`/api/tracking/traccar?${new URLSearchParams(range).toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          });
          const trackingPayload = await trackingResponse.json().catch(() => null) as { ok?: boolean; data?: unknown[] } | null;
          if (trackingResponse.ok && trackingPayload?.ok && Array.isArray(trackingPayload.data)) {
            const points = trackingPayload.data
              .filter((raw): raw is Record<string, unknown> => Boolean(raw && typeof raw === 'object'))
              .map((raw): TrackingPoint | null => {
                const latitude = Number(raw.latitude);
                const longitude = Number(raw.longitude);
                const recordedAt = String(raw.recorded_at || '').trim();
                if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !recordedAt) return null;
                return {
                  id: String(raw.id || recordedAt),
                  latitude,
                  longitude,
                  speed_kmh: raw.speed_kmh == null ? null : Number(raw.speed_kmh),
                  recorded_at: recordedAt,
                };
              })
              .filter((point): point is TrackingPoint => point !== null);

            const stops = detectTrackingStops(points);
            if (stops.length > 0) {
              const geocodeResponse = await fetch('/api/tracking/reverse-geocode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                  points: stops.map((stop) => ({
                    id: stop.point.id,
                    latitude: stop.point.latitude,
                    longitude: stop.point.longitude,
                  })),
                }),
              });
              const geocodePayload = await geocodeResponse.json().catch(() => null) as {
                ok?: boolean;
                data?: Array<{ id: string; address?: string | null; street?: string | null; houseNumber?: string | null; city?: string | null }>;
              } | null;
              const addresses = new Map((geocodePayload?.ok && Array.isArray(geocodePayload.data) ? geocodePayload.data : []).map((row) => [row.id, row]));
              const enrichedStops = stops.map((stop) => ({
                ...stop,
                point: { ...stop.point, ...(addresses.get(stop.point.id) || {}) },
              }));
              const gpsSummaries = getClientTimeSummaries(enrichedStops, quotes);
              Object.entries(gpsSummaries).forEach(([quoteId, summary]) => {
                if ((bookedHoursTodayByQuoteId[quoteId] || 0) > 0) return;
                const current = next[quoteId]?.workedHours || 0;
                next[quoteId] = {
                  workedHours: Number((current + (summary.workedMinutes / 60)).toFixed(2)),
                };
              });
            }
          }
        } catch {
          // Live GPS is optional; booked hours remain visible if tracking is unavailable.
        }
      }

      setHoursByQuoteId(next);
    } catch {
      // Uren mogen het laden van offertes nooit blokkeren.
    }
  }, [quotes, user]);

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
