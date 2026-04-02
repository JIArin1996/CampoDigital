/**
 * sw.js — Service Worker básico para Campo Digital (PWA)
 * Solo maneja el cache de assets estáticos para funcionamiento offline básico.
 * Los datos dinámicos (APIs) siempre van a la red.
 */

const CACHE_NAME = 'campo-digital-v1';

// Assets que se cachean en la instalación del SW
const ASSETS_PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
];

// ── Instalación: cachea los assets estáticos ──────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_PRECACHE);
    })
  );
  self.skipWaiting();
});

// ── Activación: limpia caches viejas ─────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: Network first para la API, Cache first para assets ─────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Las peticiones a la API siempre van a la red (datos en tiempo real)
  if (url.hostname.includes('script.google.com')) {
    return; // Sin interceptar → comportamiento por defecto (red)
  }

  // Para el resto: intentar red, caer a caché si no hay conexión
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Si la respuesta es válida, la guarda en caché
        if (response && response.status === 200 && response.type === 'basic') {
          const clonada = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clonada);
          });
        }
        return response;
      })
      .catch(() => {
        // Sin red: devuelve desde caché
        return caches.match(event.request);
      })
  );
});
