import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { pushError, pushHeaders, pushUser } from '@/lib/push-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const uid = await pushUser(request);
  if (!uid) return pushError('Log opnieuw in.', 401);
  const id = new URL(request.url).searchParams.get('id');
  if (id && !/^[a-f0-9]{64}$/.test(id)) return pushError('Ongeldige melding.', 400);
  try {
    const collection = initFirebaseAdmin().firestore.collection('push_inbox').doc(uid).collection('messages');
    if (id) {
      const document = await collection.doc(id).get();
      if (!document.exists) return pushError('Melding niet gevonden.', 404);
      return NextResponse.json({ messages: [{ ...document.data(), id: document.id }] }, { headers: pushHeaders });
    }
    const snapshot = await collection.orderBy('createdAt', 'desc').limit(100).get();
    return NextResponse.json({ messages: snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) }, { headers: pushHeaders });
  } catch { return pushError('Meldingen ophalen mislukt. Probeer het opnieuw.', 503); }
}
