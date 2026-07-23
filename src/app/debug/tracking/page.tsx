/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import dynamic from 'next/dynamic';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, Gauge, MapPin, RefreshCw, Route, Send, ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';

const TrackingRouteMap = dynamic(
  () => import('@/components/tracking/TrackingRouteMap').then((module) => module.TrackingRouteMap),
  { ssr: false, loading: () => <div className="flex h-[420px] items-center justify-center rounded-xl border border-border bg-muted/20 text-sm text-muted-foreground">Kaart laden...</div> },
);

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

type DayPosition = TrackingPosition & {
  address?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  city?: string | null;
};

type ApiResponse = {
  ok?: boolean;
  data?: TrackingPosition[] | TrackingPosition;
  message?: string;
  device?: { id?: number; name?: string; uniqueId?: string };
};

type DayApiResponse = ApiResponse & {
  data?: DayPosition[];
};

const DEFAULT_POSITION = {
  deviceId: '2780111912',
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

function localDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalDayRange(dateValue: string): { from: string; to: string } {
  const [year, month, day] = dateValue.split('-').map(Number);
  const fromDate = new Date(year, month - 1, day, 0, 0, 0, 0);
  const toDate = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { from: fromDate.toISOString(), to: toDate.toISOString() };
}

function distanceBetweenKm(left: DayPosition, right: DayPosition): number {
  const earthRadiusKm = 6371;
  const lat1 = left.latitude * Math.PI / 180;
  const lat2 = right.latitude * Math.PI / 180;
  const deltaLat = (right.latitude - left.latitude) * Math.PI / 180;
  const deltaLon = (right.longitude - left.longitude) * Math.PI / 180;
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function totalDistanceKm(positions: DayPosition[]): number {
  return positions.slice(1).reduce((total, position, index) => total + distanceBetweenKm(positions[index], position), 0);
}

function formatDuration(start: string | undefined, end: string | undefined): string {
  if (!start || !end) return '—';
  const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}u ${rest}m` : `${rest}m`;
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
  const [selectedDate, setSelectedDate] = useState(localDateInputValue());
  const [dayPositions, setDayPositions] = useState<DayPosition[]>([]);
  const [dayAddresses, setDayAddresses] = useState<Record<string, DayPosition>>({});
  const [isLoadingDay, setIsLoadingDay] = useState(false);
  const [hasLoadedDay, setHasLoadedDay] = useState(false);
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

  const visibleDayPositions = useMemo(
    () => dayPositions.map((position) => ({ ...position, ...dayAddresses[position.id] })),
    [dayAddresses, dayPositions],
  );

  const dayDistanceKm = useMemo(() => totalDistanceKm(visibleDayPositions), [visibleDayPositions]);

  async function reverseGeocodeDay(points: DayPosition[]) {
    const maxLookups = 60;
    const step = Math.max(1, Math.ceil(points.length / maxLookups));
    const sampled = points.filter((_, index) => index % step === 0);
    const last = points[points.length - 1];
    const lookupPoints = last && !sampled.some((point) => point.id === last.id) ? [...sampled, last] : sampled;
    if (lookupPoints.length === 0) return;

    const response = await fetch('/api/tracking/reverse-geocode', {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({
        points: lookupPoints.map((point) => ({ id: point.id, latitude: point.latitude, longitude: point.longitude })),
      }),
    });
    const payload = await response.json() as { ok?: boolean; data?: Array<{ id: string; address: string | null; street: string | null; houseNumber: string | null; city: string | null }>; };
    if (!response.ok || !payload.ok || !Array.isArray(payload.data)) return;

    setDayAddresses((current) => {
      const next = { ...current };
      payload.data?.forEach((address) => {
        const original = points.find((point) => point.id === address.id);
        if (original) next[address.id] = { ...original, ...address };
      });
      return next;
    });
  }

  async function loadFullDay() {
    setIsLoadingDay(true);
    setError(null);
    setHasLoadedDay(false);
    try {
      const range = getLocalDayRange(selectedDate);
      const query = new URLSearchParams(range);
      const response = await fetch(`/api/tracking/traccar?${query.toString()}`, {
        headers: await getHeaders(),
        cache: 'no-store',
      });
      const payload = await response.json() as DayApiResponse;
      if (!response.ok || !payload.ok || !Array.isArray(payload.data)) {
        throw new Error(payload.message || 'Traccar-dagdata kon niet worden geladen.');
      }

      setDayPositions(payload.data);
      setDayAddresses({});
      setHasLoadedDay(true);
      void reverseGeocodeDay(payload.data).catch(() => undefined);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Traccar-dagdata kon niet worden geladen.';
      setError(message);
    } finally {
      setIsLoadingDay(false);
    }
  }

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

        <Card>
          <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Route className="h-5 w-5 text-emerald-400" /> Volledige dag uit Traccar</CardTitle>
              <CardDescription>Bekijk alle GPS-punten van één dag, met gereden route en straatnamen.</CardDescription>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="tracking-date">Dag</Label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input id="tracking-date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="pl-9" />
                </div>
              </div>
              <Button type="button" onClick={() => void loadFullDay()} disabled={isLoadingDay || !selectedDate}>
                <RefreshCw className={isLoadingDay ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
                {isLoadingDay ? 'Dag laden...' : 'Laad hele dag'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {!hasLoadedDay ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/10 p-8 text-center text-sm text-muted-foreground">
                Kies een dag en klik op “Laad hele dag”. Hiermee lezen we de historische punten rechtstreeks uit Traccar.
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="h-4 w-4" /> GPS-punten</div>
                    <div className="mt-1 text-xl font-semibold">{visibleDayPositions.length}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><Route className="h-4 w-4" /> Routeafstand</div>
                    <div className="mt-1 text-xl font-semibold">{dayDistanceKm.toFixed(1)} km</div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-4 w-4" /> Eerste → laatste</div>
                    <div className="mt-1 text-sm font-semibold">
                      {visibleDayPositions[0] ? `${formatDate(visibleDayPositions[0].recorded_at)} → ${formatDate(visibleDayPositions[visibleDayPositions.length - 1].recorded_at)}` : '—'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><Gauge className="h-4 w-4" /> Tijdsduur</div>
                    <div className="mt-1 text-xl font-semibold">{formatDuration(visibleDayPositions[0]?.recorded_at, visibleDayPositions[visibleDayPositions.length - 1]?.recorded_at)}</div>
                  </div>
                </div>

                <TrackingRouteMap positions={visibleDayPositions} />

                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b border-border bg-muted/20 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr><th className="px-3 py-2">Tijd</th><th className="px-3 py-2">Straat / plaats</th><th className="px-3 py-2">Snelheid</th><th className="px-3 py-2">Nauwkeurigheid</th><th className="px-3 py-2">GPS-status</th></tr>
                    </thead>
                    <tbody>
                      {visibleDayPositions.map((position, index) => (
                        <tr key={position.id} className="border-b border-border/60 last:border-0">
                          <td className="whitespace-nowrap px-3 py-3 font-mono">{formatDate(position.recorded_at)}</td>
                          <td className="px-3 py-3">
                            <div className="font-medium">{position.street ? `${position.street}${position.houseNumber ? ` ${position.houseNumber}` : ''}` : position.address || 'Adres wordt opgehaald...'}</div>
                            <div className="text-xs text-muted-foreground">{position.city || (index === 0 ? 'Startpunt' : index === visibleDayPositions.length - 1 ? 'Eindpunt' : 'GPS-punt')}</div>
                          </td>
                          <td className="px-3 py-3">{position.speed_kmh == null ? '—' : `${position.speed_kmh.toFixed(1)} km/u`}</td>
                          <td className="px-3 py-3">{position.accuracy_m == null ? '—' : `${Number(position.accuracy_m).toFixed(1)} m`}</td>
                          <td className="px-3 py-3"><span className="inline-flex items-center gap-1.5 text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Ontvangen</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

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
