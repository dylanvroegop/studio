import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/firebase/admin';
import { rebuildQuoteDataJsonForUser } from '@/lib/quote-calculation-cache';

export async function regenerateQuoteArtifactsForAdmin(params: {
  quoteId: string;
  actorUid: string;
  actorEmail?: string | null;
}): Promise<Record<string, unknown>> {
  const { quoteId, actorUid, actorEmail } = params;
  const { firestore } = initFirebaseAdmin();
  const quoteRef = firestore.collection('quotes').doc(quoteId);
  const quoteSnap = await quoteRef.get();

  if (!quoteSnap.exists) {
    throw new Error('Offerte niet gevonden');
  }

  const quoteData = (quoteSnap.data() || {}) as Record<string, unknown>;
  const ownerUid = typeof quoteData.userId === 'string' ? quoteData.userId : '';
  if (!ownerUid) {
    throw new Error('Offerte heeft geen eigenaar');
  }

  const rebuilt = await rebuildQuoteDataJsonForUser({
    quoteId,
    uid: ownerUid,
  });

  await quoteRef.set(
    {
      calculationStartedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      adminLastPdfRegenerationAt: FieldValue.serverTimestamp(),
      adminLastPdfRegeneratedBy: actorUid,
      adminLastPdfRegeneratedByEmail: actorEmail || null,
    },
    { merge: true }
  );

  return {
    quoteId,
    ownerUid,
    rebuiltCreated: rebuilt.created,
    rebuiltRow: rebuilt.data,
  };
}
