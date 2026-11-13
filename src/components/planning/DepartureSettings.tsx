'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { departureSummary, type DeparturePlan } from '@/lib/departure-planning';

export function DepartureSettings() {
  const { user } = useUser();
  const [date, setDate] = useState('');
  const [address, setAddress] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void user.getIdToken().then(token => fetch('/api/planning/departure', { headers: { Authorization: `Bearer ${token}` } }))
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Instellingen laden mislukt.'); return data; })
      .then(data => {
        if (cancelled) return;
        setDate(data.date); setEnabled(data.settings.remindersEnabled);
        setAddress(data.settings.originDate === data.date ? data.settings.originAddress : '');
      }).catch(failure => { if (!cancelled) setError(failure.message || 'Instellingen laden mislukt.'); });
    return () => { cancelled = true; };
  }, [user]);

  async function save(preview: boolean) {
    if (!user || !date) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const token = await user.getIdToken(), headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const saved = await fetch('/api/planning/departure', { method: 'PUT', headers,
        body: JSON.stringify({ originDate: date, originAddress: address, remindersEnabled: enabled }) });
      if (!saved.ok) { const data = await saved.json(); throw new Error(data.error || 'Opslaan mislukt.'); }
      if (!preview) { setMessage('Opgeslagen.'); return; }
      const response = await fetch('/api/planning/departure?preview=1', { headers, signal: AbortSignal.timeout(55000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Vertrektijd berekenen mislukt.');
      setMessage(data.plan ? departureSummary(data.plan as DeparturePlan) : 'Morgen staat er geen afspraak in je planning.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Berekenen mislukt.'); }
    finally { setBusy(false); }
  }

  return <details className="rounded-lg border border-border bg-card px-3 py-2">
    <summary className="cursor-pointer text-sm font-medium">Vertrek morgen & avondmelding</summary>
    <div className="mt-3 space-y-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="departure-reminders">Elke avond rond 19:00 een appmelding</Label>
        <Switch id="departure-reminders" checked={enabled} onCheckedChange={setEnabled} disabled={!date || busy} />
      </div>
      <div className="space-y-1"><Label htmlFor="departure-origin">Vertrekadres voor morgen</Label>
        <Input id="departure-origin" value={address} onChange={event => setAddress(event.target.value)} maxLength={400}
          placeholder="Leeg laten: laatste GPS-locatie" disabled={!date || busy} />
        <p className="text-xs text-muted-foreground">Alleen voor morgen. Eerste klusdag: via Bouwmaat met 30 min voor materialen. Daarna rechtstreeks. Aankomst volgens je planning; hele dag: 08:00.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!date || busy} onClick={() => void save(false)}>Opslaan</Button>
        <Button size="sm" disabled={!date || busy} onClick={() => void save(true)}>{busy ? 'Even wachten…' : 'Bereken vertrek voor morgen'}</Button>
      </div>
      {error && <p role="alert" className="text-amber-600 dark:text-amber-400">{error}</p>}
      {message && <p role="status" className="whitespace-pre-line">{message}</p>}
      <p className="text-xs text-muted-foreground">Berekening vanaf de gekozen vertrekplek. Push vereist ingeschakelde appmeldingen en de actieve avondtimer. Reistijd en openingstijden: Google Maps.</p>
    </div>
  </details>;
}
