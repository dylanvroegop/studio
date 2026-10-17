/* Alleen push; geen caching van pagina's, API-antwoorden of klantgegevens. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

function safeUrl(path) {
  try {
    const url = new URL(path || '/offertes', self.location.origin);
    return url.origin === self.location.origin && ['http:', 'https:'].includes(url.protocol)
      ? url.href : new URL('/offertes', self.location.origin).href;
  } catch { return new URL('/offertes', self.location.origin).href; }
}

self.addEventListener('push', event => {
  let message = {};
  try { message = event.data ? event.data.json() : {}; } catch { /* Toon ook bij ongeldige payload een melding. */ }
  message = message || {};
  event.waitUntil(self.registration.showNotification(message.title || 'Calvora', {
    body: message.body || 'Je hebt een nieuwe melding.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: message.tag,
    data: { url: safeUrl(message.url) },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = safeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if (new URL(client.url).origin === self.location.origin && 'navigate' in client) {
        try { const navigated = await client.navigate(url); if (navigated) return navigated.focus(); } catch { /* Open nieuw venster. */ }
      }
    }
    return self.clients.openWindow(url);
  })());
});
