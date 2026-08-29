'use client';

import { useCallback, useEffect, useState } from 'react';

import { useUser } from '@/firebase';
import type { QuoteWithAddress } from '@/lib/tracking-analysis';

export interface QuoteWorkedHours {
  workedHours: number;
  onsiteMinutes: number;
  travelMinutes: number;
  supplierMinutes: number;
}

/** Stored entries are the only source of truth. GPS time becomes visible here
 * after the in-app review has assigned it to a quote. */
export function useQuoteWorkedHours(quotes: QuoteWithAddress[] = []): Record<string, QuoteWorkedHours> {
  void quotes;
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
      const next: Record<string, QuoteWorkedHours> = {};
      payload.data.forEach((raw) => {
        if (!raw || typeof raw !== 'object') return;
        const row = raw as Record<string, unknown>;
        const quoteId = String(row.quote_id ?? row.quoteId ?? '').trim();
        const exactMinutes = Number(row.exact_minutes ?? row.exactMinutes);
        const hours = Number.isFinite(exactMinutes) && exactMinutes > 0
          ? exactMinutes / 60
          : Number(row.worked_hours ?? row.workedHours ?? row.hours ?? 0);
        if (!quoteId || !Number.isFinite(hours) || hours <= 0) return;
        const current = next[quoteId] || { workedHours: 0, onsiteMinutes: 0, travelMinutes: 0, supplierMinutes: 0 };
        current.workedHours += hours;
        current.onsiteMinutes += Number(row.onsite_minutes || 0);
        current.travelMinutes += Number(row.outbound_travel_minutes || 0) + Number(row.return_travel_minutes || 0);
        current.supplierMinutes += Number(row.supplier_travel_minutes || 0) + Number(row.supplier_stop_minutes || 0);
        next[quoteId] = current;
      });
      Object.values(next).forEach((summary) => {
        summary.workedHours = Number(summary.workedHours.toFixed(2));
        summary.onsiteMinutes = Math.round(summary.onsiteMinutes);
        summary.travelMinutes = Math.round(summary.travelMinutes);
        summary.supplierMinutes = Math.round(summary.supplierMinutes);
      });
      setHoursByQuoteId(next);
    } catch {
      // Keep the previous summary when the network is temporarily unavailable.
    }
  }, [user]);

  useEffect(() => {
    void loadHours();
    const refresh = () => void loadHours();
    window.addEventListener('gps-work-hours:updated', refresh);
    return () => window.removeEventListener('gps-work-hours:updated', refresh);
  }, [loadHours]);

  return hoursByQuoteId;
}
