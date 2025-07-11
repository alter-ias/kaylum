// sw.js
// Versión: 1.0

const SONGS_CACHE_NAME = 'kaylum-songs-cache-v1';
const STATIC_ASSETS_CACHE_NAME = 'kaylum-static-assets-v1';
const ALL_CACHES = [SONGS_CACHE_NAME, STATIC_ASSETS_CACHE_NAME];

// Lista de archivos esenciales de la aplicación para que funcione offline.
// Asegúrate de que todas estas rutas sean correctas desde la raíz de tu sitio.
// CÓDIGO NUEVO Y CORRECTO en sw.js
const PRECACHE_ASSETS = [
    '/kaylum/', // La página principal de tu subdirectorio
    '/kaylum/index.html', // Ruta completa al index
    '/kaylum/manifest.json',
    'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700&display=swap', // <-- Esta no cambia
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css', // <-- Esta no cambia
    'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0', // <-- Esta no cambia
    '/kaylum/assets/img/labplay/logokaylum.png',
    '/kaylum/assets/img/logo03.png',
    '/kaylum/assets/img/labplay/default-cover.jpg'
];

// Evento 'install': se dispara cuando el SW se instala por primera vez.
// Aquí es donde pre-cacheamos los assets estáticos.
self.addEventListener('install', event => {
  console.log('SW: Instalando...');
  event.waitUntil(
    caches.open(STATIC_ASSETS_CACHE_NAME)
      .then(cache => {
        console.log('SW: Pre-cacheando assets estáticos de la aplicación.');
        // Usamos addAll. Si una sola petición falla, la instalación del SW fallará.
        // Esto es bueno para asegurar que la app base siempre esté completa.
        return cache.addAll(PRECACHE_ASSETS);
      })
      .catch(error => {
        console.error('SW: Fallo en el pre-caching durante la instalación.', error);
      })
      .then(() => {
        // Forzar al nuevo SW a tomar el control inmediatamente.
        return self.skipWaiting();
      })
  );
});

// Evento 'activate': se dispara después de la instalación, cuando el SW toma el control.
// Aquí limpiamos cachés antiguas para no ocupar espacio innecesario.
self.addEventListener('activate', event => {
  console.log('SW: Activando...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Si una caché no está en nuestra lista de cachés actuales, la borramos.
          if (!ALL_CACHES.includes(cacheName)) {
            console.log('SW: Borrando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Tomar control inmediato de todos los clientes (pestañas) abiertos.
      return self.clients.claim();
    })
  );
});

// Evento 'message': escucha los comandos enviados desde la aplicación principal.
self.addEventListener('message', event => {
  if (!event.data) return;

  const { action, songId, url } = event.data;
  const clientId = event.source.id;

  if (action === 'DOWNLOAD_SONG') {
    handleDownload(songId, url, clientId);
  } else if (action === 'GET_DOWNLOADED_SONGS') {
    sendDownloadedSongsList(clientId);
  }
});

// Función para manejar la descarga y guardado en caché de una canción.
async function handleDownload(songId, url, clientId) {
  try {
    const cache = await caches.open(SONGS_CACHE_NAME);
    // Realizamos la petición a la red.
    const response = await fetch(url);
    
    // Verificamos que la respuesta de la red sea válida (código 2xx).
    if (!response.ok) {
      throw new Error(`Respuesta de red no fue OK: ${response.statusText} (${response.status})`);
    }

    // Guardamos una copia de la respuesta en la caché de canciones.
    await cache.put(url, response.clone());
    
    // Informamos al cliente que la descarga fue exitosa.
    sendMessageToClient(clientId, { action: 'SONG_DOWNLOADED', songId: songId });

  } catch (error) {
    console.error(`SW: Fallo al descargar o cachear la canción ${songId}.`, error);
    // Informamos al cliente del error.
    sendMessageToClient(clientId, { action: 'DOWNLOAD_ERROR', songId: songId, error: error.message });
  }
}

// Función para obtener y enviar la lista de canciones ya presentes en la caché.
async function sendDownloadedSongsList(clientId) {
    try {
        const cache = await caches.open(SONGS_CACHE_NAME);
        const requests = await cache.keys();
        // Extraemos el ID de la canción desde la URL cacheada.
        const songIds = requests.map(req => {
            const urlParts = req.url.split('/');
            return urlParts[urlParts.length - 1];
        });
        sendMessageToClient(clientId, { action: 'DOWNLOADED_SONGS_LIST', songIds });
    } catch (error) {
        console.error('SW: Error obteniendo la lista de canciones cacheadas.', error);
    }
}

// Evento 'fetch': intercepta todas las peticiones de red de la aplicación.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Estrategia "Cache First" para las canciones de Cloudinary.
  // Si la pedimos y está en caché, la servimos desde ahí. Si no, vamos a la red.
  if (url.hostname === 'res.cloudinary.com') {
    event.respondWith(
      caches.open(SONGS_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          return cachedResponse || fetch(event.request);
        });
      })
    );
    return; // Importante para no continuar con la siguiente estrategia.
  }

  // Estrategia "Cache, falling back to Network" para los assets estáticos.
  // Esto hace que la app cargue instantáneamente y funcione offline.
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Si el recurso está en la caché estática, lo devolvemos.
      if (cachedResponse) {
        return cachedResponse;
      }
      // Si no, lo pedimos a la red.
      return fetch(event.request);
    })
  );
});

// Función de utilidad para enviar un mensaje a un cliente específico.
async function sendMessageToClient(clientId, message) {
    if (!clientId) return;
    const client = await self.clients.get(clientId);
    if (client) {
        client.postMessage(message);
    }
}
