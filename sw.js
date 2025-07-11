const CACHE_NAME = 'kaylum-cache-v1';
const URLS_TO_CACHE = [
  'index.html',
  'player.html'
];

// Instala el Service Worker y guarda el "cascarón" de la app en caché.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Cache abierto, guardando archivos principales.');
        return cache.addAll(URLS_TO_CACHE);
      })
  );
});

// Activa el SW y limpia cachés antiguas si las hubiera.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Intercepta las peticiones.
self.addEventListener('fetch', event => {
  // Para la API de Google, siempre ir a la red para tener datos frescos.
  if (event.request.url.includes('docs.google.com')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Para todo lo demás, intenta servir desde la caché primero.
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});
