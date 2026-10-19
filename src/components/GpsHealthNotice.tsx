'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useUser } from '@/firebase';
import type { GpsHealth } from '@/lib/gps-health';

export function GpsHealthNotice() {
  const { user } = useUser();
  const [health, setHealth] = useState<(GpsHealth & { enabled?: boolean }) | null>(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setHealth(null);
    setDismissed(false);
    if (!user) return;
    const dismissalKey = `gps-health-dismissed:${user.uid}`;
    try { setDismissed(sessionStorage.getItem(dismissalKey) === 'true'); } catch { /* Sluiten blijft werken zonder browseropslag. */ }
    let disposed = false;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/tracking/health', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(25000) });
        if (!response.ok) throw new Error('Controle mislukt');
        const data = await response.json();
        if (!disposed) {
          setHealth(data);
          if (data.state === 'ok' || data.enabled === false) {
            setDismissed(false);
            try { sessionStorage.removeItem(dismissalKey); } catch { /* Browseropslag is optioneel. */ }
          }
        }
      } catch {
        if (!disposed) setHealth({ enabled: true, state: 'unknown', lastFixAt: null, minutesWithoutFix: null });
      } finally { busy = false; }
    };
    void check();
    const interval = setInterval(() => void check(), 120000);
    document.addEventListener('visibilitychange', check);
    return () => { disposed = true; clearInterval(interval); document.removeEventListener('visibilitychange', check); };
  }, [user]);
  if (!user || !health?.enabled || health.state === 'ok' || dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(`gps-health-dismissed:${user.uid}`, 'true'); } catch { /* Sluiten blijft werken zonder browseropslag. */ }
  };
  return <div role="alert" className="fixed bottom-20 left-3 right-3 z-[60] mx-auto max-w-xl rounded-md border border-amber-500 bg-background py-3 pl-4 pr-14 text-sm shadow-lg">
    <button type="button" onClick={dismiss} aria-label="GPS-melding sluiten" className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
    <strong>{health.state === 'stale' ? `GPS: ${health.minutesWithoutFix} minuten geen nieuwe locatie` : 'GPS-controle niet beschikbaar'}</strong>
    <p className="mt-1 text-muted-foreground">Controleer de tracker en verbinding. Aankopen zonder complete GPS-route blijven ongekoppeld.</p>
    <Link href="/debug/tracking" className="mt-2 inline-block underline">GPS bekijken</Link>
  </div>;
}
