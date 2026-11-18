const offlineCache = 'reelspark-offline-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(offlineCache).then((cache) => cache.add('/offline.html')));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('reelspark-offline-') && key !== offlineCache)
      .map((key) => caches.delete(key))
  )));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.mode !== 'navigate' || event.request.method !== 'GET' ||
      url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).catch(async () =>
    (await caches.match('/offline.html')) || Response.error()
  ));
});
