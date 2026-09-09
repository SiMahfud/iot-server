// Service Worker untuk PWA Offline Caching
const CACHE_NAME = 'agygateway-v4.3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css?v=4.2',
  '/css/widgets.css?v=4.2',
  '/css/automations.css?v=4.2',
  '/app.js?v=4.2',
  '/manifest.json',
  '/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell v4.2');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Menghapus cache lama:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Abaikan request API dan WebSocket
  if (event.request.url.includes('/api/') || event.request.url.includes('/ws')) {
    return;
  }

  // Network-First: prioritaskan file terbaru dari server, fallback ke cache jika offline
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
