import { gpsHealth, type GpsHealth } from '@/lib/gps-health';

interface Position { deviceId?: number; fixTime?: string; deviceTime?: string; valid?: boolean; speed?: number; attributes?: { motion?: boolean } }

export function recentGpsHealth(positions: Position[], deviceId: number, now = Date.now()): GpsHealth {
  // Een fout punt in de toekomst mag actuele, geldige punten niet overschaduwen.
  const latest = positions.filter(p => p.deviceId === deviceId && p.valid !== false)
    .map(position => ({ position, time: Date.parse(position.fixTime || position.deviceTime || '') }))
    .filter(({ time }) => Number.isFinite(time) && time <= now + 5 * 60_000)
    .sort((a, b) => b.time - a.time)[0];
  const health = gpsHealth(latest ? new Date(latest.time).toISOString() : null, now);
  // Expliciete stilstand kan de tracker laten slapen. Dit bewijst geen actuele
  // GPS-verbinding: na maximaal 24 uur zonder punt blijft controle nodig.
  if (latest && health.state === 'stale' && health.minutesWithoutFix! < 24 * 60
    && latest.position.attributes?.motion === false
    && (latest.position.speed === undefined || latest.position.speed === 0)) {
    return { ...health, state: 'stationary' };
  }
  return health;
}

export async function readGpsHealth(now = Date.now()): Promise<GpsHealth> {
  const server = process.env.TRACCAR_SERVER_URL?.trim().replace(/\/$/, '');
  const token = process.env.TRACCAR_API_TOKEN?.trim();
  const identifier = process.env.TRACCAR_DEVICE_IDENTIFIER?.trim();
  if (!server || !token || !identifier) throw new Error('GPS niet ingesteld');
  const get = async (path: string) => {
    const response = await fetch(server + path, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`GPS HTTP ${response.status}`);
    return response.json();
  };
  const devices = await get(`/api/devices?uniqueId=${encodeURIComponent(identifier)}`);
  const device = devices.find((candidate: { uniqueId?: string }) => candidate.uniqueId === identifier);
  if (!device?.id) throw new Error('GPS-apparaat niet gevonden');
  const query = new URLSearchParams({ deviceId: String(device.id), from: new Date(now - 30 * 60_000).toISOString(), to: new Date(now).toISOString() });
  const positions: Position[] = await get(`/api/positions?${query}`);
  // Ook na het venster van 30 minuten moet het laatste stilstandpunt bekend blijven.
  if (device.positionId) {
    const latest: Position[] = await get(`/api/positions?id=${encodeURIComponent(device.positionId)}`);
    positions.push(...latest);
  }
  return recentGpsHealth(positions, device.id, now);
}
