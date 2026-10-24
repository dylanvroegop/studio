'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import { gpsDistanceKm, amsterdamMidnight } from '@/lib/tracking-distance';

interface DistanceResult { km: number; missing: number; measured: number; completed: number; total: number; done: boolean }

export function KostenAfstandRow({ dates, cell, fuelCost }: { dates: string[] | null; cell: string; fuelCost: number | null }) {
  const { user } = useUser();
  const [result, setResult] = useState<DistanceResult | null>(null);
  const [retry, setRetry] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const dateKey = dates?.join(',') ?? null;
  useEffect(() => {
    if (!user || dateKey === null) { setResult(null); return; }
    const controller = new AbortController();
    let disposed = false;
    let refreshTimer: number | undefined;
    const days = dateKey ? dateKey.split(',') : [];
    const values = new Map<string, number | null>();
    const pending: string[] = [];
    let completed = 0;
    const key = (date: string) => `kosten-gps-afstand-v1:${user.uid}:${date}`;
    const endOfDay = (date: string) => {
      const next = new Date(`${date}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      return amsterdamMidnight(next.toISOString().slice(0, 10));
    };
    // Lees eerst alle opgeslagen dagen, zodat het bekende totaal direct zichtbaar is.
    for (const date of days) {
      let fresh = false;
      try {
        const cached = JSON.parse(localStorage.getItem(key(date)) || 'null');
        if (cached && (cached.km === null || (typeof cached.km === 'number' && Number.isFinite(cached.km) && cached.km >= 0)) && typeof cached.at === 'number') {
          values.set(date, cached.km);
          // Een dag is pas definitief als hij na middernacht is opgehaald.
          fresh = cached.km !== null
            ? cached.at >= Date.parse(endOfDay(date)) || Date.now() - cached.at < 300000
            : retry === 0 && Date.now() - cached.at < 86400000;
        }
      } catch { /* Zonder lokale opslag blijven de gegevens gewoon opvraagbaar. */ }
      if (fresh) completed++;
      else pending.push(date);
    }
    const publish = (done = false) => {
      if (disposed) return;
      const measured = [...values.values()].filter((value): value is number => value !== null);
      setResult({ km: measured.reduce((sum, value) => sum + value, 0), missing: done ? days.length - measured.length : [...values.values()].filter((value) => value === null).length,
        measured: measured.length, completed, total: days.length, done });
    };
    const finish = () => {
      publish(true);
      if (!disposed) refreshTimer = window.setTimeout(() => setRefresh((value) => value + 1), 300000);
    };
    publish(pending.length === 0);
    // Ruimte voor de eerste historische import; opgehaalde dagen blijven bewaard.
    const deadline = window.setTimeout(() => { controller.abort(); finish(); }, 600000);
    void (async () => {
      let index = 0;
      try {
        if (pending.length > 0) {
          const token = await user.getIdToken();
          if (controller.signal.aborted) return;
          await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
            while (index < pending.length && !controller.signal.aborted) {
              const date = pending[index++];
              const request = new AbortController();
              const abort = () => request.abort();
              controller.signal.addEventListener('abort', abort, { once: true });
              const timeout = window.setTimeout(abort, 60000);
              try {
                const from = amsterdamMidnight(date);
                const to = endOfDay(date);
                const response = await fetch(`/api/tracking/traccar?${new URLSearchParams({ from, to })}`, { headers: { Authorization: `Bearer ${token}` }, signal: request.signal });
                const payload = await response.json();
                if (!response.ok || !payload.ok || !Array.isArray(payload.data)) throw new Error();
                const distance = gpsDistanceKm(payload.data);
                if (controller.signal.aborted) return;
                values.set(date, distance);
                try { localStorage.setItem(key(date), JSON.stringify({ km: distance, at: Date.now() })); } catch { /* Opslag niet beschikbaar. */ }
              } catch {
                if (controller.signal.aborted) return;
                // Een mislukte verversing mag eerder gemeten kilometers niet wissen.
                if (!values.has(date)) values.set(date, null);
              } finally {
                window.clearTimeout(timeout);
                controller.signal.removeEventListener('abort', abort);
              }
              completed++;
              publish();
            }
          }));
        }
      } finally {
        window.clearTimeout(deadline);
      }
      if (!controller.signal.aborted) finish();
    })().catch(() => { if (!controller.signal.aborted) finish(); });
    return () => { disposed = true; window.clearTimeout(deadline); window.clearTimeout(refreshTimer); controller.abort(); };
  }, [user, dateKey, retry, refresh]);
  const fuelPerKm = result?.done && result.missing === 0 && result.km > 0 && fuelCost !== null
    ? fuelCost / result.km : null;
  return <><tr className="border-b border-border/50"><td className="px-3 py-2">Gereden afstand (GPS)<span className="block text-xs text-muted-foreground">{result && !result.done ? `${result.completed}/${result.total} dagen opgehaald` : result?.missing ? `${result.measured}/${result.total} dagen gemeten · ${result.missing} niet beschikbaar` : 'Geregistreerde werkdagen'}</span>{result?.done && result.missing > 0 ? <button type="button" className="text-xs underline underline-offset-2" onClick={() => setRetry((value) => value + 1)}>Opnieuw proberen</button> : null}</td><td className={cell}>{result?.measured ? `≈ ${result.km.toLocaleString('nl-NL', { maximumFractionDigits: 0 })} km${!result.done || result.missing ? ' (deels)' : ''}` : result?.done ? 'n.b.' : 'Laden…'}</td></tr>
    <tr className="border-b border-border/50"><td className="px-3 py-2">Brandstof per km{result?.done && result.missing > 0 ? <span className="block text-xs text-muted-foreground">GPS-gegevens onvolledig</span> : <span className="block text-xs text-muted-foreground">Brandstofuitgaven / GPS-km geregistreerde werkdagen</span>}</td><td className={cell}>{!result?.done ? 'Laden…' : fuelPerKm === null ? 'n.b.' : `≈ ${fuelPerKm.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })} / km`}</td></tr>
  </>;
}
