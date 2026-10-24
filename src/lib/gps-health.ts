export interface GpsHealth { state: 'ok' | 'stationary' | 'stale' | 'unknown'; lastFixAt: string | null; minutesWithoutFix: number | null }
export function gpsHealth(lastFixAt: unknown, now = Date.now()): GpsHealth {
  const time = typeof lastFixAt === 'string' ? Date.parse(lastFixAt) : NaN;
  if (!Number.isFinite(time) || time > now + 5 * 60_000) return { state: 'unknown', lastFixAt: null, minutesWithoutFix: null };
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  return { state: minutes >= 20 ? 'stale' : 'ok', lastFixAt: new Date(time).toISOString(), minutesWithoutFix: minutes };
}
