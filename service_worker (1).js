// Service Worker pour PWA Tramway Terrain
// Version 1.0.0

const CACHE_NAME = 'tramway-terrain-v1';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// Installation du Service Worker
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installation...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Mise en cache des fichiers');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activation du Service Worker
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activation...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Suppression ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Stratégie de mise en cache : Network First (réseau prioritaire)
self.addEventListener('fetch', (event) => {
  // Ignorer les requêtes non-GET et les requêtes vers ngrok
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Pour les requêtes vers l'API ngrok, toujours essayer le réseau
  if (event.request.url.includes('ngrok')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return new Response(
            JSON.stringify({ 
              error: 'offline', 
              message: 'Mode hors ligne - Les données seront synchronisées plus tard' 
            }),
            { 
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }
  
  // Pour les autres ressources : cache first, puis réseau
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Retourner depuis le cache si disponible
        if (response) {
          return response;
        }
        
        // Sinon, essayer le réseau
        return fetch(event.request).then((response) => {
          // Ne pas mettre en cache les réponses non-valides
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Cloner la réponse
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          
          return response;
        });
      })
      .catch(() => {
        // En cas d'échec, retourner la page HTML depuis le cache
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      })
  );
});

// Écouter les messages du client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

// Synchronisation en arrière-plan (Background Sync)
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Synchronisation en arrière-plan:', event.tag);
  
  if (event.tag === 'sync-observations') {
    event.waitUntil(syncObservations());
  }
});

// Fonction de synchronisation
async function syncObservations() {
  try {
    console.log('[Service Worker] Tentative de synchronisation...');
    
    // Notifier le client de commencer la synchronisation
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'SYNC_REQUESTED',
        timestamp: Date.now()
      });
    });
    
    return true;
  } catch (error) {
    console.error('[Service Worker] Erreur de synchronisation:', error);
    return false;
  }
}

// Gestion des notifications push (optionnel, pour futures fonctionnalités)
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Notification push reçue');
  
  const options = {
    body: event.data ? event.data.text() : 'Nouvelle notification',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚊</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚊</text></svg>',
    vibrate: [200, 100, 200],
    tag: 'tramway-notification'
  };
  
  event.waitUntil(
    self.registration.showNotification('Tramway Terrain', options)
  );
});

console.log('[Service Worker] Chargé et prêt ✅');
