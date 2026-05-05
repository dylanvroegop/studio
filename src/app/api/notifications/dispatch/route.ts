import { NextResponse } from 'next/server';
import { getMessaging } from 'firebase-admin/messaging';
import { initFirebaseAdmin } from '@/firebase/admin';

function extractBearerToken(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authToken = extractBearerToken(request.headers.get('authorization'));
  if (cronSecret && authToken && authToken === cronSecret) return true;

  const expected = process.env.NOTIFICATION_DISPATCH_SECRET?.trim();
  const received = request.headers.get('x-dispatch-secret')?.trim();
  return !!expected && received === expected;
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { firestore } = initFirebaseAdmin();
    const now = new Date();

    const remindersSnap = await firestore.collection('planning_reminders')
      .where('status', '==', 'pending')
      .where('remindAt', '<=', now)
      .limit(100)
      .get();

    if (remindersSnap.empty) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    const messaging = getMessaging();
    let processed = 0;

    for (const reminderDoc of remindersSnap.docs) {
      const reminder = reminderDoc.data() as {
        userId: string;
        title: string;
        body: string;
      };

      const subscriptionSnap = await firestore.collection('push_subscriptions')
        .where('userId', '==', reminder.userId)
        .limit(20)
        .get();

      if (subscriptionSnap.empty) {
        await reminderDoc.ref.set({ status: 'no_subscribers', updatedAt: new Date() }, { merge: true });
        continue;
      }

      const tokens = subscriptionSnap.docs
        .map((doc) => String(doc.data().token || '').trim())
        .filter(Boolean);

      if (tokens.length === 0) {
        await reminderDoc.ref.set({ status: 'no_subscribers', updatedAt: new Date() }, { merge: true });
        continue;
      }

      const result = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: reminder.title || 'Planning reminder',
          body: reminder.body || 'Je hebt een geplande klus.',
        },
      });

      await reminderDoc.ref.set({
        status: 'sent',
        sentAt: new Date(),
        successCount: result.successCount,
        failureCount: result.failureCount,
        updatedAt: new Date(),
      }, { merge: true });

      result.responses.forEach((response, index) => {
        if (response.success) return;
        const code = response.error?.code || '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
          const tokenToDelete = tokens[index];
          subscriptionSnap.docs.forEach((subDoc) => {
            if (String(subDoc.data().token || '') === tokenToDelete) {
              subDoc.ref.delete().catch(() => null);
            }
          });
        }
      });

      processed += 1;
    }

    return NextResponse.json({ ok: true, processed });
  } catch (error) {
    console.error('dispatch error', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
