import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pushError, pushHeaders, pushUser } from '@/lib/push-server';
import { entriesForRouteDay, isFirstJobDay, isMorningRoute, routeDate } from '@/lib/departure-planning';
import { fillRouteAddress, readRouteEntries, readRouteOrigin } from '@/lib/departure-server';
import { calculateDeparturePlan } from '@/lib/departure-maps-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({
  quoteId: z.string().max(200).optional(), entryId: z.string().max(200).optional(),
  origin: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(500), recordedAt: z.string().datetime() }).optional(),
}).refine(data => data.quoteId || data.entryId);

export async function POST(request: Request): Promise<NextResponse> {
  const uid = await pushUser(request);
  if (!uid) return pushError('Geen toegang.', 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return pushError('Offerte of planning ontbreekt, of de locatie is ongeldig.', 400);
  const now = new Date();
  if (!isMorningRoute(now)) return NextResponse.json({ ok: true, eligible: false }, { headers: pushHeaders });
  try {
    const entries = await readRouteEntries(uid);
    const date = routeDate(now);
    const entry = entriesForRouteDay(entries, date).find(row => parsed.data.entryId
      ? row.id === parsed.data.entryId : row.quoteId === parsed.data.quoteId);
    if (!entry || !isFirstJobDay(entry, entries, date)) {
      return NextResponse.json({ ok: true, eligible: false }, { headers: pushHeaders });
    }
    // Eerst vaststellen dat deze klus bij de ingelogde gebruiker en vandaag hoort.
    const supplied = parsed.data.origin;
    if (supplied && (Date.parse(supplied.recordedAt) < now.getTime() - 120_000 || Date.parse(supplied.recordedAt) > now.getTime() + 60_000)) {
      return pushError('De telefoonlocatie is verlopen. Vraag de locatie opnieuw op.', 400);
    }
    try {
      const origin = supplied ? { ...supplied, label: 'huidige telefoonlocatie' } : await readRouteOrigin(uid, date, now, false);
      const plan = await calculateDeparturePlan({ entry: await fillRouteAddress(uid, entry), date, origin, viaBouwmaat: true, now });
      return NextResponse.json({ ok: true, eligible: true, plan }, { headers: pushHeaders });
    } catch (error) {
      return NextResponse.json({ ok: true, eligible: true, error: error instanceof Error ? error.message : 'Route berekenen mislukt.' }, { headers: pushHeaders });
    }
  } catch { return pushError('Planning controleren mislukt. Probeer opnieuw of kies direct naar de klant.', 503); }
}
