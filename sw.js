// sw.js
// Versión: 1.3 - Rutas y cacheo robustos para GitHub Pages

const SONGS_CACHE_NAME = 'kaylum-songs-cache-v1';
const STATIC_ASSETS_CACHE_NAME = 'kaylum-static-assets-v1';
const ALL_CACHES = [SONGS_CACHE_NAME, STATIC_ASSETS_CACHE_NAME];
const REPO_NAME = 'kaylum'; // Tu variable ya estaba perfecta para esto

const PRECACHE_ASSETS = [
    `/${REPO_NAME}/`,
    `/${REPO_NAME}/index.html`,
    `/${REPO_NAME}/manifest.json`,
    'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700&display=swap',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css',
    'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0',
    `/${REPO_NAME}/assets/img/labplay/logokaylum.png`,
    `/${REPO_NAME}/assets/img/logo03.png`,
    `/${REPO_NAME}/assets/img/labplay/default-cover.jpg`
];

self.addEventListener('install', event => {
  console.log('SW: Instalando...');
  event.waitUntil(
    caches.open(STATIC_ASSETS_CACHE_NAME)
      .then(cache => {
        console.log('SW: Pre-cacheando assets estáticos.');
        return cache.addAll(PRECACHE_ASSETS).catch(err => {
            console.warn(`SW: Fallo al cachear algunos assets iniciales. La app podría funcionar offline parcialmente.`, err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('SW: Activando...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!ALL_CACHES.includes(cacheName)) {
            console.log('SW: Borrando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (!event.data) return;
  const { action, songId, url } = event.data;
  const clientId = event.source ? event.source.id : undefined;

  if (action === 'DOWNLOAD_SONG') {
    event.waitUntil(handleDownload(songId, url, clientId));
  } else if (action === 'GET_DOWNLOADED_SONGS') {
    event.waitUntil(sendDownloadedSongsList(clientId));
  }
});

async function handleDownload(songId, url, clientId) {
  try {
    const cache = await caches.open(SONGS_CACHE_NAME);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Respuesta de red no fue OK: ${response.statusText} (${response.status})`);
    }
    await cache.put(url, response.clone());
    await sendMessageToClient(clientId, { action: 'SONG_DOWNLOADED', songId: songId });
  } catch (error) {
    console.error(`SW: Fallo al descargar o cachear la canción ${songId}.`, error);
    await sendMessageToClient(clientId, { action: 'DOWNLOAD_ERROR', songId: songId, error: error.message });
  }
}

async function sendDownloadedSongsList(clientId) {
    try {
        const cache = await caches.open(SONGS_CACHE_NAME);
        const requests = await cache.keys();
        const songIds = requests.map(req => {
            // Extraemos el publicId (el nombre del archivo) de la URL de Cloudinary
            const urlParts = req.url.split('/');
            return urlParts[urlParts.length - 1];
        });
        await sendMessageToClient(clientId, { action: 'DOWNLOADED_SONGS_LIST', songIds });
    } catch (error) {
        console.error('SW: Error obteniendo la lista de canciones cacheadas.', error);
    }
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Estrategia Cache-First para las canciones (solo se sirve de caché si fue descargada)
  if (url.hostname === 'res.cloudinary.com') {
    event.respondWith(
      caches.open(SONGS_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          return cachedResponse || fetch(event.request);
        });
      })
    );
    return;
  }

  // Estrategia Cache-First para todos los demás assets
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      return cachedResponse || fetch(event.request);
    })
  );
});

async function sendMessageToClient(clientId, message) {
    if (clientId) {
        const client = await self.clients.get(clientId);
        if (client) {
            client.postMessage(message);
        }
    } else {
        // Fallback: si no hay ID, se envía a todos los clientes.
        const allClients = await self.clients.matchAll({ type: 'window' });
        for (const client of allClients) {
            client.postMessage(message);
        }
    }
}
