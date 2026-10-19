import { gpsHealth, type GpsHealth } from '@/lib/gps-health';

interface Position { deviceId?: number; fixTime?: string; deviceTime?: string; valid?: boolean }

export function recentGpsHealth(positions: Position[], deviceId: number, now = Date.now()): GpsHealth {
  // Een fout punt in de toekomst mag actuele, geldige punten niet overschaduwen.
  const times = positions.filter(p => p.deviceId === deviceId && p.valid !== false)
    .map(p => Date.parse(p.fixTime || p.deviceTime || ''))
    .filter(time => Number.isFinite(time) && time <= now + 5 * 60_000);
  return gpsHealth(times.length ? new Date(Math.max(...times)).toISOString() : null, now);
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
  return recentGpsHealth(positions, device.id, now);
}
