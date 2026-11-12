'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useUser } from '@/firebase';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Navigation } from 'lucide-react';
import { buildGoogleMapsDirectionsUrl, openGoogleMapsDirections } from '@/lib/maps';
import { isMorningRoute, routeTime, type DeparturePlan } from '@/lib/departure-planning';

interface SmartRouteButtonProps extends Omit<ButtonProps, 'onClick'> {
  address: string;
  quoteId?: string;
  entryId?: string;
  allowBouwmaat?: boolean;
  children?: ReactNode;
}

export function SmartRouteButton({ address, quoteId, entryId, allowBouwmaat = true, children, ...props }: SmartRouteButtonProps) {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<DeparturePlan | null>(null);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const directUrl = buildGoogleMapsDirectionsUrl(address);
  useEffect(() => () => { requestId.current++; }, []);

  function close() { requestId.current++; setOpen(false); setBusy(false); }

  async function calculate(fromPhone = false) {
    const currentRequest = ++requestId.current;
    setBusy(true); setError(''); setPlan(null);
    try {
      let origin;
      if (fromPhone) {
        if (!navigator.geolocation) throw new Error('Telefoonlocatie is niet beschikbaar.');
        const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve,
          () => reject(new Error('Locatie niet beschikbaar. Controleer de locatietoestemming of kies direct naar de klant.')),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }));
        if (position.coords.accuracy > 500) throw new Error('De telefoonlocatie is te onnauwkeurig. Probeer het buiten opnieuw.');
        origin = { latitude: position.coords.latitude, longitude: position.coords.longitude,
          accuracy: position.coords.accuracy, recordedAt: new Date(position.timestamp).toISOString() };
      }
      if (currentRequest !== requestId.current) return;
      const token = await user?.getIdToken();
      if (!token) throw new Error('Log opnieuw in om de planning te controleren.');
      const response = await fetch('/api/planning/route', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quoteId, entryId, origin }), signal: AbortSignal.timeout(55000) });
      const data = await response.json();
      if (currentRequest !== requestId.current) return;
      if (!response.ok) throw new Error(data.error || 'Route controleren mislukt.');
      if (!data.eligible) {
        close();
        // Geen vertraagde window.open: mobiele browsers blokkeren die na een netwerkverzoek.
        openGoogleMapsDirections(directUrl, { sameWindow: true });
        return;
      }
      if (data.error) throw new Error(data.error);
      setPlan(data.plan);
    } catch (failure) {
      if (currentRequest === requestId.current) setError(failure instanceof Error ? failure.message : 'Route berekenen mislukt.');
    } finally { if (currentRequest === requestId.current) setBusy(false); }
  }

  return <>
    <Button {...props} disabled={!directUrl || props.disabled} onClick={event => {
      event.stopPropagation(); event.preventDefault();
      if (!allowBouwmaat || (!quoteId && !entryId) || !isMorningRoute()) {
        openGoogleMapsDirections(directUrl); return;
      }
      setOpen(true); void calculate();
    }}>{children || <><Navigation className="h-4 w-4" />Route</>}</Button>
    <Dialog open={open} onOpenChange={value => { if (!value) close(); }}>
      <DialogContent className="max-w-md" onClick={event => event.stopPropagation()}>
        <DialogHeader><DialogTitle>Route naar de klant</DialogTitle>
          <DialogDescription>{address}</DialogDescription></DialogHeader>
        {busy && <p className="flex items-center gap-2 text-sm" role="status"><Loader2 className="h-4 w-4 animate-spin" />Planning, Bouwmaat en reistijd controleren…</p>}
        {error && <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">{error}</p>}
        {plan?.store && <div className="space-y-2 text-sm">
          <p className="font-medium">{plan.store.name}</p>
          <p className="text-muted-foreground">{plan.store.address}</p>
          <dl className="grid grid-cols-2 gap-1 tabular-nums">
            <dt>Verwacht vertrek</dt><dd className="text-right font-semibold">{routeTime(plan.departureAt)}</dd>
            <dt>Rijden naar Bouwmaat</dt><dd className="text-right">{plan.driveToStoreMinutes} min</dd>
            <dt>Materialen halen</dt><dd className="text-right">30 min</dd>
            <dt>Rijden naar klant</dt><dd className="text-right">{plan.driveToClientMinutes} min</dd>
            <dt>Gepland bij klant</dt><dd className="text-right">{routeTime(plan.arrivalAt)}</dd>
          </dl>
          {plan.warning && <p role="alert" className="text-amber-600 dark:text-amber-400">{plan.warning}</p>}
          <p className="text-xs text-muted-foreground">Vanaf {plan.origin.label}. Verwachte reistijd zonder extra filebuffer. Route en openingstijden: Google Maps.</p>
        </div>}
        <div className="flex flex-col gap-2">
          <Button disabled={busy || !plan?.store} onClick={() => { if (plan) { close(); openGoogleMapsDirections(plan.mapsUrl); } }}>Via Bouwmaat naar klant</Button>
          <Button variant="outline" onClick={() => { close(); openGoogleMapsDirections(directUrl); }}>Direct naar klant</Button>
          <Button variant="ghost" disabled={busy} onClick={() => void calculate(true)}>Gebruik huidige telefoonlocatie</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
