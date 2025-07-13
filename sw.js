// sw.js
// Versión: 2.1 - Descarga de carátulas para modo offline
const SONGS_CACHE_NAME = 'kaylum-songs-cache-v1';
const STATIC_ASSETS_CACHE_NAME = 'kaylum-static-assets-v2.1'; // Incrementamos versión
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

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            return cachedResponse || fetch(event.request);
        })
    );
});

self.addEventListener('message', event => {
    if (!event.data) return;
    const { action, songId, songUrl, coverUrl } = event.data; // Se extrae coverUrl
    const clientId = event.source ? event.source.id : undefined;

    switch (action) {
        // MODIFICADO: Nueva acción para manejar la descarga conjunta.
        case 'DOWNLOAD_SONG_WITH_COVER':
            event.waitUntil(handleSongAndCoverDownload(songId, songUrl, coverUrl, clientId));
            break;
        case 'GET_DOWNLOADED_SONGS':
            event.waitUntil(sendDownloadedSongsList(clientId));
            break;
        case 'DOWNLOAD_SKIN':
            event.waitUntil(handleAssetDownload(event.data.url, clientId, 'SKIN_DOWNLOADED', 'SKIN_DOWNLOAD_ERROR'));
            break;
        case 'DOWNLOAD_SKIN_LIST':
            event.waitUntil(handleAssetDownload(event.data.url, clientId, 'SKIN_LIST_DOWNLOADED', 'SKIN_DOWNLOAD_ERROR'));
            break;
    }
});

// NUEVO: Función que descarga y guarda la canción y su carátula.
async function handleSongAndCoverDownload(songId, songUrl, coverUrl, clientId) {
    try {
        const downloadPromises = [];
        
        // Promesa para descargar la canción
        const songPromise = caches.open(SONGS_CACHE_NAME).then(async (cache) => {
            const response = await fetch(songUrl);
            if (!response.ok) throw new Error(`Red no OK para canción: ${songUrl}`);
            return cache.put(songUrl, response);
        });
        downloadPromises.push(songPromise);

        // Promesa para descargar la carátula (si existe la URL)
        if (coverUrl && coverUrl.startsWith('http')) {
            const coverPromise = caches.open(STATIC_ASSETS_CACHE_NAME).then(async (cache) => {
                // Se usa 'no-cors' para URLs de terceros (como Google Images) que podrían no tener cabeceras CORS correctas.
                // Esto permite guardar la imagen, aunque no podamos inspeccionar su contenido desde el script.
                const request = new Request(coverUrl, { mode: 'no-cors' });
                const response = await fetch(request);
                // En modo 'no-cors', la respuesta es "opaca" y su status es 0, pero se puede cachear.
                return cache.put(coverUrl, response);
            });
            downloadPromises.push(coverPromise);
        }

        // Se espera a que todas las descargas terminen
        await Promise.all(downloadPromises);

        console.log(`SW: Canción y carátula para ${songId} descargadas.`);
        await sendMessageToClient(clientId, { action: 'SONG_DOWNLOADED', songId: songId });

    } catch (error) {
        console.error(`SW: Fallo al descargar canción o carátula para ${songId}.`, error);
        await sendMessageToClient(clientId, { action: 'DOWNLOAD_ERROR', songId: songId, error: error.message });
    }
}

async function handleAssetDownload(url, clientId, successAction, errorAction) {
    try {
        const cache = await caches.open(STATIC_ASSETS_CACHE_NAME);
        const request = new Request(url, { cache: 'reload' });
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
