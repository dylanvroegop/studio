'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/firebase';
import type { GpsHealth } from '@/lib/gps-health';

export function GpsHealthNotice() {
  const { user } = useUser();
  const [health, setHealth] = useState<(GpsHealth & { enabled?: boolean }) | null>(null);
  useEffect(() => {
    setHealth(null);
    if (!user) return;
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
        if (!disposed) setHealth(data);
      } catch {
        if (!disposed) setHealth({ enabled: true, state: 'unknown', lastFixAt: null, minutesWithoutFix: null });
      } finally { busy = false; }
    };
    void check();
    const interval = setInterval(() => void check(), 120000);
    document.addEventListener('visibilitychange', check);
    return () => { disposed = true; clearInterval(interval); document.removeEventListener('visibilitychange', check); };
  }, [user]);
  if (!user || !health?.enabled || health.state === 'ok') return null;
  return <div role="alert" className="fixed bottom-20 left-3 right-3 z-[60] mx-auto max-w-xl rounded-md border border-amber-500 bg-background px-4 py-3 text-sm shadow-lg">
    <strong>{health.state === 'stale' ? `GPS: ${health.minutesWithoutFix} minuten geen nieuwe locatie` : 'GPS-controle niet beschikbaar'}</strong>
    <p className="mt-1 text-muted-foreground">Controleer de tracker en verbinding. Aankopen zonder complete GPS-route blijven ongekoppeld.</p>
    <Link href="/debug/tracking" className="mt-2 inline-block underline">GPS bekijken</Link>
  </div>;
}
