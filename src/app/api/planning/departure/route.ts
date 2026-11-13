import { NextResponse } from 'next/server';
import { z } from 'zod';
import { initFirebaseAdmin } from '@/firebase/admin';
import { pushError, pushHeaders, pushUser } from '@/lib/push-server';
import { entriesForRouteDay, isFirstJobDay, nextRouteDate, routeDate } from '@/lib/departure-planning';
import { fillRouteAddress, readDepartureSettings, readRouteEntries, readRouteOrigin } from '@/lib/departure-server';
import { calculateDeparturePlan } from '@/lib/departure-maps-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const uid = await pushUser(request);
  if (!uid) return pushError('Geen toegang.', 401);
  try {
    const now = new Date(), date = nextRouteDate(routeDate(now));
    const settings = await readDepartureSettings(uid);
    if (new URL(request.url).searchParams.get('preview') !== '1') {
      return NextResponse.json({ ok: true, date, settings }, { headers: pushHeaders });
    }
    const entries = await readRouteEntries(uid), tomorrow = entriesForRouteDay(entries, date);
    if (!tomorrow.length) return NextResponse.json({ ok: true, date, settings, plan: null }, { headers: pushHeaders });
    const entry = await fillRouteAddress(uid, tomorrow[0]);
    const plan = await calculateDeparturePlan({ entry, date, origin: await readRouteOrigin(uid, date, now, true),
      viaBouwmaat: isFirstJobDay(entry, entries, date), now });
    return NextResponse.json({ ok: true, date, settings, plan }, { headers: pushHeaders });
  } catch (error) { return pushError(error instanceof Error ? error.message : 'Vertrektijd berekenen mislukt.', 503); }
}

const settingsSchema = z.object({
  remindersEnabled: z.boolean(), originAddress: z.string().trim().max(400), originDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function PUT(request: Request): Promise<NextResponse> {
  const uid = await pushUser(request);
  if (!uid) return pushError('Geen toegang.', 401);
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.originDate !== nextRouteDate(routeDate(new Date()))) return pushError('Gebruik de vertrekplek voor morgen.', 400);
  try {
    await initFirebaseAdmin().firestore.collection('departure_settings').doc(uid).set(parsed.data);
    return NextResponse.json({ ok: true }, { headers: pushHeaders });
  } catch { return pushError('Vertrekplek opslaan mislukt.', 503); }
}
