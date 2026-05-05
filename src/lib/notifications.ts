'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getMessaging, getToken, isSupported, onMessage, type Messaging } from 'firebase/messaging';
import { firebaseConfig } from '@/firebase/config';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';

function getMessagingClientApp() {
  if (getApps().length > 0) return getApp();
  return initializeApp(firebaseConfig);
}

async function getMessagingInstance(): Promise<Messaging | null> {
  if (!(await isSupported())) return null;
  const app = getMessagingClientApp();
  return getMessaging(app);
}

export async function ensurePushPermissionAndToken(): Promise<string> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notificatie toestemming geweigerd');
  if (!VAPID_KEY) throw new Error('NEXT_PUBLIC_FIREBASE_VAPID_KEY ontbreekt');

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const messaging = await getMessagingInstance();
  if (!messaging) throw new Error('Push notificaties worden niet ondersteund op dit apparaat');

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!token) throw new Error('Kon geen notificatie token ophalen');
  return token;
}

export async function disablePushToken(token: string): Promise<void> {
  const currentUser = getAuth().currentUser;
  if (!currentUser) throw new Error('Niet ingelogd');
  const idToken = await currentUser.getIdToken();

  const response = await fetch('/api/notifications/unsubscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    throw new Error('Uitschakelen notificaties mislukt');
  }
}

export async function savePushToken(token: string): Promise<void> {
  const currentUser = getAuth().currentUser;
  if (!currentUser) throw new Error('Niet ingelogd');
  const idToken = await currentUser.getIdToken();

  const response = await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    throw new Error('Opslaan notificatie token mislukt');
  }
}

export async function setupForegroundNotificationListener(
  onNotify?: (title: string, body: string) => void,
): Promise<(() => void) | null> {
  const messaging = await getMessagingInstance();
  if (!messaging) return null;

  const unsubscribe = onMessage(messaging, (payload) => {
    const title = payload.notification?.title || 'Planning reminder';
    const body = payload.notification?.body || 'Je planning heeft een update.';

    if (onNotify) {
      onNotify(title, body);
      return;
    }

    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  });

  return unsubscribe;
}
