// sw.js
// Versión: 1.9 - Buscador y Skins Offline Mejorados
const SONGS_CACHE_NAME = 'kaylum-songs-cache-v1';
const STATIC_ASSETS_CACHE_NAME = 'kaylum-static-assets-v1.9'; // Incrementamos versión
const ALL_CACHES = [SONGS_CACHE_NAME, STATIC_ASSETS_CACHE_NAME];
const REPO_NAME = 'kaylum';

// Lista de assets fundamentales para que la app funcione offline desde el inicio.
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
    `/${REPO_NAME}/assets/img/labplay/alterplayflux.png`,
    // Se añade un skin por defecto para que siempre haya uno disponible offline.
    `/${REPO_NAME}/assets/img/labplay/skins/skin03.webm`
];

const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRxbKnkTFmkECMfd_cRKchEv2XGOHII6YlLj0M0ragfExCtRWB2S0qTIZYrrFCTk3sxxctY2dnVgUif/pub?output=csv';

self.addEventListener('install', event => {
    console.log('SW: Instalando...');
    event.waitUntil(
        caches.open(STATIC_ASSETS_CACHE_NAME)
            .then(cache => {
                console.log('SW: Pre-cacheando assets estáticos.');
                // Usamos { cache: 'reload' } para asegurar que obtenemos la versión más reciente durante la instalación.
                const assetRequests = PRECACHE_ASSETS.map(url => new Request(url, { cache: 'reload' }));
                return cache.addAll(assetRequests);
            })
            .then(() => self.skipWaiting())
            .catch(err => console.error("SW: Fallo en el pre-cacheo", err))
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

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Estrategia "Network first, then cache" para el CSV, para tener siempre los datos más frescos.
    if (url.href.startsWith(GOOGLE_SHEET_URL)) {
        event.respondWith(
            fetch(event.request)
                .then(networkResponse => {
                    // Si la petición de red tiene éxito, la guardamos en caché y la devolvemos.
                    return caches.open(STATIC_ASSETS_CACHE_NAME).then(cache => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                })
                .catch(() => {
                    // Si la red falla, intentamos obtenerla del caché.
                    return caches.match(event.request);
                })
        );
        return;
    }
    
    // Estrategia "Cache first" para las canciones de Cloudinary y otros assets.
    // Esto es ideal para canciones y skins ya descargados.
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            // Si está en caché, la devolvemos.
            if (cachedResponse) {
                return cachedResponse;
            }
            // Si no está en caché, la buscamos en la red.
            return fetch(event.request);
        })
    );
});

// Listener de mensajes desde la página principal.
self.addEventListener('message', event => {
  if (!event.data) return;
  const { action, songId, url } = event.data;
  const clientId = event.source ? event.source.id : undefined;

  switch (action) {
    case 'DOWNLOAD_SONG':
        event.waitUntil(handleDownload(songId, url, clientId));
        break;
    case 'GET_DOWNLOADED_SONGS':
        event.waitUntil(sendDownloadedSongsList(clientId));
        break;
    // CAMBIO REALIZADO: Esta es la acción que maneja la descarga de un skin individual.
    case 'DOWNLOAD_SKIN':
        console.log(`SW: Recibida petición para descargar skin: ${url}`);
        event.waitUntil(handleSkinDownload(url, clientId));
        break;
  }
});

// Función para descargar y guardar una canción en el caché.
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

// CAMBIO REALIZADO: Función que se encarga de descargar y guardar un skin en el caché de assets.
async function handleSkinDownload(url, clientId) {
  try {
    // Los skins se guardan en el mismo caché que los assets estáticos.
    const cache = await caches.open(STATIC_ASSETS_CACHE_NAME);
    // Se añade `?_=` para evitar problemas con el caché del navegador (no del Service Worker).
    const request = new Request(`${url}?_=${new Date().getTime()}`);
    const response = await fetch(request);
    if (!response.ok) {
      throw new Error(`Respuesta de red no fue OK para la skin: ${url}`);
    }
    // La URL original (sin el timestamp) se usa como clave en el caché.
    await cache.put(url, response.clone());
    console.log(`SW: Skin cacheado con éxito: ${url}`);
    await sendMessageToClient(clientId, { action: 'SKIN_DOWNLOADED', url: url });
  } catch (error) {
    console.error(`SW: Fallo al descargar o cachear la skin ${url}.`, error);
    await sendMessageToClient(clientId, { action: 'SKIN_DOWNLOAD_ERROR', url: url, error: error.message });
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
