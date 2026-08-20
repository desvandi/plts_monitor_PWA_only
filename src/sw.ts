// =============================================================================
// Service Worker — @serwist/next (CRITICAL gap fix vs reference).
// -----------------------------------------------------------------------------
// Reference Remote-Relay PWA had NO service worker → not installable, not
// offline-capable. This SW provides:
//   - App shell: cache-first (HTML, JS, CSS, fonts)
//   - Telemetry (/api/status): network-first, fallback to cache (5s timeout)
//   - Historical (/api/logs, /api/events, /api/alarms): stale-while-revalidate
//   - Static assets (/icons, /manifest): cache-first
// =============================================================================

import { defaultCache } from '@serwist/next/worker';
import { Serwist } from 'serwist';
import type { PrecacheEntry, RuntimeCaching } from 'serwist';

// declareSelf: required for TypeScript worker context.
declare const self: ServiceWorkerGlobalScope;

const runtimeCaching: RuntimeCaching[] = [
  // App shell — cache-first (HTML navigations).
  {
    matcher: ({ url }) => url.origin === self.location.origin && url.pathname === '/',
    handler: 'NetworkFirst',
    method: 'GET',
    options: {
      cacheName: 'plts-app-shell',
      networkTimeoutSeconds: 5,
      expiration: { maxEntries: 10, maxAgeSeconds: 30 * 24 * 60 * 60 },
    },
  },
  // Telemetry (frequently updated) — network-first with 5s timeout, fallback to cache.
  {
    matcher: ({ url }) =>
      url.origin === self.location.origin &&
      (url.pathname === '/api/status' || url.pathname === '/api/diagnostics'),
    handler: 'NetworkFirst',
    method: 'GET',
    options: {
      cacheName: 'plts-telemetry',
      networkTimeoutSeconds: 5,
      expiration: { maxEntries: 50, maxAgeSeconds: 5 * 60 },
    },
  },
  // Historical data — stale-while-revalidate.
  {
    matcher: ({ url }) =>
      url.origin === self.location.origin &&
      (url.pathname === '/api/log' ||
        url.pathname === '/api/events' ||
        url.pathname === '/api/alarms' ||
        url.pathname === '/api/reports'),
    handler: 'StaleWhileRevalidate',
    method: 'GET',
    options: {
      cacheName: 'plts-historical',
      expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
    },
  },
  // Static config / version — cache-first with background revalidate.
  {
    matcher: ({ url }) =>
      url.origin === self.location.origin &&
      (url.pathname === '/api/version' ||
        url.pathname === '/api/config' ||
        url.pathname === '/api/calibration'),
    handler: 'StaleWhileRevalidate',
    method: 'GET',
    options: {
      cacheName: 'plts-config',
      expiration: { maxEntries: 20, maxAgeSeconds: 10 * 60 },
    },
  },
  // Static assets (icons, manifest) — cache-first.
  {
    matcher: ({ request }) =>
      request.destination === 'image' || request.destination === 'manifest',
    handler: 'CacheFirst',
    method: 'GET',
    options: {
      cacheName: 'plts-static',
      expiration: { maxEntries: 60, maxAgeSeconds: 60 * 24 * 60 * 60 },
    },
  },
];

const serwist = new Serwist({
  precacheEntries: (self.__SW_MANIFEST ?? []) as PrecacheEntry[],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...defaultCache, ...runtimeCaching],
});

serwist.addEventListeners();
