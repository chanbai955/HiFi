/* =======================================================================
   CHANTHIRAN MINI HIFI SYSTEM - OPTIMAL PWA SERVICE WORKER
   - Byte-range slicing (HTTP 206) for Safari & Android audio scrubbing
   - Stale-while-revalidate for static assets & Google Fonts
   - Direct network pass-through for dynamic HLS live streams (.m3u8 / .ts)
   - Cache-first fallback for MP3 audio files
   ======================================================================= */

const CACHE_NAME_STATIC = 'chanthiran-hifi-static-v2';
const CACHE_NAME_AUDIO  = 'chanthiran-hifi-audio-v2';

const APP_SHELL_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    'https://cdn.jsdelivr.net/npm/hls.js@latest',
    'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Orbitron:wght@600;800;900&display=swap'
];

/* -----------------------------------------------------------------------
   1. INSTALL & ACTIVATE LIFECYCLE
   ----------------------------------------------------------------------- */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME_STATIC).then((cache) => {
            return cache.addAll(APP_SHELL_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME_STATIC && key !== CACHE_NAME_AUDIO) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

/* -----------------------------------------------------------------------
   2. HTTP 206 BYTE-RANGE SLICER (Critical for iOS / Android <audio>)
   ----------------------------------------------------------------------- */
async function createPartialResponse(request, fullResponse) {
    const rangeHeader = request.headers.get('range');
    if (!rangeHeader) {
        return fullResponse;
    }

    const arrayBuffer = await fullResponse.arrayBuffer();
    const totalBytes = arrayBuffer.byteLength;

    // Parse bytes=start-end range header
    const matches = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
    if (!matches) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${totalBytes}` } });
    }

    const start = parseInt(matches[1], 10);
    const end = matches[2] ? parseInt(matches[2], 10) : totalBytes - 1;

    if (start >= totalBytes || end >= totalBytes) {
        return new Response(null, {
            status: 416,
            headers: {
                'Content-Range': `bytes */${totalBytes}`,
                'Accept-Ranges': 'bytes'
            }
        });
    }

    const slicedBuffer = arrayBuffer.slice(start, end + 1);

    return new Response(slicedBuffer, {
        status: 206,
        statusText: 'Partial Content',
        headers: {
            'Content-Type': fullResponse.headers.get('Content-Type') || 'audio/mpeg',
            'Content-Range': `bytes ${start}-${end}/${totalBytes}`,
            'Content-Length': slicedBuffer.byteLength,
            'Accept-Ranges': 'bytes'
        }
    });
}

/* -----------------------------------------------------------------------
   3. ROUTING & CACHING STRATEGIES
   ----------------------------------------------------------------------- */
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Bypass Service Worker for non-GET requests or WebSocket/Internal protocols
    if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
        return;
    }

    // A. LIVE FM STREAMS: Strictly Network-Only (Never cache live HLS/shoutcast chunks)
    if (
        url.pathname.endsWith('.m3u8') || 
        url.pathname.endsWith('.ts') || 
        url.hostname.includes('zeno.fm') || 
        url.hostname.includes('radio-browser.info') ||
        url.hostname.includes('revma.com') ||
        url.hostname.includes('bitgravity.com')
    ) {
        event.respondWith(
            fetch(request).catch(() => {
                return new Response('Live Stream Offline', { status: 503, statusText: 'Offline' });
            })
        );
        return;
    }

    // B. AUDIO FILES (MP3 / WAV / M4A): Cache-First + HTTP 206 Range Response Support
    if (
        url.pathname.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i) || 
        url.hostname.includes('raw.githack.com')
    ) {
        event.respondWith(
            (async () => {
                const cache = await caches.open(CACHE_NAME_AUDIO);
                // Strip Range header for cache lookup to match the whole resource URL
                const cleanRequest = new Request(request.url, { method: 'GET' });
                let cachedResponse = await cache.match(cleanRequest);

                if (!cachedResponse) {
                    try {
                        const networkResponse = await fetch(cleanRequest);
                        if (networkResponse && networkResponse.status === 200) {
                            cache.put(cleanRequest, networkResponse.clone());
                        }
                        cachedResponse = networkResponse;
                    } catch (err) {
                        // Return empty response if offline and not cached
                        return new Response(null, { status: 504, statusText: 'Gateway Timeout' });
                    }
                }

                // If the player sent a byte-range request, slice the cached binary
                if (request.headers.has('range')) {
                    return createPartialResponse(request, cachedResponse.clone());
                }

                return cachedResponse;
            })()
        );
        return;
    }

    // C. APP SHELL & STATIC ASSETS: Stale-While-Revalidate
    event.respondWith(
        (async () => {
            const cache = await caches.open(CACHE_NAME_STATIC);
            const cachedResponse = await cache.match(request);

            const fetchPromise = fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        cache.put(request, networkResponse.clone());
                    }
                    return networkResponse;
                })
                .catch(() => cachedResponse);

            return cachedResponse || fetchPromise;
        })()
    );
});
