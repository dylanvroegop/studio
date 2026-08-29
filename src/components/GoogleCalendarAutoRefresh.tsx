'use client';

import { useEffect, useRef } from 'react';
import { useUser } from '@/firebase';

function getRefreshRange(): { startDate: Date; endDate: Date } {
  const now = new Date();
  return {
    startDate: new Date(now.getFullYear(), now.getMonth(), 1),
    endDate: new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999),
  };
}

export function GoogleCalendarAutoRefresh(): null {
  const { user } = useUser();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!user || startedRef.current) return;
    startedRef.current = true;

    const syncWorkedHours = async (token: string): Promise<void> => {
      const response = await fetch('/api/google-calendar/sync-worked-hours', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) console.debug('Google Calendar gewerkte uren synchroniseren overgeslagen:', response.status);
    };

    const refreshInBackground = async (): Promise<void> => {
      try {
        const token = await user.getIdToken();
        await syncWorkedHours(token);
        const { startDate, endDate } = getRefreshRange();
        const response = await fetch('/api/google-calendar/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          }),
        });

        if (!response.ok) {
          // Calendar is optional. Keep this completely silent in the UI.
          console.debug('Google Calendar auto-refresh overgeslagen:', response.status);
        }
      } catch (error) {
        // A background refresh must never affect app startup or show a popup.
        console.debug('Google Calendar auto-refresh mislukt:', error);
      }
    };

    void refreshInBackground();
    const handleWorkedHoursUpdate = () => {
      void user.getIdToken()
        .then((token) => syncWorkedHours(token))
        .catch((error) => console.debug('Google Calendar gewerkte uren synchroniseren mislukt:', error));
    };
    window.addEventListener('gps-work-hours:updated', handleWorkedHoursUpdate);
    return () => window.removeEventListener('gps-work-hours:updated', handleWorkedHoursUpdate);
  }, [user]);

  return null;
}
