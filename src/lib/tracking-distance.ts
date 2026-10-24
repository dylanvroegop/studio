export interface DistancePoint { latitude: number; longitude: number; recorded_at: string; device_id?: string }

export function gpsDistanceKm(points: DistancePoint[]): number | null {
  const valid = points.filter((point) => Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180 && Number.isFinite(Date.parse(point.recorded_at)))
    .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
  if (valid.length < 2) return null;
  let total = 0;
  for (let index = 1; index < valid.length; index++) {
    const a = valid[index - 1];
    const b = valid[index];
    if (a.device_id !== b.device_id) continue;
    const radians = Math.PI / 180;
    const h = Math.sin((b.latitude - a.latitude) * radians / 2) ** 2
      + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin((b.longitude - a.longitude) * radians / 2) ** 2;
    total += 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)));
  }
  return total;
}

export function amsterdamMidnight(date: string): string {
  const utc = new Date(`${date}T00:00:00Z`);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Amsterdam', timeZoneName: 'shortOffset' })
    .formatToParts(utc).find((part) => part.type === 'timeZoneName')?.value;
  const hours = Number(offset?.replace('GMT', ''));
  if (!Number.isFinite(hours)) throw new Error('Tijdzone kon niet worden bepaald.');
  return new Date(utc.getTime() - hours * 3600000).toISOString();
}
