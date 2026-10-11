import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { getPushConfig, pushError, pushHeaders, pushId, pushUser } from '@/lib/push-server';
import { pushSubscriptionSchema } from '@/lib/push-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const uid = await pushUser(request);
  if (!uid) return pushError('Log opnieuw in.', 401);
  try {
    const config = await getPushConfig();
    return NextResponse.json({ publicKey: config.publicKey }, { headers: pushHeaders });
  } catch { return pushError('Meldingen konden niet worden voorbereid. Probeer het opnieuw.', 503); }
}

export async function POST(request: Request): Promise<NextResponse> {
  const uid = await pushUser(request);
  if (!uid) return pushError('Log opnieuw in.', 401);
  const parsed = pushSubscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return pushError('Ongeldige apparaatregistratie.', 400);
  try {
    const { firestore } = initFirebaseAdmin();
    await firestore.collection('push_subscriptions').doc(pushId(parsed.data.endpoint)).set({
      userId: uid, subscription: parsed.data, updatedAt: Date.now(),
    });
    return NextResponse.json({ ok: true }, { headers: pushHeaders });
  } catch { return pushError('Apparaat opslaan mislukt. Probeer het opnieuw.', 503); }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const uid = await pushUser(request);
  if (!uid) return pushError('Log opnieuw in.', 401);
  const body = await request.json().catch(() => null);
  if (typeof body?.endpoint !== 'string' || body.endpoint.length > 2048) return pushError('Ongeldig apparaat.', 400);
  try {
    const { firestore } = initFirebaseAdmin();
    const ref = firestore.collection('push_subscriptions').doc(pushId(body.endpoint));
    await firestore.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (snapshot.data()?.userId === uid) tx.delete(ref);
    });
    return NextResponse.json({ ok: true }, { headers: pushHeaders });
  } catch { return pushError('Meldingen uitschakelen mislukt. Probeer het opnieuw.', 503); }
}
