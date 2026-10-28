const CACHE_NAME = 'chanthiran-hifi-v1';

// Static App Shell assets to cache for offline startup
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    'https://cdn.jsdelivr.net/npm/hls.js@latest',
    'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Orbitron:wght@600;800;900&display=swap'
];

// 1. Install Event: Cache essential UI assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// 2. Activate Event: Clear outdated cache stores immediately
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// 3. Fetch Event: Stale-while-revalidate for UI, bypass for live audio/radio streams
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // BYPASS CACHE: Audio media, live HLS segments (.ts / .m3u8), and radio streams
    // Range requests and large binary audio streams must not be captured in CacheStorage
    if (
        request.destination === 'audio' ||
        url.pathname.endsWith('.mp3') ||
        url.pathname.endsWith('.m3u8') ||
        url.pathname.endsWith('.ts') ||
        url.hostname.includes('zeno.fm') ||
        url.hostname.includes('astro.com.my') ||
        url.hostname.includes('radio-browser.info') ||
        request.headers.has('range')
    ) {
        return; // Let browser network engine handle audio streams directly
    }

    // Cache-First with Network Revalidate for fonts, CDN scripts, and app shell
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cache immediately and refresh in background
                fetch(request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
                    }
                }).catch(() => {});
                return cachedResponse;
            }

            return fetch(request).then((networkResponse) => {
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
                return networkResponse;
            }).catch(() => {
                // Fallback to offline index page
                if (request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
