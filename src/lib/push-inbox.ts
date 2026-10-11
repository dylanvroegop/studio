import { initFirebaseAdmin } from '@/firebase/admin';
import { pushId, sendUserPush } from '@/lib/push-server';
import { pushMessageSchema } from '@/lib/push-validation';
import { z } from 'zod';

export const inboxMessageSchema = pushMessageSchema.extend({ body: z.string().trim().min(1).max(20000) });
export type InboxMessage = z.infer<typeof inboxMessageSchema>;

export async function deliverAppMessage(uid: string, input: InboxMessage) {
  const message = inboxMessageSchema.parse(input);
  const id = pushId(message.eventId);
  const { firestore } = initFirebaseAdmin();
  const ref = firestore.collection('push_inbox').doc(uid).collection('messages').doc(id);
  // Idempotent opslaan vóór verzenden. Een retry wijzigt geen eerder bewaard bericht.
  const saved = await firestore.runTransaction(async tx => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data() as InboxMessage;
    tx.create(ref, { ...message, createdAt: Date.now() });
    return message;
  });
  const summary = saved.body.length > 260 ? saved.body.slice(0, 257) + '…' : saved.body;
  const result = await sendUserPush(uid, { ...saved, body: summary, url: `/meldingen?id=${id}` });
  return { ...result, notificationId: id, saved: true };
}
