const CACHE_NAME = 'hifi-player-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Let audio and live stream requests pass through directly
  if (e.request.url.includes('.mp3') || e.request.url.includes('.m3u8')) {
    return;
  }
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
