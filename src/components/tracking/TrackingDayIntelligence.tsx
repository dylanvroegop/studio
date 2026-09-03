'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Car,
  CheckCircle2,
  Clock3,
  Fuel,
  Navigation,
  RefreshCw,
  Route,
  Settings2,
  Target,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';
import {
  DEFAULT_FUEL_PRICE,
  DEFAULT_FUEL_SETTINGS,
  DEFAULT_KM_PER_LITRE,
  TRACKING_FUEL_SETTINGS_STORAGE_KEY,
  formatFuelSettingDate,
  fuelSettingForDate,
  migrateFuelSettings,
  type FuelSetting,
} from '@/lib/tracking-fuel-settings';
import { gpsClientNameFromInfo, isExcludedGpsClientName } from '@/lib/gps-excluded-clients';

const TrackingRouteMap = dynamic(
  () => import('@/components/tracking/TrackingRouteMap').then((module) => module.TrackingRouteMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] items-center justify-center rounded-xl border border-border bg-muted/20 text-sm text-muted-foreground">
        Kaart laden...
      </div>
    ),
  },
);

interface TrackingPosition {
  id: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  speed_kmh: number | null;
  recorded_at: string;
  source: string;
  address?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  city?: string | null;
}

interface QuoteLike {
  id: string;
  offerteNummer?: number | string;
  titel?: string;
  title?: string;
  klantinformatie?: {
    voornaam?: string;
    achternaam?: string;
    bedrijfsnaam?: string;
    straat?: string;
    huisnummer?: string | number;
    postcode?: string;
    plaats?: string;
  };
}

interface TimeEntryLike {
  id: string;
  date: string;
  totalHours: number;
  quoteId?: string;
}

interface TrackingDayIntelligenceProps {
  quotes: QuoteLike[];
  history: TimeEntryLike[];
}

interface StopEvent {
  id: string;
  start: string;
  end: string;
  durationMinutes: number;
  position: TrackingPosition;
  type: 'home' | 'supermarket' | 'nature' | 'location' | 'stop';
  matchedQuote?: QuoteLike;
}

interface TripEvent {
  id: string;
  start: string;
  end: string;
  distanceKm: number;
  from: string;
  to: string;
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

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return hours > 0 ? `${hours}u ${rest}m` : `${rest}m`;
}

function formatHours(hours: number): string {
  return `${Math.floor(hours)}u ${Math.round((hours - Math.floor(hours)) * 60)}m`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
}

