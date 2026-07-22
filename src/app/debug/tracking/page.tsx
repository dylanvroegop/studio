/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, MapPin, RefreshCw, Send, ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';

type TrackingPosition = {
  id: string;
  device_id: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  speed_kmh: number | null;
  recorded_at: string;
  created_at?: string;
  source: string;
  raw_payload: Record<string, unknown>;
};

type ApiResponse = {
  ok?: boolean;
  data?: TrackingPosition[] | TrackingPosition;
  message?: string;
};

const DEFAULT_POSITION = {
  deviceId: '27801119',
  latitude: '52.42466',
  longitude: '4.63337',
  accuracyM: '8',
  speedKmh: '0',
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('nl-NL', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export default function TrackingDebugPage() {
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const [form, setForm] = useState(DEFAULT_POSITION);
  const [positions, setPositions] = useState<TrackingPosition[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<TrackingPosition | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isFetchingTraccar, setIsFetchingTraccar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getHeaders = useCallback(async () => {
    if (!user) throw new Error('Je bent niet ingelogd.');
    const token = await user.getIdToken();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }, [user]);

  const loadPositions = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/tracking/positions?limit=25', {
        headers: await getHeaders(),
        cache: 'no-store',
      });
      const payload = await response.json() as ApiResponse;
      if (!response.ok || !payload.ok || !Array.isArray(payload.data)) {
        throw new Error(payload.message || 'Trackingdata kon niet worden geladen.');
      }
      const rows = payload.data;
      setPositions(rows);
      const latestRealPosition = rows.find((position) => position.source === 'traccar');
      setSelectedPosition(latestRealPosition || rows[0] || null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Trackingdata kon niet worden geladen.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [getHeaders, user]);

  useEffect(() => {
    void loadPositions();
  }, [loadPositions]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSending(true);
    setError(null);

    try {
      const response = await fetch('/api/tracking/positions', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({
          deviceId: form.deviceId,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          accuracyM: Number(form.accuracyM),
          speedKmh: Number(form.speedKmh),
          recordedAt: new Date().toISOString(),
          source: 'debug_test',
        }),
      });
      const payload = await response.json() as ApiResponse;
      if (!response.ok || !payload.ok || !payload.data || Array.isArray(payload.data)) {
        throw new Error(payload.message || 'Testpositie kon niet worden opgeslagen.');
      }

      const savedPosition = payload.data;
      setPositions((current) => [savedPosition, ...current].slice(0, 25));
      setSelectedPosition(savedPosition);
      toast({
        title: 'Testpositie ontvangen',
        description: 'De positie is opgeslagen in tracking_positions. Er zijn geen uren geboekt.',
      });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Testpositie kon niet worden opgeslagen.';
      setError(message);
      toast({ title: 'Testpositie mislukt', description: message, variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  }

  async function fetchTraccarPosition() {
    setIsFetchingTraccar(true);
    setError(null);

    try {
      const response = await fetch('/api/tracking/traccar', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({}),
      });
      const payload = await response.json() as ApiResponse;
      if (!response.ok || !payload.ok || !payload.data || Array.isArray(payload.data)) {
        throw new Error(payload.message || 'Traccar-positie kon niet worden opgehaald.');
      }

      const savedPosition = payload.data;
      setPositions((current) => [savedPosition, ...current].slice(0, 25));
      setSelectedPosition(savedPosition);
      toast({
        title: 'Traccar-positie ontvangen',
        description: 'De echte GPS-positie is opgeslagen. Er zijn geen uren geboekt.',
      });
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Traccar-positie kon niet worden opgehaald.';
      setError(message);
      toast({ title: 'Traccar ophalen mislukt', description: message, variant: 'destructive' });
    } finally {
      setIsFetchingTraccar(false);
    }
  }

  if (isUserLoading) {
    return <main className="min-h-screen bg-background p-6 text-foreground">Gebruiker laden...</main>;
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Tracking test</CardTitle>
            <CardDescription>Log eerst in bij Calvora om trackingdata te testen.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Link href="/urenregistratie" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Terug naar urenregistratie
            </Link>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">Debug / Tracking</p>
            <h1 className="text-3xl font-semibold">GPS-data testen</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Dit is een veilige testpagina. De positie wordt opgeslagen en zichtbaar gemaakt, maar maakt nog geen urenboeking.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void loadPositions()} disabled={isLoading || isFetchingTraccar}>
              <RefreshCw className={isLoading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
              Ververs data
            </Button>
            <Button type="button" onClick={() => void fetchTraccarPosition()} disabled={isFetchingTraccar}>
              <MapPin className={isFetchingTraccar ? 'mr-2 h-4 w-4 animate-pulse' : 'mr-2 h-4 w-4'} />
              {isFetchingTraccar ? 'Traccar ophalen...' : 'Haal echte Traccar-positie op'}
            </Button>
          </div>
        </header>

        {error ? (
          <div className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-950/20 p-4 text-sm text-red-100">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Testpositie versturen</CardTitle>
              <CardDescription>Dit bootst één inkomende GPS-positie na.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="device-id">Device identifier</Label>
                  <Input id="device-id" value={form.deviceId} onChange={(event) => setForm((current) => ({ ...current, deviceId: event.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="latitude">Latitude</Label>
                    <Input id="latitude" inputMode="decimal" value={form.latitude} onChange={(event) => setForm((current) => ({ ...current, latitude: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="longitude">Longitude</Label>
                    <Input id="longitude" inputMode="decimal" value={form.longitude} onChange={(event) => setForm((current) => ({ ...current, longitude: event.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="accuracy">Nauwkeurigheid (m)</Label>
                    <Input id="accuracy" type="number" min="0" value={form.accuracyM} onChange={(event) => setForm((current) => ({ ...current, accuracyM: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="speed">Snelheid (km/u)</Label>
                    <Input id="speed" type="number" min="0" value={form.speedKmh} onChange={(event) => setForm((current) => ({ ...current, speedKmh: event.target.value }))} />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isSending}>
                  <Send className="mr-2 h-4 w-4" />
                  {isSending ? 'Versturen...' : 'Stuur testpositie'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Laatste ontvangen positie</CardTitle>
              <CardDescription>Dit is wat Calvora uit de trackingtabel leest.</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedPosition ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4" /> Coördinaten</div>
                      <div className="mt-1 font-mono text-lg">{Number(selectedPosition.latitude).toFixed(5)}, {Number(selectedPosition.longitude).toFixed(5)}</div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> GPS-tijd</div>
                      <div className="mt-1 text-sm">{formatDate(selectedPosition.recorded_at)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        In Calvora opgeslagen: {selectedPosition.created_at ? formatDate(selectedPosition.created_at) : 'onbekend'}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 text-sm sm:grid-cols-3">
                    <div><span className="text-muted-foreground">Device</span><div className="font-mono">{selectedPosition.device_id}</div></div>
                    <div><span className="text-muted-foreground">Bron</span><div>{selectedPosition.source}</div></div>
                    <div><span className="text-muted-foreground">Nauwkeurigheid</span><div>{selectedPosition.accuracy_m == null ? '—' : `${selectedPosition.accuracy_m} m`}</div></div>
                  </div>
                  <Textarea readOnly value={formatJson(selectedPosition.raw_payload)} className="min-h-48 font-mono text-xs" />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  Nog geen trackingpositie ontvangen.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Ontvangen posities</CardTitle>
            <CardDescription>{positions.length} positie(s) geladen uit de database.</CardDescription>
          </CardHeader>
          <CardContent>
            {positions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Stuur hierboven een testpositie om de pipeline te controleren.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="px-3 py-2">Tijd</th><th className="px-3 py-2">Device</th><th className="px-3 py-2">Latitude</th><th className="px-3 py-2">Longitude</th><th className="px-3 py-2">Bron</th></tr>
                  </thead>
                  <tbody>
                    {positions.map((position) => (
                      <tr key={position.id} className="cursor-pointer border-b border-border/60 hover:bg-muted/20" onClick={() => setSelectedPosition(position)}>
                        <td className="px-3 py-3">{formatDate(position.recorded_at)}</td>
                        <td className="px-3 py-3 font-mono">{position.device_id}</td>
                        <td className="px-3 py-3 font-mono">{Number(position.latitude).toFixed(5)}</td>
                        <td className="px-3 py-3 font-mono">{Number(position.longitude).toFixed(5)}</td>
                        <td className="px-3 py-3">{position.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
