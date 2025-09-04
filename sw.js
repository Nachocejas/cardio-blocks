// --- Cardio Blocks Service Worker ---
// Cachea estáticos y da offline básico.
// Funciona en GitHub Pages incluso en /cardio-blocks/

const CACHE_STATIC = "cb-static-v3";

// Detecta el path base automáticamente (ej: "/cardio-blocks/")
const BASE = new URL(self.registration.scope).pathname;

// Archivos a cachear
const ASSETS = [
  `${BASE}`,
  `${BASE}index.html`,
  `${BASE}style.css`,
  `${BASE}app.js`,
  `${BASE}manifest.json`,
  `${BASE}icon-192.png`,
  `${BASE}icon-512.png`,
  // añade aquí más assets si los tienes (sonidos, imágenes…)
];

// Instalar: precache estáticos
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activar: limpia caches antiguos
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_STATIC ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// Fetch:
// - Navegación (HTML): network-first con fallback a cache (para offline).
// - Estáticos (css/js/png/json): cache-first.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 1) Navegación (peticiones que cargan páginas)
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_STATIC).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match(`${BASE}index.html`)))
    );
    return;
  }

  // 2) Estáticos: cache-first
  if (req.method === "GET" && (url.pathname.startsWith(BASE))) {
    e.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          // Guarda en cache si es válido
          const copy = res.clone();
          caches.open(CACHE_STATIC).then((c) => c.put(req, copy));
          return res;
        }).catch(() => cached);
      })
    );
  }
});
