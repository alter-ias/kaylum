// sw.js

// Nombre y versión de nuestra caché para las canciones
const SONGS_CACHE_NAME = 'kaylum-songs-cache-v1';

// Al instalar el Service Worker, no hacemos nada especial aún.
self.addEventListener('install', event => {
  console.log('Service Worker instalado.');
  // Forzar al nuevo SW a tomar el control inmediatamente.
  self.skipWaiting(); 
});

// Al activar el Service Worker, limpiamos cachés antiguas si las hubiera.
self.addEventListener('activate', event => {
  console.log('Service Worker activado.');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Si el nombre de la caché no es el actual, la borramos.
          if (cacheName !== SONGS_CACHE_NAME) {
            console.log('Borrando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Tomar control de los clientes abiertos.
  );
});

// Listener principal para mensajes desde la página principal (cliente)
self.addEventListener('message', event => {
  if (!event.data) return;

  const { action, songId, url } = event.data;

  switch (action) {
    case 'DOWNLOAD_SONG':
      handleDownload(songId, url, event.source.id);
      break;
    case 'GET_DOWNLOADED_SONGS':
      sendDownloadedSongsList(event.source.id);
      break;
  }
});

// Función para manejar la descarga y cacheo de una canción
async function handleDownload(songId, url, clientId) {
  try {
    // Abrimos nuestra caché de canciones
    const cache = await caches.open(SONGS_CACHE_NAME);
    // Hacemos la petición a la red para obtener la canción
    const response = await fetch(url);

    // Verificamos que la respuesta es válida
    if (!response.ok) {
      throw new Error(`Respuesta de red no fue OK: ${response.statusText}`);
    }

    // Clonamos la respuesta porque se puede consumir solo una vez.
    // Una va a la caché y la otra puede ser usada por el navegador.
    await cache.put(url, response.clone());

    // Enviamos un mensaje de éxito de vuelta al cliente
    sendMessageToClient(clientId, { action: 'SONG_DOWNLOADED', songId: songId });

  } catch (error) {
    console.error(`SW: Fallo al descargar ${songId}`, error);
    // Enviamos un mensaje de error de vuelta al cliente
    sendMessageToClient(clientId, { action: 'DOWNLOAD_ERROR', songId: songId, error: error.message });
  }
}

// Función para obtener y enviar la lista de canciones ya cacheadas
async function sendDownloadedSongsList(clientId) {
    try {
        const cache = await caches.open(SONGS_CACHE_NAME);
        const requests = await cache.keys(); // Esto nos da un array de objetos Request
        
        // Mapeamos las URLs de las canciones cacheadas a sus IDs
        // Esto es un poco complejo, ya que solo tenemos la URL. Asumimos que el ID es la última parte.
        const songIds = requests.map(req => {
            const urlParts = req.url.split('/');
            return urlParts[urlParts.length - 1];
        });

        sendMessageToClient(clientId, { action: 'DOWNLOADED_SONGS_LIST', songIds });

    } catch (error) {
        console.error('SW: Error obteniendo la lista de canciones cacheadas', error);
    }
}


// Interceptamos todas las peticiones de red
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Solo nos interesan las peticiones a Cloudinary (donde están las canciones)
  if (url.hostname === 'res.cloudinary.com') {
    event.respondWith(
      // Estrategia: "Cache first" (primero caché, luego red)
      caches.open(SONGS_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          // Si encontramos una respuesta en la caché, la devolvemos
          if (cachedResponse) {
            // console.log('SW: Sirviendo desde caché:', event.request.url);
            return cachedResponse;
          }
          // Si no, hacemos la petición a la red
          // console.log('SW: Sirviendo desde red:', event.request.url);
          return fetch(event.request);
        });
      })
    );
  }
  // Para el resto de las peticiones, simplemente las dejamos pasar
});

// Utilidad para enviar mensajes a un cliente específico
async function sendMessageToClient(clientId, message) {
  const client = await self.clients.get(clientId);
  if (client) {
    client.postMessage(message);
  }
}
