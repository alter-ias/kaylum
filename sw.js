// sw.js
// Versión: 2.0 - Lógica de Skins Offline y UX de Carga mejoradas
const SONGS_CACHE_NAME = 'kaylum-songs-cache-v1';
const STATIC_ASSETS_CACHE_NAME = 'kaylum-static-assets-v2.0'; // Incrementamos versión
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
    `/${REPO_NAME}/assets/img/labplay/alterplayflux.png`,
    `/${REPO_NAME}/assets/img/labplay/skins/skin03.webm`
];

const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRxbKnkTFmkECMfd_cRKchEv2XGOHII6YlLj0M0ragfExCtRWB2S0qTIZYrrFCTk3sxxctY2dnVgUif/pub?output=csv';

self.addEventListener('install', event => {
    console.log('SW: Instalando...');
    event.waitUntil(
        caches.open(STATIC_ASSETS_CACHE_NAME)
            .then(cache => {
                console.log('SW: Pre-cacheando assets estáticos.');
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

    // Estrategia "Network first, then cache" para el CSV y la lista de skins.
    // Esto asegura que si hay conexión, se obtienen los datos más frescos.
    // Si no hay conexión, se usa la versión guardada en caché.
    if (url.href.startsWith(GOOGLE_SHEET_URL) || url.pathname.endsWith('skins.json')) {
        event.respondWith(
            caches.open(STATIC_ASSETS_CACHE_NAME).then(async (cache) => {
                try {
                    const networkResponse = await fetch(event.request);
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                } catch (error) {
                    console.log(`SW: Red falló para ${event.request.url}, sirviendo desde caché.`);
                    return await cache.match(event.request);
                }
            })
        );
        return;
    }

    // Estrategia "Cache first" para todo lo demás (canciones, imágenes, skins individuales, etc.)
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

    switch (action) {
        case 'DOWNLOAD_SONG':
            event.waitUntil(handleDownload(songId, url, clientId));
            break;
        case 'GET_DOWNLOADED_SONGS':
            event.waitUntil(sendDownloadedSongsList(clientId));
            break;
        case 'DOWNLOAD_SKIN':
            event.waitUntil(handleAssetDownload(url, clientId, 'SKIN_DOWNLOADED', 'SKIN_DOWNLOAD_ERROR'));
            break;
        // NUEVO: Acción específica para descargar y cachear el archivo skins.json
        case 'DOWNLOAD_SKIN_LIST':
            event.waitUntil(handleAssetDownload(url, clientId, 'SKIN_LIST_DOWNLOADED', 'SKIN_DOWNLOAD_ERROR'));
            break;
    }
});

async function handleDownload(songId, url, clientId) {
    try {
        const cache = await caches.open(SONGS_CACHE_NAME);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Red no OK: ${response.statusText}`);
        await cache.put(url, response.clone());
        await sendMessageToClient(clientId, { action: 'SONG_DOWNLOADED', songId: songId });
    } catch (error) {
        console.error(`SW: Fallo al descargar canción ${songId}.`, error);
        await sendMessageToClient(clientId, { action: 'DOWNLOAD_ERROR', songId: songId, error: error.message });
    }
}

// NUEVO: Función genérica para descargar cualquier asset (skin, json) al caché estático.
async function handleAssetDownload(url, clientId, successAction, errorAction) {
    try {
        const cache = await caches.open(STATIC_ASSETS_CACHE_NAME);
        const request = new Request(url, { cache: 'reload' }); // Forzar la recarga desde la red
        const response = await fetch(request);
        if (!response.ok) throw new Error(`Red no OK para asset: ${url}`);
        await cache.put(url, response.clone());
        console.log(`SW: Asset cacheado: ${url}`);
        await sendMessageToClient(clientId, { action: successAction, url: url });
    } catch (error) {
        console.error(`SW: Fallo al descargar asset ${url}.`, error);
        await sendMessageToClient(clientId, { action: errorAction, url: url, error: error.message });
    }
}

async function sendDownloadedSongsList(clientId) {
    try {
        const cache = await caches.open(SONGS_CACHE_NAME);
        const requests = await cache.keys();
        const songIds = requests.map(req => req.url.split('/').pop());
        await sendMessageToClient(clientId, { action: 'DOWNLOADED_SONGS_LIST', songIds });
    } catch (error) {
        console.error('SW: Error obteniendo lista de canciones.', error);
    }
}

async function sendMessageToClient(clientId, message) {
    const client = clientId ? await self.clients.get(clientId) : null;
    if (client) {
        client.postMessage(message);
    } else {
        self.clients.matchAll({ type: 'window' }).then(allClients => {
            allClients.forEach(c => c.postMessage(message));
        });
    }
}