function distanceBetweenKm(left: TrackingPosition, right: TrackingPosition): number {
  const earthRadiusKm = 6371;
  const lat1 = left.latitude * Math.PI / 180;
  const lat2 = right.latitude * Math.PI / 180;
  const deltaLat = (right.latitude - left.latitude) * Math.PI / 180;
  const deltaLon = (right.longitude - left.longitude) * Math.PI / 180;
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function totalDistanceKm(points: TrackingPosition[]): number {
  return points.slice(1).reduce((total, point, index) => total + distanceBetweenKm(points[index], point), 0);
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function quoteClientName(quote: QuoteLike): string {
  const info = quote.klantinformatie;
  return [info?.voornaam, info?.achternaam].filter(Boolean).join(' ')
    || info?.bedrijfsnaam
    || 'Onbekende klant';
}

function quoteAddress(quote: QuoteLike): string {
  const info = quote.klantinformatie;
  return [info?.straat, info?.huisnummer, info?.postcode, info?.plaats].filter(Boolean).join(' ');
}

function quoteLabel(quote: QuoteLike): string {
  const number = quote.offerteNummer ? `#${quote.offerteNummer} · ` : '';
  return `${number}${quoteClientName(quote)}`;
}

function positionLabel(position: TrackingPosition): string {
  const street = [position.street, position.houseNumber].filter(Boolean).join(' ');
  return street || position.address || position.city || 'GPS-locatie';
}

function positionText(position: TrackingPosition): string {
  return normalize([position.address, position.street, position.houseNumber, position.city].filter(Boolean).join(' '));
}

function matchQuote(position: TrackingPosition, quotes: QuoteLike[]): QuoteLike | undefined {
  const location = positionText(position);
  if (!location) return undefined;
  return quotes.find((quote) => {
    if (isExcludedGpsClientName(gpsClientNameFromInfo(quote.klantinformatie))) return false;
    const address = normalize(quoteAddress(quote));
    if (!address) return false;
    const street = normalize(quote.klantinformatie?.straat || '').split(' ').filter(Boolean);
    const houseNumber = normalize(String(quote.klantinformatie?.huisnummer || ''));
    const city = normalize(quote.klantinformatie?.plaats || '');
    const streetMatches = street.length > 0 && street.every((word) => location.includes(word));
    const numberMatches = houseNumber.length > 0 && location.includes(houseNumber);
    const cityMatches = city.length > 0 && location.includes(city);
    return (streetMatches && numberMatches) || (streetMatches && cityMatches);
  });
}

function classifyStop(position: TrackingPosition, index: number, allPoints: TrackingPosition[]): StopEvent['type'] {
  const text = positionText(position);
  if (index === 0 && !text) return 'home';
  if (/(supermarkt|albert heijn|jumbo|lidl|aldi|plus|dirk|ah | boodschappen)/.test(text)) return 'supermarket';
  if (/(bos|park|natuur|recreatie|heide|duin)/.test(text)) return 'nature';
  if (index === 0 || index === allPoints.length - 1) return 'home';
  return 'location';
}

function detectStops(points: TrackingPosition[], quotes: QuoteLike[]): StopEvent[] {
  if (points.length === 0) return [];
  const stops: StopEvent[] = [];
  let startIndex: number | null = null;

  const flush = (endIndex: number) => {
    if (startIndex === null) return;
    const start = points[startIndex];
    const end = points[endIndex];
    const durationMinutes = Math.max(0, (new Date(end.recorded_at).getTime() - new Date(start.recorded_at).getTime()) / 60_000);
    if (durationMinutes >= 8) {
      const middle = points[Math.floor((startIndex + endIndex) / 2)];
      stops.push({
        id: `${start.id}-${end.id}`,
        start: start.recorded_at,
        end: end.recorded_at,
        durationMinutes,
        position: middle,
        type: classifyStop(middle, startIndex, points),
        matchedQuote: matchQuote(middle, quotes),
      });
    }
    startIndex = null;
  };

  points.forEach((point, index) => {
    const previous = points[index - 1];
    const distance = previous ? distanceBetweenKm(previous, point) : 0;
    const speed = point.speed_kmh ?? 0;
    const stationary = speed <= 7 && distance <= 0.08;
    if (stationary && startIndex === null) startIndex = index;
    if (!stationary && startIndex !== null) flush(index - 1);
  });
  if (startIndex !== null) flush(points.length - 1);

  return stops
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())
    .filter((stop, index, all) => index === 0 || new Date(stop.start).getTime() - new Date(all[index - 1].end).getTime() > 2 * 60_000);
}

function detectTrips(points: TrackingPosition[], stops: StopEvent[]): TripEvent[] {
  if (points.length < 2) return [];
  const trips: TripEvent[] = [];
  const boundaries = [
    { start: 0, end: Math.max(0, points.findIndex((point) => new Date(point.recorded_at).getTime() >= new Date(stops[0]?.end || points[0].recorded_at).getTime())) },
    ...stops.slice(0, -1).map((stop, index) => {
      const next = stops[index + 1];
      const start = points.findIndex((point) => new Date(point.recorded_at).getTime() >= new Date(stop.end).getTime());
      const end = points.findIndex((point) => new Date(point.recorded_at).getTime() >= new Date(next.start).getTime());
      return { start: Math.max(0, start), end: end < 0 ? points.length - 1 : end };
    }),
  ];

  boundaries.forEach((boundary, index) => {
    const start = points[boundary.start];
    const end = points[Math.min(points.length - 1, Math.max(boundary.start, boundary.end))];
    if (!start || !end || start.id === end.id) return;
    const segment = points.slice(boundary.start, Math.min(points.length, boundary.end + 1));
    const distanceKm = totalDistanceKm(segment);
    if (distanceKm < 0.5) return;
    trips.push({
      id: `trip-${index}-${start.id}`,
      start: start.recorded_at,
      end: end.recorded_at,
      distanceKm,
      from: positionLabel(stops[index]?.position || start),
      to: positionLabel(stops[index + 1]?.position || end),
    });
  });
  return trips;
}

function Metric({ icon, label, value, detail, tone = 'default' }: { icon: ReactNode; label: string; value: string; detail?: string; tone?: 'default' | 'emerald' | 'amber' | 'blue' }) {
  const toneClass = tone === 'emerald' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-300' : tone === 'blue' ? 'text-blue-300' : 'text-foreground';
  return (
    <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className={`mt-2 text-2xl font-semibold tracking-tight ${toneClass}`}>{value}</div>
      {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

export function TrackingDayIntelligence({ quotes, history }: TrackingDayIntelligenceProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(localDateInputValue());
  const [points, setPoints] = useState<TrackingPosition[]>([]);
  const [addresses, setAddresses] = useState<Record<string, Partial<TrackingPosition>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fuelSettings, setFuelSettings] = useState<FuelSetting[]>(DEFAULT_FUEL_SETTINGS);
  const [fuelSettingsLoaded, setFuelSettingsLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const stopLookupRef = useRef('');

  useEffect(() => {
    const saved = localStorage.getItem(TRACKING_FUEL_SETTINGS_STORAGE_KEY);
    if (saved) {
      try {
        setFuelSettings(migrateFuelSettings(JSON.parse(saved)));
      } catch {
        // Ongeldige lokale instellingen negeren.
      }
    }
    setFuelSettingsLoaded(true);
  }, []);

  useEffect(() => {
    if (fuelSettingsLoaded) {
      localStorage.setItem(TRACKING_FUEL_SETTINGS_STORAGE_KEY, JSON.stringify(fuelSettings));
    }
  }, [fuelSettings, fuelSettingsLoaded]);

  const activeFuelSetting = useMemo(
    () => fuelSettingForDate(fuelSettings, selectedDate),
    [fuelSettings, selectedDate],
  );
  const kmPerLitre = activeFuelSetting.kmPerLitre;
  const fuelPrice = activeFuelSetting.fuelPrice;

  const updateActiveFuelSetting = useCallback((changes: Partial<FuelSetting>) => {
    setFuelSettings((current) => {
      const activeIndex = current.reduce(
        (index, setting, currentIndex) => setting.effectiveFrom <= selectedDate ? currentIndex : index,
        -1,
      );
      if (activeIndex < 0) return [...current, { ...DEFAULT_FUEL_SETTINGS[0], effectiveFrom: selectedDate, ...changes }];
      return current.map((setting, index) => index === activeIndex ? { ...setting, ...changes } : setting);
    });
  }, [selectedDate]);

  const getHeaders = useCallback(async () => {
    if (!user) throw new Error('Je bent niet ingelogd.');
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  }, [user]);

  const reverseGeocode = useCallback(async (rawPoints: TrackingPosition[]) => {
    const maxLookups = 60;
    const step = Math.max(1, Math.ceil(rawPoints.length / maxLookups));
    const sampled = rawPoints.filter((_, index) => index % step === 0);
    const last = rawPoints[rawPoints.length - 1];
    const lookupPoints = last && !sampled.some((point) => point.id === last.id) ? [...sampled, last] : sampled;
    if (!lookupPoints.length) return;
    const response = await fetch('/api/tracking/reverse-geocode', {
      method: 'POST',
      headers: { ...(await getHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: lookupPoints.map((point) => ({ id: point.id, latitude: point.latitude, longitude: point.longitude })) }),
    });
    const payload = await response.json() as { ok?: boolean; data?: Array<{ id: string; address: string | null; street: string | null; houseNumber: string | null; city: string | null }> };
    if (!response.ok || !payload.ok || !Array.isArray(payload.data)) return;
    setAddresses((current) => ({
      ...current,
      ...Object.fromEntries(payload.data!.map((address) => [address.id, address])),
    }));
  }, [getHeaders]);

  const loadDay = useCallback(async (dateValue = selectedDate) => {
    if (!user || !dateValue) return;
    setIsLoading(true);
    setError(null);
    setIsLoaded(false);
    try {
      const range = getLocalDayRange(dateValue);
      const response = await fetch(`/api/tracking/traccar?${new URLSearchParams(range).toString()}`, {
        headers: await getHeaders(),
        cache: 'no-store',
      });
      const payload = await response.json() as { ok?: boolean; data?: TrackingPosition[]; message?: string };
      if (!response.ok || !payload.ok || !Array.isArray(payload.data)) throw new Error(payload.message || 'Trackingdata kon niet worden geladen.');
      const sorted = payload.data.sort((left, right) => new Date(left.recorded_at).getTime() - new Date(right.recorded_at).getTime());
      setPoints(sorted);
      setAddresses({});
      stopLookupRef.current = '';
      setIsLoaded(true);
      void reverseGeocode(sorted).catch(() => undefined);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Trackingdata kon niet worden geladen.';
      setError(message);
      toast({ title: 'GPS-analyse niet beschikbaar', description: message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [getHeaders, reverseGeocode, selectedDate, toast, user]);

  useEffect(() => {
    if (user) void loadDay();
  }, [loadDay, user]);

  const enrichedPoints = useMemo(
    () => points.map((point) => ({ ...point, ...addresses[point.id] })),
    [addresses, points],
  );
  const stops = useMemo(() => detectStops(enrichedPoints, quotes), [enrichedPoints, quotes]);
  const trips = useMemo(() => detectTrips(enrichedPoints, stops), [enrichedPoints, stops]);
  const distanceKm = useMemo(() => totalDistanceKm(enrichedPoints), [enrichedPoints]);
  const dateHours = useMemo(
    () => history.filter((entry) => entry.date === selectedDate).reduce((total, entry) => total + entry.totalHours, 0),
    [history, selectedDate],
  );
  const fuelLitres = distanceKm / Math.max(0.1, kmPerLitre);
  const fuelCost = fuelLitres * fuelPrice;
  const clientHours = useMemo(() => {
    const grouped = new Map<string, { quote: QuoteLike; hours: number }>();
    history.filter((entry) => entry.date === selectedDate && entry.quoteId).forEach((entry) => {
      const quote = quotes.find((candidate) => candidate.id === entry.quoteId);
      if (!quote) return;
      const current = grouped.get(quote.id);
      grouped.set(quote.id, { quote, hours: (current?.hours || 0) + entry.totalHours });
    });
    return Array.from(grouped.values()).sort((left, right) => right.hours - left.hours);
  }, [history, quotes, selectedDate]);

  useEffect(() => {
    if (!stops.length) return;
    const lookupKey = stops.map((stop) => stop.id).join('|');
    if (stopLookupRef.current === lookupKey) return;
    stopLookupRef.current = lookupKey;
    void reverseGeocode(stops.map((stop) => stop.position)).catch(() => undefined);
  }, [reverseGeocode, stops]);

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-4 sm:flex-row sm:items-center sm:justify-end">
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input id="intelligence-date" aria-label="Datum" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="w-full pl-9 sm:w-[180px]" />
        </div>
        <Button type="button" onClick={() => void loadDay()} disabled={isLoading || !selectedDate}><RefreshCw className={isLoading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />{isLoading ? 'Verversen...' : 'Ververs dag'}</Button>
      </div>

      {error ? <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-950/20 p-4 text-sm text-amber-100"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="font-medium">GPS-analyse kon niet worden geladen</div><div className="mt-1 text-amber-100/70">{error}</div></div></div> : null}

      {!isLoaded ? (
        <Card className="border-dashed"><CardContent className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><Activity className="h-5 w-5 animate-pulse text-emerald-400" />{isLoading ? 'De dag wordt opgebouwd uit je GPS-punten...' : 'Kies een datum om de daganalyse te starten.'}</CardContent></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={<Clock3 className="h-4 w-4" />} label="Geregistreerde uren" value={formatHours(dateHours)} detail={`${clientHours.length} klant${clientHours.length === 1 ? '' : 'en'} gekoppeld`} tone="emerald" />
            <Metric icon={<Route className="h-4 w-4" />} label="Gereden afstand" value={`${distanceKm.toFixed(1)} km`} detail={`${trips.length} herkende ritten`} tone="blue" />
            <Metric icon={<Fuel className="h-4 w-4" />} label="Brandstof" value={formatCurrency(fuelCost)} detail={`${fuelLitres.toFixed(1)} liter · €${fuelPrice.toFixed(2)}/l`} tone="amber" />
            <Metric icon={<Target className="h-4 w-4" />} label="Werkdagdoel" value={`${Math.round((dateHours / 8) * 100)}%`} detail={dateHours >= 8 ? 'dagdoel gehaald' : `${formatHours(Math.max(0, 8 - dateHours))} tot 8 uur`} tone={dateHours >= 8 ? 'emerald' : 'default'} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
            <Card className="overflow-hidden"><CardHeader className="gap-1"><div className="flex items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Navigation className="h-5 w-5 text-emerald-400" />Route van de dag</CardTitle><CardDescription>{enrichedPoints.length.toLocaleString('nl-NL')} GPS-punten · {enrichedPoints[0] ? formatTime(enrichedPoints[0].recorded_at) : '—'} tot {enrichedPoints.at(-1) ? formatTime(enrichedPoints.at(-1)!.recorded_at) : '—'}</CardDescription></div><Button variant="ghost" size="icon" asChild title="Open technische GPS-diagnose"><Link href={`/debug/tracking?date=${selectedDate}`}><ArrowRight className="h-4 w-4" /></Link></Button></div></CardHeader><CardContent><TrackingRouteMap positions={enrichedPoints} /></CardContent></Card>

          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Fuel className="h-5 w-5 text-amber-300" />Kosten van onderweg</CardTitle><CardDescription>De echte kostprijs van je bewegingen, los van je uurtarief.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="rounded-2xl bg-amber-500/10 p-4"><div className="text-xs text-muted-foreground">Brandstofindicatie</div><div className="mt-1 text-3xl font-semibold text-amber-200">{formatCurrency(fuelCost)}</div><div className="mt-1 text-xs text-muted-foreground">{distanceKm.toFixed(1)} km ÷ {kmPerLitre.toFixed(1)} km/l × {formatCurrency(fuelPrice)}</div></div><div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl border border-border/70 p-3"><div className="text-xs text-muted-foreground">Liter verbruikt</div><div className="mt-1 font-semibold">{fuelLitres.toFixed(1)} l</div></div><div className="rounded-xl border border-border/70 p-3"><div className="text-xs text-muted-foreground">Per werkuur</div><div className="mt-1 font-semibold">{dateHours > 0 ? formatCurrency(fuelCost / dateHours) : '—'}</div></div></div><Button variant="outline" size="sm" onClick={() => setShowSettings((value) => !value)}><Settings2 className="mr-2 h-4 w-4" />Voertuiginstellingen</Button>{showSettings ? <div className="space-y-2 rounded-xl border border-border/70 bg-muted/10 p-3"><div className="text-xs text-muted-foreground">Deze voertuigwaarde geldt vanaf {formatFuelSettingDate(activeFuelSetting.effectiveFrom)}.</div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label className="text-xs">Kilometer per liter</Label><Input type="number" min="1" step="0.1" value={kmPerLitre} onChange={(event) => updateActiveFuelSetting({ kmPerLitre: Number(event.target.value) || DEFAULT_KM_PER_LITRE })} /></div><div className="space-y-1"><Label className="text-xs">Brandstofprijs per liter</Label><Input type="number" min="0.1" step="0.01" value={fuelPrice} onChange={(event) => updateActiveFuelSetting({ fuelPrice: Number(event.target.value) || DEFAULT_FUEL_PRICE })} /></div></div></div> : null}<div className="flex items-start gap-2 text-xs text-muted-foreground"><Car className="mt-0.5 h-4 w-4 shrink-0" />Op basis van je ingestelde auto: 1 op {kmPerLitre.toFixed(1)}. Dit is een kostprijsindicatie; parkeren, onderhoud en afschrijving komen hier nog bovenop.</div></CardContent></Card>
          </div>

          <Card><CardHeader><CardTitle className="flex items-center gap-2"><BriefcaseBusiness className="h-5 w-5 text-emerald-400" />Uren per klant</CardTitle><CardDescription>De uren uit deze dag, rechtstreeks gekoppeld aan je offertes.</CardDescription></CardHeader><CardContent className="space-y-3">{clientHours.length === 0 ? <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Geen klanturen geregistreerd op deze datum.</div> : clientHours.map(({ quote, hours }) => { const gpsStop = stops.find((stop) => stop.matchedQuote?.id === quote.id); return <div key={quote.id} className="rounded-2xl border border-border/70 p-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate font-medium">{quoteClientName(quote)}</div><div className="truncate text-xs text-muted-foreground">{quoteLabel(quote)}</div></div><div className="text-right"><div className="font-semibold text-emerald-300">{formatHours(hours)}</div><div className="text-xs text-muted-foreground">geregistreerd</div></div></div><div className="mt-3 flex flex-wrap items-center gap-2 text-xs">{gpsStop ? <Badge variant="outline" className="border-emerald-500/30 text-emerald-300"><CheckCircle2 className="mr-1 h-3 w-3" />GPS bevestigt bezoek ({formatDuration(gpsStop.durationMinutes)})</Badge> : <Badge variant="outline" className="border-amber-500/30 text-amber-300"><XCircle className="mr-1 h-3 w-3" />Geen GPS-match</Badge>}</div></div>; })}</CardContent></Card>

          <Card><CardHeader><div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><CardTitle className="flex items-center gap-2"><Route className="h-5 w-5 text-blue-300" />Ritten en tijdlijn</CardTitle><CardDescription>Afgeleid uit de overgang tussen rustpunten. Kleine GPS-bewegingen worden bewust niet als rit geteld.</CardDescription></div><div className="text-xs text-muted-foreground">{trips.reduce((sum, trip) => sum + trip.distanceKm, 0).toFixed(1)} km in herkende ritten</div></div></CardHeader><CardContent>{trips.length === 0 ? <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Geen ritten van minimaal 500 meter herkend.</div> : <div className="grid gap-3 md:grid-cols-2">{trips.map((trip) => <div key={trip.id} className="flex items-start gap-3 rounded-2xl border border-border/70 p-4"><div className="rounded-xl bg-blue-500/10 p-2"><Car className="h-4 w-4 text-blue-300" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><span className="font-medium">{trip.distanceKm.toFixed(1)} km</span><span className="text-xs text-muted-foreground">{formatTime(trip.start)}–{formatTime(trip.end)}</span></div><div className="mt-1 truncate text-sm text-muted-foreground">{trip.from} <ArrowRight className="mx-1 inline h-3 w-3" /> {trip.to}</div><div className="mt-2 text-xs text-muted-foreground">Indicatieve brandstof: {formatCurrency((trip.distanceKm / Math.max(0.1, kmPerLitre)) * fuelPrice)}</div></div></div>)}</div>}</CardContent></Card>

        </>
      )}
    </section>
  );
}
