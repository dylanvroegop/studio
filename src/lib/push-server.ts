import { createHash, timingSafeEqual } from 'crypto';
import webpush from 'web-push';
import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { isPushEndpoint, pushMessageSchema, type PushMessage } from '@/lib/push-validation';

export const pushHeaders = { 'Cache-Control': 'no-store' };
export const pushId = (value: string): string => createHash('sha256').update(value).digest('hex');

export async function pushUser(request: Request, automation = false): Promise<string | null> {
  if (automation) {
    const expected = Buffer.from(process.env.N8N_HEADER_SECRET?.trim() || '');
    const supplied = Buffer.from(request.headers.get('x-offertehulp-secret')?.trim() || '');
    if (expected.length && supplied.length === expected.length && timingSafeEqual(expected, supplied)) {
      return process.env.CALVORA_USER_ID?.trim() || null;
    }
    return null;
  }
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  try { return (await initFirebaseAdmin().auth.verifyIdToken(token)).uid; }
  catch { return null; }
}

interface PushConfig { publicKey: string; privateKey: string; subject: string }
let configPromise: Promise<PushConfig> | undefined;
export function getPushConfig(): Promise<PushConfig> {
  // Eén persistente sleutel voor alle instanties; nooit private keys naar de browser.
  if (!configPromise) {
    const { firestore } = initFirebaseAdmin();
    const ref = firestore.collection('push_private').doc('vapid');
    configPromise = firestore.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (snapshot.exists) return snapshot.data() as PushConfig;
      const config = { ...webpush.generateVAPIDKeys(), subject: 'https://app.calvora.nl' };
      tx.create(ref, config);
      return config;
    }).catch(error => { configPromise = undefined; throw error; });
  }
  return configPromise;
}

export function pushError(message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status, headers: pushHeaders });
}

export interface PushResult { accepted: number; failed: number; expired: number; skipped: number; devices: number }

export async function sendUserPush(uid: string, input: PushMessage, onlyEndpoint?: string): Promise<PushResult> {
  const message = pushMessageSchema.parse(input);
  const { firestore } = initFirebaseAdmin();
  const devices = await firestore.collection('push_subscriptions').where('userId', '==', uid).get();
  const selected = devices.docs.filter(doc => !onlyEndpoint || doc.data().subscription?.endpoint === onlyEndpoint);
  const result: PushResult = { accepted: 0, failed: 0, expired: 0, skipped: 0, devices: selected.length };
  if (!selected.length) return result;
  const vapidDetails = await getPushConfig();
  // Beperk gelijktijdige verzoeken en de payload tot de Web Push limiet, ook bij emoji.
  const payload = JSON.stringify({ title: message.title, body: message.body, url: message.url, tag: pushId(message.eventId) });
  for (let start = 0; start < selected.length; start += 5) {
    await Promise.all(selected.slice(start, start + 5).map(async device => {
      const subscription = device.data().subscription;
      if (!subscription || !isPushEndpoint(subscription.endpoint)) { result.failed++; return; }
      const receipt = firestore.collection('push_deliveries').doc(pushId(`${uid}:${message.eventId}:${device.id}`));
      const claimed = await firestore.runTransaction(async tx => {
        const previous = await tx.get(receipt);
        const data = previous.data();
        if (data?.state === 'accepted') return 'accepted';
        if (data?.state === 'sending' && data.startedAt > Date.now() - 90_000) return 'busy';
        tx.set(receipt, { userId: uid, state: 'sending', startedAt: Date.now() });
        return 'claimed';
      });
      if (claimed === 'accepted') { result.skipped++; return; }
      if (claimed === 'busy') { result.failed++; return; }
      try {
        await webpush.sendNotification(subscription, payload, { vapidDetails, TTL: 3600, timeout: 10_000, urgency: 'normal' });
        // 'accepted' betekent door de pushprovider aangenomen, niet door de telefoon gelezen.
        await receipt.set({ state: 'accepted', acceptedAt: Date.now() }, { merge: true });
        result.accepted++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await firestore.runTransaction(async tx => {
            const current = await tx.get(device.ref);
            if (current.data()?.userId === uid && current.data()?.updatedAt === device.data().updatedAt) tx.delete(device.ref);
          });
          await receipt.set({ state: 'expired' }, { merge: true });
          result.expired++;
        } else {
          await receipt.set({ state: 'failed', status: status || null }, { merge: true });
          result.failed++;
        }
      }
    }));
  }
  return result;
}
