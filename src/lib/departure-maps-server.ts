import {
  arrivalForEntry, MATERIAL_PICKUP_MINUTES, routeTime, routeWithStop, storeOpenDuring,
  type DeparturePlan, type OpeningHours, type RouteEntry, type RouteOrigin,
} from '@/lib/departure-planning';

interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  businessStatus?: string;
  currentOpeningHours?: OpeningHours;
}
type Waypoint = { address: string } | { placeId: string } | { location: { latLng: { latitude: number; longitude: number } } };

function mapsKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim()
    || process.env.GOOGLE_GEOCODING_API_KEY?.trim() || process.env.ANTIGRAVITY_GOOGLE_API_KEY?.trim();
  if (!key) throw new Error('Routeberekening is nog niet ingesteld: een Google Maps-sleutel met Routes API en Places API (New) is nodig.');
  return key;
}

async function googleRequest<T>(url: string, body: object, mask: string): Promise<T> {
  const response = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': mapsKey(), 'X-Goog-FieldMask': mask },
    body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(response.status === 403
    ? 'Google routeberekening heeft geen toegang. Controleer de API-sleutel, Routes API, Places API (New) en facturering.'
    : 'Google Maps kan de route nu niet berekenen. Probeer het opnieuw.');
  return response.json() as Promise<T>;
}

function originWaypoint(origin: RouteOrigin): Waypoint {
  if (origin.address) return { address: origin.address };
  if (Number.isFinite(origin.latitude) && Number.isFinite(origin.longitude)) {
    return { location: { latLng: { latitude: origin.latitude!, longitude: origin.longitude! } } };
  }
  throw new Error('Vertrekplek ontbreekt.');
}

async function driveMinutes(origin: Waypoint, destination: Waypoint, departure: Date, now: Date): Promise<number> {
  const result = await googleRequest<{ routes?: { duration?: string }[] }>(
    'https://routes.googleapis.com/directions/v2:computeRoutes', {
      origin, destination, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
      // Google accepteert voor autoritten geen vertrek in het verleden.
      departureTime: new Date(Math.max(departure.getTime(), now.getTime() + 60_000)).toISOString(),
      languageCode: 'nl-NL', regionCode: 'NL',
    }, 'routes.duration');
  const seconds = Number(result.routes?.[0]?.duration?.replace(/s$/, ''));
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Geen autoroute gevonden.');
  return Math.ceil(seconds / 60);
}

/** Voor DRIVE ondersteunt Google geen arrivalTime: schat vertrek en reken opnieuw met ochtendverkeer. */
async function driveToArrive(origin: Waypoint, destination: Waypoint, arrival: Date, now: Date) {
  const initial = await driveMinutes(origin, destination, new Date(arrival.getTime() - 30 * 60_000), now);
  const revised = await driveMinutes(origin, destination, new Date(arrival.getTime() - initial * 60_000), now);
  const minutes = Math.max(initial, revised);
  return { minutes, departure: new Date(arrival.getTime() - minutes * 60_000) };
}

async function nearbyBouwmaat(origin: RouteOrigin): Promise<GooglePlace[]> {
  let center = { latitude: origin.latitude, longitude: origin.longitude };
  if (origin.address) {
    const lookup = await googleRequest<{ places?: { location?: { latitude: number; longitude: number } }[] }>(
      'https://places.googleapis.com/v1/places:searchText',
      { textQuery: origin.address, pageSize: 1, languageCode: 'nl', regionCode: 'NL' }, 'places.location');
    const location = lookup.places?.[0]?.location;
    if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
      throw new Error('Vertrekadres niet gevonden. Vul straat, huisnummer en plaats in.');
    }
    center = location;
  }
  const result = await googleRequest<{ places?: GooglePlace[] }>('https://places.googleapis.com/v1/places:searchText', {
    textQuery: 'Bouwmaat',
    languageCode: 'nl', regionCode: 'NL', pageSize: 5, rankPreference: 'DISTANCE',
    locationBias: { circle: { center, radius: 50000 } },
  }, 'places.id,places.displayName,places.formattedAddress,places.businessStatus,places.currentOpeningHours');
  return (result.places || []).filter(place => /^bouwmaat\b/i.test(place.displayName?.text || '')
    && place.businessStatus === 'OPERATIONAL' && place.id && place.formattedAddress);
}

