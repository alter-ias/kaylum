// sw.js
// Versión: 1.6 - Caché de Skins Robusto

const SONGS_CACHE_NAME = 'kaylum-songs-cache-v1';
const STATIC_ASSETS_CACHE_NAME = 'kaylum-static-assets-v1.6'; // Incrementamos versión para forzar actualización
const ALL_CACHES = [SONGS_CACHE_NAME, STATIC_ASSETS_CACHE_NAME];
const REPO_NAME = 'kaylum';

const PRECACHE_ASSETS = [
    `/${REPO_NAME}/`,
    `/${REPO_NAME}/index.html`,
    `/${REPO_NAME}/manifest.json`,
    'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700&display=swap',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css',
    'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0',
    `/${REPO_NAME}/assets/img/labplay/logokaylum.png`,
    `/${REPO_NAME}/assets/img/logo03.png`,
    `/${REPO_NAME}/assets/img/labplay/default-cover.jpg`,
    `/${REPO_NAME}/assets/img/labplay/alterplayflux.png`
];

const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRxbKnkTFmkECMfd_cRKchEv2XGOHII6YlLj0M0ragfExCtRWB2S0qTIZYrrFCTk3sxxctY2dnVgUif/pub?output=csv';

// ***** CORRECCIÓN AQUÍ: Método de cacheo robusto *****
async function cacheSkins() {
    try {
        const skinsPath = `/${REPO_NAME}/assets/img/labplay/skins/`;
        const response = await fetch(`${self.location.origin}${skinsPath}skins.json?_=${new Date().getTime()}`);
        if (!response.ok) throw new Error(`No se pudo encontrar skins.json. Status: ${response.status}`);
        
        const skinFiles = await response.json();
        const cache = await caches.open(STATIC_ASSETS_CACHE_NAME);
        console.log('SW: Cacheando skins individualmente...');

        let successfulSkins = 0;
        const cachePromises = skinFiles.map(async (file) => {
            const skinUrl = `${self.location.origin}${skinsPath}${file}`;
            try {
                await cache.add(skinUrl);
                successfulSkins++;
            } catch (err) {
                console.warn(`SW: Fallo al cachear la skin: ${skinUrl}`, err);
            }
        });

        await Promise.all(cachePromises);
        console.log(`SW: ${successfulSkins} de ${skinFiles.length} skins cacheadas con éxito.`);

    } catch (error) {
        console.warn('SW: No se pudieron cachear las skins.', error);
    }
}


self.addEventListener('install', event => {
    console.log('SW: Instalando...');
    event.waitUntil(
        Promise.all([
            caches.open(STATIC_ASSETS_CACHE_NAME).then(cache => {
                console.log('SW: Pre-cacheando assets estáticos.');
                return cache.addAll(PRECACHE_ASSETS);
            }),
            cacheSkins()
        ]).then(() => self.skipWaiting())
    );
});

// El resto del archivo sw.js permanece igual que la versión anterior.
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

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    if (url.href.startsWith(GOOGLE_SHEET_URL)) {
        event.respondWith(
            caches.open(STATIC_ASSETS_CACHE_NAME).then(async (cache) => {
                const cachedResponse = await cache.match(event.request);
                const networkFetch = fetch(event.request).then(networkResponse => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                }).catch(() => {});
                return cachedResponse || networkFetch;
            })
        );
        return;
    }
    
    if (url.hostname === 'res.cloudinary.com') {
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                return cachedResponse || fetch(event.request);
            })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            return cachedResponse || fetch(event.request);
        })
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
            const urlParts = req.url.split('/');
            return urlParts[urlParts.length - 1];
        });
        await sendMessageToClient(clientId, { action: 'DOWNLOADED_SONGS_LIST', songIds });
    } catch (error) {
        console.error('SW: Error obteniendo la lista de canciones cacheadas.', error);
    }
}

async function sendMessageToClient(clientId, message) {
    if (clientId) {
        const client = await self.clients.get(clientId);
        if (client) {
            client.postMessage(message);
        }
    } else {
        const allClients = await self.clients.matchAll({ type: 'window' });
        for (const client of allClients) {
            client.postMessage(message);
        }
    }
}
