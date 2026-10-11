import { z } from 'zod';

// Alleen bekende pushproviders: voorkom dat opgeslagen endpoints een SSRF-route worden.
export function isPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash
      && (url.hostname === 'web.push.apple.com'
        || url.hostname.endsWith('.push.apple.com')
        || url.hostname === 'fcm.googleapis.com'
        || url.hostname === 'updates.push.services.mozilla.com'
        || url.hostname.endsWith('.notify.windows.com'));
  } catch { return false; }
}

export function safePushPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return '/dashboard';
  const url = new URL(value, 'https://app.calvora.nl');
  return url.origin === 'https://app.calvora.nl' ? url.pathname + url.search + url.hash : '/dashboard';
}

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(2048).refine(isPushEndpoint),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}=?$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/),
  }),
});

export const pushMessageSchema = z.object({
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(800),
  url: z.string().max(1000).default('/dashboard').transform(safePushPath).refine(value => value.length <= 1000),
  eventId: z.string().trim().min(1).max(200),
});
export type PushMessage = z.infer<typeof pushMessageSchema>;
