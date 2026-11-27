'use strict';
// V3.1.1-r44-index-regime-20261020 network-first shell: network-first app shell; preserve existing EOD snapshot cache.
// This helps recover from older cache-first service workers after a successful GitHub Pages deploy.
const STATIC = 'chaopan-static-r224-20261127-cache-update-guard';
const CORE = ["./index.html", "./phase-regime-v307.js?v=20261016-v307", "./rank-lenses-v308.js?v=20261016-v308", "./institutional-amount-v312.js?v=20261019-r19", "./radar-extras-v311.js?v=20261018-v311-r15", "./trade-desk-v310.js?v=20261018-v311-r15", "./trade-guidance-v311.js?v=20261018-v311-r15", "./market-intel-v311.js?v=r224-20261127-cache-update-guard", "./stock-stage-v318.js?v=20261019-r31-trend-watch", "./maintrend_strategy_v320.js?v=20261019-r20", "./sector-stage-v325.js?v=20261027-combined-guard2", "./battle-six-v138.js?v=r45-trade-guard-20261107", "./portfolio-manager-v140.js?v=r44-1-import-date-audit", "./tomorrow-radar-v110.js?v=20261020-r42-liquidity-risk", "./investor-desk-v100.js?v=20261020-r44-5-investor", "./market-regime-v100.js?v=20261020-r44-4-market-compare", "./app-detail-swipe-v222.js?v=r224-20261127-cache-update-guard", "./app.css?v=20261031-remove-three-low", "./mobile-overflow-fix.css?v=20261024-1", "./manifest.webmanifest", "./assets/icon-192.png"];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // A missing optional script must not prevent the new worker from activating.
    try {
      const cache = await caches.open(STATIC);
      await Promise.allSettled(CORE.map(path => cache.add(new Request(path,{cache:'reload'}))));
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

  const isEod = /\/data\/(radar|universe|market-intel|index-history|taiex-daily|etf-daily|etf-watchlist)\.json$/.test(url.pathname) || /\/data\/stock-lookup\/(index|[0-9])\.json$/.test(url.pathname);
  if (isEod) {
    // Preserve the application's existing safety policy: never silently replace
    // failed network EOD responses with an old snapshot presented as current.
    event.respondWith(fetch(request)); // only the application may persist a verified snapshot
    return;
  }

  const isShell = request.mode === 'navigate' ||
    /\/(index\.html|app\.css|mobile-overflow-fix\.css|app-detail-swipe-v222\.js|stock-stage-v318\.js|phase-regime-v307\.js|rank-lenses-v308\.js|trade-desk-v310\.js|trade-guidance-v311\.js|market-intel-v311\.js|radar-extras-v311\.js|institutional-amount-v312\.js|maintrend_strategy_v320\.js|sector-stage-v325\.js|tomorrow-radar-v100\.js|tomorrow-radar-v110\.js|battle-six-v138\.js|portfolio-manager-v140\.js|market-regime-v100\.js|investor-desk-v100\.js|manifest\.webmanifest)$/.test(url.pathname);
  if (!isShell) return;

  // Ask the server whether the app code changed; fall back to last working
  // shell only when offline. URL query strings alone cannot evade an old SW.
  event.respondWith((async () => {
    try {
      const response = await fetch(request, {cache: 'no-cache'});
      if (response.ok) {
        try {
          const cache = await caches.open(STATIC);
          await cache.put(request.mode==='navigate'?'./index.html':request, response.clone());
        } catch (err) { /* Non-fatal cache failure. */ }
      }
      return response;
    } catch (err) {
      try {
        const cache = await caches.open(STATIC);
        const response = await cache.match(request) ||
          (request.mode === 'navigate' ? await cache.match('./index.html') : null);
        if (response) return response;
      } catch (cacheError) { /* No offline copy. */ }
      throw err;
    }
  })());
});
