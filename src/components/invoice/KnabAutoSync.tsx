'use client';

import { useEffect } from 'react';
import { useUser } from '@/firebase';

/** Haal bij een actieve app nieuwe Knab-bijschrijvingen op, ook buiten Facturen. */
export function KnabAutoSync(): null {
  const { user } = useUser();
  useEffect(() => {
    if (!user) return;
    let running = false;
    let disposed = false;
    let nextCheck = 0;
    const check = async () => {
      if (disposed || running || document.visibilityState !== 'visible' || Date.now() < nextCheck) return;
      running = true;
      nextCheck = Date.now() + 15 * 60_000;
      try {
        const token = await user.getIdToken();
        if (disposed) return;
        const result = await fetch('/api/bank/sync-enablebanking?background=1', {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
        });
        if (!result.ok) console.debug('Knab-achtergrondcontrole uitgesteld.', result.status);
        const data = await result.json();
        if (!disposed && result.ok && !data.skipped) window.dispatchEvent(new Event('knab:bijgewerkt'));
      } catch {
        // Bij netwerkverlies volgt bij de volgende controle een nieuwe poging.
      } finally { running = false; }
    };
    void check();
    const interval = window.setInterval(check, 15 * 60_000);
    document.addEventListener('visibilitychange', check);
    return () => { disposed = true; window.clearInterval(interval); document.removeEventListener('visibilitychange', check); };
  }, [user]);
  return null;
}
