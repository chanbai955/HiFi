const CACHE_NAME = 'chanthiran-hifi-shell-v1';

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/hls.js@latest',
  'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Orbitron:wght@600;800;900&display=swap'
];

// 1. Install: pre-cache UI shell and external scripts/fonts
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        APP_SHELL_ASSETS.map((url) =>
          cache.add(new Request(url, { mode: 'cors' })).catch(() => cache.add(url))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate: clean up old cache versions and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// 3. Fetch: network-first for HTML (so updates apply), cache-first for static assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Bypass Service Worker for media files, Range requests, and live radio streams
  if (
    req.headers.has('range') ||
    /\.(mp3|mp4|m3u8|aac|ts|wav|ogg|m4a|webm|mkv|avi|wmv)(\?|$)/i.test(url.pathname) ||
    url.hostname.includes('radio-browser.info') ||
    url.hostname.includes('streamtheworld') ||
    url.hostname.includes('zeno.fm')
  ) {
    return;
  }

  // Navigation requests (index.html): Network-first with offline cache fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          const copy = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return networkRes;
        })
        .catch(() => caches.match('./index.html') || caches.match('./'))
    );
    return;
  }

  // Static assets (manifest, hls.js, Google Fonts woff2 files): Cache-first, then network
  event.respondWith(
    caches.match(req).then((cachedRes) => {
      if (cachedRes) return cachedRes;

      return fetch(req).then((networkRes) => {
        if (networkRes && (networkRes.status === 200 || networkRes.type === 'opaque')) {
          const copy = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return networkRes;
      });
    })
  );
});
