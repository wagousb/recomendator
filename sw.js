const CACHE_NAME = 'recomendator-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './login.html',
  './register.html',
  './chat.html',
  './admin.html',
  './styles.css',
  './chat.js',
  './admin.js',
  './app.js',
  './solver.js',
  './Sortable.min.js',
  './vis-network.min.js',
  './patinho-favicon.png',
  './patinho-amarelo.svg',
  './patinho-amarelo-atendente.svg',
  './patinho-amarelo-atendente-dark.svg',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Bypass cache for Supabase API or non-GET requests
  if (e.request.method !== 'GET' || url.origin.includes('supabase.co')) {
    return e.respondWith(fetch(e.request));
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Stale-while-revalidate: Serve cached, update in background
        fetch(e.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
          }
        }).catch(() => {/* Offline */});
        return cachedResponse;
      }
      
      return fetch(e.request).then((networkResponse) => {
        // Dynamically cache third-party libraries (Lucide, SweetAlert, etc.)
        if (networkResponse && networkResponse.status === 200 && 
           (url.origin.includes('jsdelivr.net') || url.origin.includes('unpkg.com'))) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseClone));
        }
        return networkResponse;
      });
    })
  );
});
