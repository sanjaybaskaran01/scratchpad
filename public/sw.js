// Scratchpad Service Worker — runtime caching strategy
const CACHE_VERSION = 'v2';
const CACHE_NAME = `scratchpad-${CACHE_VERSION}`;

// External origins to never cache
const SKIP_CACHE_ORIGINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  '0.peerjs.com',
  'global.xirsys.net',
  'stun.l.google.com',
];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (SKIP_CACHE_ORIGINS.some(o => url.hostname.includes(o))) return;
  // Skip non-http(s) (chrome-extension:// etc.)
  if (!url.protocol.startsWith('http')) return;

  if (request.mode === 'navigate') {
    // Navigation: network-first, fall back to cached shell
    e.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return res;
        })
        .catch(() =>
          caches.match(request)
            .then(r => r || caches.match('./app/') || caches.match('./'))
        )
    );
    return;
  }

  // Assets: cache-first, fall back to network and cache result
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
        return res;
      });
    })
  );
});
