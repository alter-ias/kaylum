const CACHE_NAME = 'kaylum-v1-cache';
const URLS_TO_CACHE = [
  'index.html',
  'player.html'
  // No añadimos assets aquí para mantenerlo simple y evitar problemas de caché.
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(URLS_TO_CACHE);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    // Intenta obtener de la red primero para datos frescos.
    // Si falla la red (sin conexión), recurre a la caché.
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
