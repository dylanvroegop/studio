export const GPS_VISIT_MAX_ACCURACY_M = 25;
export const GPS_VISIT_RADIUS_M = 50;
export const GPS_VISIT_MAX_SPEED_KMH = 5;
export const GPS_VISIT_MIN_DWELL_MINUTES = 10;
export const GPS_VISIT_MIN_POINTS = 3;
export const GPS_VISIT_MAX_POINT_GAP_MINUTES = 2;

/** De oorspronkelijke Traccar-velden; snelheid wordt in knopen aangeleverd. */
export interface GpsVisitPoint {
  id?: string | number;
  deviceId?: string | number;
  valid?: boolean;
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
  speed?: number | null;
  fixTime?: string;
  deviceTime?: string;
  serverTime?: string;
}

export interface GpsVisitSite {
  latitude: number;
  longitude: number;
  isAmbiguous?: boolean;
}

export interface GpsVisitOptions {
  expectedDeviceId: string | number;
  from: string;
  to: string;
  now?: Date;
}

export interface GpsVisitEvidence {
  source: 'traccar_gps';
  startedAt: string;
  endedAt: string;
  dwellMinutes: number;
  pointCount: number;
  maxAccuracyM: number;
  maxDistanceM: number;
}

interface DwellSegment {
  startMs: number;
  endMs: number;
  pointCount: number;
  maxAccuracyM: number;
  maxDistanceM: number;
}

function parseInstant(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day > daysInMonth) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function validCoordinates(latitude: unknown, longitude: unknown): boolean {
  return typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    && (latitude !== 0 || longitude !== 0);
}

function deviceId(value: unknown): string | null {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? String(value) : null;
  return typeof value === 'string' && value.length > 0 && value === value.trim() ? value : null;
}

function distanceMeters(point: GpsVisitPoint, site: GpsVisitSite): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (point.latitude! - site.latitude) * radians;
  const longitudeDelta = (point.longitude! - site.longitude) * radians;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(site.latitude * radians) * Math.cos(point.latitude! * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
}

function sameFix(left: GpsVisitPoint, right: GpsVisitPoint): boolean {
  return deviceId(left.deviceId) === deviceId(right.deviceId)
    && left.valid === right.valid && left.latitude === right.latitude && left.longitude === right.longitude
    && left.accuracy === right.accuracy && left.speed === right.speed;
}

/**
 * Geeft alleen aaneengesloten GPS-verblijf bij één vooraf gevalideerd adres terug.
 * Dit is locatiebewijs; het bewijst niet wat er tijdens het verblijf is gedaan.
 * Onbekende kwaliteit blijft onbekend en wordt nooit aangevuld vanuit de agenda.
 */
export function findGpsVisitEvidence(
  points: readonly GpsVisitPoint[],
  site: GpsVisitSite,
  options: GpsVisitOptions,
): GpsVisitEvidence | null {
  const fromMs = parseInstant(options.from);
  const toMs = parseInstant(options.to);
  const nowMs = (options.now || new Date()).getTime();
  const expectedDeviceId = deviceId(options.expectedDeviceId);
  if (fromMs === null || toMs === null || fromMs >= toMs || !Number.isFinite(nowMs)
    || fromMs > nowMs || !expectedDeviceId || site.isAmbiguous
    || !validCoordinates(site.latitude, site.longitude)) return null;

  const grouped = new Map<number, GpsVisitPoint[]>();
  for (const point of points) {
    const at = parseInstant(point.fixTime);
    // Zonder echte fixtijd kan een onbetrouwbaar punt niet veilig tussen andere
    // punten worden geplaatst. De volledige opgevraagde reeks blijft dan onbekend.
    if (at === null) return null;
    const group = grouped.get(at) || [];
    group.push(point);
    grouped.set(at, group);
  }

  let current: DwellSegment | null = null;
  const completed: DwellSegment[] = [];
  const finishSegment = (): void => {
    if (current && current.pointCount >= GPS_VISIT_MIN_POINTS
      && current.endMs - current.startMs >= GPS_VISIT_MIN_DWELL_MINUTES * 60_000) completed.push(current);
    current = null;
  };

  for (const [at, group] of Array.from(grouped.entries()).sort(([left], [right]) => left - right)) {
    if (at < fromMs || at > toMs || at > nowMs) {
      finishSegment();
      continue;
    }
    const point = group[0];
    const distanceM = validCoordinates(point.latitude, point.longitude) ? distanceMeters(point, site) : Infinity;
    const validPoint = point.valid === true
      && deviceId(point.deviceId) === expectedDeviceId
      && typeof point.accuracy === 'number' && Number.isFinite(point.accuracy)
      && point.accuracy > 0 && point.accuracy <= GPS_VISIT_MAX_ACCURACY_M
      && typeof point.speed === 'number' && Number.isFinite(point.speed) && point.speed >= 0
      && point.speed * 1.852 <= GPS_VISIT_MAX_SPEED_KMH
      && distanceM + point.accuracy <= GPS_VISIT_RADIUS_M
      && group.every((duplicate) => sameFix(point, duplicate));
    // Ook een punt buiten het adres, in beweging of met slechte nauwkeurigheid
    // onderbreekt het verblijf. Nooit eerst zulke punten wegfilteren.
    if (!validPoint) {
      finishSegment();
      continue;
    }
    if (current && at - current.endMs > GPS_VISIT_MAX_POINT_GAP_MINUTES * 60_000) finishSegment();
    if (!current) {
      current = { startMs: at, endMs: at, pointCount: 0, maxAccuracyM: 0, maxDistanceM: 0 };
    }
    current.endMs = at;
    current.pointCount += 1;
    current.maxAccuracyM = Math.max(current.maxAccuracyM, point.accuracy!);
    current.maxDistanceM = Math.max(current.maxDistanceM, distanceM);
  }
  finishSegment();

  const best = completed.sort((left, right) => (right.endMs - right.startMs) - (left.endMs - left.startMs)
    || right.endMs - left.endMs)[0];
  return best ? {
    source: 'traccar_gps',
    startedAt: new Date(best.startMs).toISOString(),
    endedAt: new Date(best.endMs).toISOString(),
    dwellMinutes: (best.endMs - best.startMs) / 60_000,
    pointCount: best.pointCount,
    maxAccuracyM: best.maxAccuracyM,
    maxDistanceM: best.maxDistanceM,
  } : null;
}
