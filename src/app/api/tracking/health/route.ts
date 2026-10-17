import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { gpsHealth } from '@/lib/gps-health';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const { auth } = initFirebaseAdmin();
  const uid = (await auth.verifyIdToken(request.headers.get('authorization')?.replace(/^Bearer /, '') || '').catch(() => null))?.uid;
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  if (!process.env.CALVORA_USER_ID || uid !== process.env.CALVORA_USER_ID.trim()) return NextResponse.json({ enabled: false });
  try {
    const server = process.env.TRACCAR_SERVER_URL?.replace(/\/$/, '');
    const token = process.env.TRACCAR_API_TOKEN;
    const identifier = process.env.TRACCAR_DEVICE_IDENTIFIER;
    if (!server || !token || !identifier) throw new Error('Niet ingesteld');
    const get = async (path: string) => {
      const r = await fetch(server + path, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error('GPS niet bereikbaar');
      return r.json();
    };
    const devices = await get(`/api/devices?uniqueId=${encodeURIComponent(identifier)}`);
    const device = devices.find((d: { uniqueId?: string }) => d.uniqueId === identifier);
    if (!device?.positionId) throw new Error('Geen laatste positie');
    const positions = await get(`/api/positions?id=${encodeURIComponent(device.positionId)}`);
    const position = positions.find((p: { deviceId?: number }) => p.deviceId === device.id);
    return NextResponse.json({ enabled: true, ...gpsHealth(position?.fixTime || position?.deviceTime) });
  } catch {
    return NextResponse.json({ enabled: true, ...gpsHealth(null) });
  }
}
