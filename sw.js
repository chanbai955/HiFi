const CACHE_NAME = 'hifi-audio-cache-v1';

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = event.request.url;
    // Cache audio files locally so Android does not block network requests in sleep mode
    if (url.endsWith('.mp3') || url.includes('raw.githack.com')) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((response) => {
                    if (response) return response;
                    return fetch(event.request).then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(() => response);
                });
            })
        );
    }
});
