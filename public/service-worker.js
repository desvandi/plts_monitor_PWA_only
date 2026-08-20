/*
 * PLTS Monitor — Service Worker v1.0.0
 * Production-Grade PWA Offline Support (brief §52, §90)
 *
 * Strategy:
 *   - App shell (HTML/CSS/JS/fonts): cache-first, fall back to network
 *   - Telemetry API (script.google.com): network-first, fall back to cache, mark STALE
 *   - ESP32 direct (LAN): network-only (real-time)
 *   - Offline fallback: serve index.html for navigation requests
 */

const CACHE_NAME = 'plts-monitor-v1-0-0';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/app.js',
  '/styles.css',
  '/icon-192.png',
  '/icon-512.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
];

const NETWORK_FIRST_HOSTS = ['script.google.com'];
const NETWORK_ONLY_PATHS = ['/api/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[SW] Some app shell resources failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Network-only for API calls (ESP32 direct)
  for (const path of NETWORK_ONLY_PATHS) {
    if (url.pathname.startsWith(path)) {
      return; // Let browser handle
    }
  }

  // Network-first for telemetry backend
  if (NETWORK_FIRST_HOSTS.includes(url.hostname)) {
    event.respondWith(networkFirstStrategy(req));
    return;
  }

  // Cache-first for app shell
  event.respondWith(cacheFirstStrategy(req));
});

async function cacheFirstStrategy(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const resp = await fetch(req);
    if (resp && resp.status === 200 && resp.type === 'basic') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, resp.clone());
    }
    return resp;
  } catch (err) {
    // Offline fallback
    if (req.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirstStrategy(req) {
  try {
    const resp = await fetch(req);
    if (resp && resp.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, resp.clone());
    }
    return resp;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) {
      // Mark as stale via header
      const staleResp = cached.clone();
      return new Response(staleResp.body, {
        status: 200,
        headers: { ...staleResp.headers, 'X-Stale': 'true' }
      });
    }
    return new Response(JSON.stringify({ error: 'Offline — no cached data' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
