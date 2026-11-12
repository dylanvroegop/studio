export const ROUTE_TIMEZONE = 'Europe/Amsterdam';
export const MATERIAL_PICKUP_MINUTES = 30;

export interface RouteEntry {
  id: string;
  quoteId: string;
  start: string;
  end: string;
  status: string;
  planningType?: string;
  isAllDay?: boolean;
  isGoogleCalendarHistory?: boolean;
  parentEntryId?: string;
  clientName: string;
  address: string;
}

export interface RouteOrigin {
  latitude?: number;
  longitude?: number;
  address?: string;
  label: string;
  recordedAt?: string;
}

export interface DeparturePlan {
  entry: RouteEntry;
  date: string;
  origin: RouteOrigin;
  arrivalAt: string;
  departureAt: string;
  driveToStoreMinutes: number;
  driveToClientMinutes: number;
  pickupMinutes: number;
  store?: { id: string; name: string; address: string; arrivalAt: string; departureAt: string };
  mapsUrl: string;
  warning?: string;
}

export function routeDate(value: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ROUTE_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value));
}

export function routeTime(value: Date | string): string {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: ROUTE_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value));
}

export function nextRouteDate(date: string): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** Nederlandse kloktijd, onafhankelijk van de tijdzone van telefoon of server. */
export function routeInstant(date: string, time: string): Date {
  const utc = Date.parse(`${date}T${time}:00Z`);
  let value = utc;
  for (let i = 0; i < 2; i++) {
    const offset = new Intl.DateTimeFormat('en-US', { timeZone: ROUTE_TIMEZONE, timeZoneName: 'longOffset' })
      .formatToParts(new Date(value)).find(part => part.type === 'timeZoneName')?.value || '';
    const match = offset.match(/GMT([+-])(\d{2}):(\d{2})/);
    value = utc - (match ? (match[1] === '+' ? 1 : -1) * (+match[2] * 60 + +match[3]) * 60_000 : 0);
  }
  return new Date(value);
}

export function isMorningRoute(now = new Date()): boolean {
  const hour = Number(routeTime(now).slice(0, 2));
  return hour >= 5 && hour < 10;
}

function isRealEntry(entry: RouteEntry): boolean {
  return !entry.isGoogleCalendarHistory && entry.status !== 'cancelled' && entry.status !== 'pending';
}

export function entriesForRouteDay(entries: RouteEntry[], date: string): RouteEntry[] {
  return entries.filter(entry => isRealEntry(entry) && entry.status !== 'completed'
    && routeDate(entry.start) <= date
    // Calendar eindmomenten zijn exclusief, ook bij meerdaagse hele-dagblokken.
    && routeDate(new Date(Date.parse(entry.end) - 1)) >= date)
    .sort((a, b) => arrivalForEntry(a, date).getTime() - arrivalForEntry(b, date).getTime() || a.id.localeCompare(b.id));
}

export function arrivalForEntry(entry: RouteEntry, date: string): Date {
  return routeInstant(date, entry.isAllDay ? '08:00' : routeTime(entry.start));
}

export function isFirstJobDay(entry: RouteEntry, entries: RouteEntry[], date: string): boolean {
  if (!isRealEntry(entry) || entry.planningType === 'werkbespreking' || entry.status === 'completed') return false;
  // Voltooide eerdere dagen tellen mee; anders wordt dag 2 opnieuw de eerste dag.
  const group = entries.filter(candidate => isRealEntry(candidate) && candidate.planningType !== 'werkbespreking'
    && (entry.quoteId ? candidate.quoteId === entry.quoteId
      : (candidate.parentEntryId || candidate.id) === (entry.parentEntryId || entry.id)));
  const first = group.sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
  return Boolean(first && routeDate(first.start) === date && routeDate(entry.start) === date);
}

export function routeWithStop(address: string, store?: { id: string; address: string }): string {
  const params = new URLSearchParams({ api: '1', destination: address, travelmode: 'driving' });
  // Laat Maps de actuele locatie bepalen zodra de navigatie daadwerkelijk start.
  if (store) {
    params.set('waypoints', store.address);
    params.set('waypoint_place_ids', store.id);
  }
  return `https://www.google.com/maps/dir/?${params}`;
}

export interface OpeningPoint { date?: { year: number; month: number; day: number }; day?: number; hour?: number; minute?: number }
export interface OpeningHours { periods?: { open?: OpeningPoint; close?: OpeningPoint }[] }

/** Alleen datumgebonden actuele uren; ontbrekende uren zijn geen bewijs dat de winkel open is. */
export function storeOpenDuring(hours: OpeningHours | undefined, start: Date, end: Date): boolean | null {
  if (!hours || !Array.isArray(hours.periods)) return null;
  const pointTime = (point: OpeningPoint): number | null => {
    if (!point.date) return null;
    const { year, month, day } = point.date;
    return routeInstant(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      `${String(point.hour || 0).padStart(2, '0')}:${String(point.minute || 0).padStart(2, '0')}`).getTime();
  };
  let unknown = false;
  for (const period of hours.periods) {
    if (!period.open) { unknown = true; continue; }
    if (!period.close && period.open.day === 0 && !period.open.hour && !period.open.minute) return true;
    const from = pointTime(period.open), until = period.close ? pointTime(period.close) : null;
    if (from === null || until === null) { unknown = true; continue; }
    if (from <= start.getTime() && until >= end.getTime()) return true;
  }
  return unknown ? null : false;
}

export function departureSummary(plan: DeparturePlan): string {
  const lines = [
    `Vertrek rond ${routeTime(plan.departureAt)} → ${plan.entry.clientName || 'klant'} om ${routeTime(plan.arrivalAt)}.`,
    plan.entry.address,
  ];
  if (plan.store) lines.push(`${plan.driveToStoreMinutes} min rijden naar ${plan.store.name} (${routeTime(plan.store.arrivalAt)}).`,
    `${plan.pickupMinutes} min materialen halen; om ${routeTime(plan.store.departureAt)} door naar de klant (${plan.driveToClientMinutes} min rijden).`);
  else lines.push(`Rechtstreeks: ${plan.driveToClientMinutes} min rijden.`);
  lines.push(`Vanaf: ${plan.origin.label}${plan.origin.recordedAt ? ` (locatie van ${routeTime(plan.origin.recordedAt)})` : ''}.`,
    'Verwachte reistijd, geen garantie. Geen extra filebuffer. Controleer opnieuw als je vertrekplek verandert.');
  if (plan.warning) lines.push(plan.warning);
  return lines.join('\n');
}