export async function calculateDeparturePlan(input: {
  entry: RouteEntry; date: string; origin: RouteOrigin; viaBouwmaat: boolean; now?: Date;
}): Promise<DeparturePlan> {
  const { entry, date, origin, viaBouwmaat } = input;
  const now = input.now || new Date();
  if (!entry.address) throw new Error('Het projectadres ontbreekt in de planning.');
  const arrival = arrivalForEntry(entry, date);
  const from = originWaypoint(origin);
  const to = { address: entry.address };
  let plan: DeparturePlan;
  if (!viaBouwmaat) {
    const drive = await driveToArrive(from, to, arrival, now);
    plan = { entry, date, origin, arrivalAt: arrival.toISOString(), departureAt: drive.departure.toISOString(),
      driveToStoreMinutes: 0, driveToClientMinutes: drive.minutes, pickupMinutes: 0, mapsUrl: routeWithStop(entry.address) };
  } else {
    const places = await nearbyBouwmaat(origin);
    if (!places.length) throw new Error('Geen Bouwmaat in de buurt gevonden. Je kunt rechtstreeks naar de klant navigeren.');
    const candidates = await Promise.allSettled(places.map(async store => {
      const waypoint = { placeId: store.id };
      const onward = await driveToArrive(waypoint, to, arrival, now);
      const storeArrival = new Date(onward.departure.getTime() - MATERIAL_PICKUP_MINUTES * 60_000);
      const open = storeOpenDuring(store.currentOpeningHours, storeArrival, onward.departure);
      if (open !== true) return { open, plan: null };
      const first = await driveToArrive(from, waypoint, storeArrival, now);
      // Bij te laat vertrekken moet de winkel ook bij aankomst vanaf NU open zijn.
      if (first.departure < now) {
        const actualArrival = new Date(now.getTime() + first.minutes * 60_000);
        const actualDeparture = new Date(actualArrival.getTime() + MATERIAL_PICKUP_MINUTES * 60_000);
        const openNow = storeOpenDuring(store.currentOpeningHours, actualArrival, actualDeparture);
        if (openNow !== true) return { open: openNow, plan: null };
      }
      const result: DeparturePlan = {
        entry, date, origin, arrivalAt: arrival.toISOString(), departureAt: first.departure.toISOString(),
        driveToStoreMinutes: first.minutes, driveToClientMinutes: onward.minutes, pickupMinutes: MATERIAL_PICKUP_MINUTES,
        store: { id: store.id, name: store.displayName!.text!, address: store.formattedAddress!,
          arrivalAt: storeArrival.toISOString(), departureAt: onward.departure.toISOString() },
        mapsUrl: routeWithStop(entry.address, { id: store.id, address: store.formattedAddress! }),
      };
      return { open, plan: result };
    }));
    const usable = candidates.flatMap(result => result.status === 'fulfilled' && result.value.plan ? [result.value.plan] : [])
      .sort((a, b) => a.driveToStoreMinutes - b.driveToStoreMinutes
        || a.driveToClientMinutes - b.driveToClientMinutes);
    if (!usable.length) {
      const failure = candidates.find(result => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
      throw new Error(`Geen gecontroleerde Bouwmaat-stop mogelijk vóór ${routeTime(arrival)}: vestigingen zijn gesloten of openingstijden ontbreken. Haal materialen eerder op of pas je aankomsttijd aan.`);
    }
    plan = usable[0];
  }
  if (Date.parse(plan.departureAt) < now.getTime()) {
    plan.warning = 'De berekende vertrektijd is al voorbij. De geplande aankomst is mogelijk niet meer haalbaar; bekijk de actuele aankomsttijd in Google Maps.';
  }
  return plan;
}
