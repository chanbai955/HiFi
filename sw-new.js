const CACHE_NAME = 'chanthiran-hifi-v1';

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/hls.js@latest',
  'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Orbitron:wght@600;800;900&display=swap'
];

// Install: Pre-cache core UI shell and external libraries
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        APP_SHELL_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn('Skipped caching:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: Serve cached shell offline; bypass live FM streams & large media
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept live FM radio streams, HLS chunks, or Radio-Browser API lookups
  if (
    url.pathname.endsWith('.m3u8') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.endsWith('.aac') ||
    url.hostname.includes('radio-browser.info') ||
    url.hostname.includes('streamtheworld') ||
    url.hostname.includes('zeno.fm') ||
    url.hostname.includes('astro.com.my') ||
    url.hostname.includes('bitgravity.com')
  ) {
    return;
  }

  // Network-first with offline cache fallback for HTML navigation
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Cache-first with background network refresh for fonts, scripts, and CSS
  if (
    url.origin === self.location.origin ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdn.jsdelivr.net')
  ) {
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        const networkFetch = fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, responseClone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || networkFetch;
      })
    );
  }
});
