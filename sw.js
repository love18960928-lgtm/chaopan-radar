'use strict';
// V3.1.1-r18-stage-margin-vix network-first shell: network-first app shell; preserve existing EOD snapshot cache.
// This helps recover from older cache-first service workers after a successful GitHub Pages deploy.
const STATIC = 'chaopan-static-v3.1.1-r18-stage-margin-vix';
const DATA = 'chaopan-eod-data-v311-r3';
const CORE = ['./index.html', './app.css', './app-detail-swipe-v222.js', './stock-stage-v318.js', './market-intel-v311.js'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // A missing optional script must not prevent the new worker from activating.
    try {
      const cache = await caches.open(STATIC);
      await Promise.allSettled(CORE.map(path => cache.add(path)));
    } catch (err) { /* Stay usable online even if precaching is unavailable. */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith('chaopan-static-') && key !== STATIC)
        .map(key => caches.delete(key)));
    } catch (err) { /* Keep activation from being blocked by cache errors. */ }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isEod = /\/data\/(radar|universe|market-intel)\.json$/.test(url.pathname);
  if (isEod) {
    // Preserve the application's existing safety policy: never silently replace
    // failed network EOD responses with an old snapshot presented as current.
    event.respondWith(fetch(request).then(async response => {
      if (response.ok) {
        try { const cache = await caches.open(DATA); await cache.put(request, response.clone()); }
        catch (err) { /* Non-fatal cache failure. */ }
      }
      return response;
    }));
    return;
  }

  const isShell = request.mode === 'navigate' ||
    /\/(index\.html|app\.css|app-detail-swipe-v222\.js|stock-stage-v318\.js|phase-regime-v307\.js|rank-lenses-v308\.js|trade-desk-v310\.js|trade-guidance-v311\.js|market-intel-v311\.js|radar-extras-v311\.js|institutional-amount-v312\.js|manifest\.webmanifest)$/.test(url.pathname);
  if (!isShell) return;

  // Ask the server whether the app code changed; fall back to last working
  // shell only when offline. URL query strings alone cannot evade an old SW.
  event.respondWith((async () => {
    try {
      const response = await fetch(request, {cache: 'no-cache'});
      if (response.ok) {
        try {
          const cache = await caches.open(STATIC);
          await cache.put(request, response.clone());
        } catch (err) { /* Non-fatal cache failure. */ }
      }
      return response;
    } catch (err) {
      try {
        const cache = await caches.open(STATIC);
        const response = await cache.match(request, {ignoreSearch: true}) ||
          (request.mode === 'navigate' ? await cache.match('./index.html') : null);
        if (response) return response;
      } catch (cacheError) { /* No offline copy. */ }
      throw err;
    }
  })());
});
