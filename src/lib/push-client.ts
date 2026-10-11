import type { User } from 'firebase/auth';

export const PUSH_OWNER_KEY = 'studio.push.owner';
export function supportsPush(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator
    && 'PushManager' in window && 'Notification' in window;
}

export async function pushRequest(user: User, path: string, method = 'GET', body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/push/${path}`, {
    method, cache: 'no-store',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Meldingen bijwerken mislukt. Probeer het opnieuw.');
  return result;
}

export async function pushRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  return navigator.serviceWorker.ready;
}

export function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '='));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export async function disableDevicePush(user?: User | null): Promise<void> {
  if (!supportsPush()) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    // Eerst provider uitschakelen: ook zonder netwerk geen blijvende meldingen op dit toestel.
    const stopped = await subscription.unsubscribe();
    if (!stopped && await registration?.pushManager.getSubscription()) throw new Error('Meldingen uitschakelen mislukt. Probeer het opnieuw.');
    if (user) await pushRequest(user, 'subscription', 'DELETE', { endpoint: subscription.endpoint }).catch(() => null);
  }
  localStorage.removeItem(PUSH_OWNER_KEY);
  window.dispatchEvent(new Event('studio:push-changed'));
}
