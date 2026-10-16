'use strict';
// V3.1.1-r6: fast shell, conditional HTTP + persistent Cache API EOD.
// Persist market snapshots from r3; upgrade the static shell only.
const STATIC='chaopan-static-v3.1.1-r6', DATA='chaopan-eod-data-v311-r3';
const SHELL=['./','./index.html','./app.css','./app-detail-swipe-v222.js','./phase-regime-v307.js','./rank-lenses-v308.js','./trade-desk-v310.js','./trade-guidance-v311.js','./market-intel-v311.js','./radar-extras-v311.js','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(
 caches.open(STATIC).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([
 caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('chaopan-static-')&&k!==STATIC).map(k=>caches.delete(k)))),
 self.clients.claim()
])));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const url=new URL(e.request.url);if(url.origin!==self.location.origin)return;
 const path=url.pathname;
 const dynamic=/\/data\/(radar|universe|market-intel)\.json$/.test(path);
 if(dynamic){
  // The page deliberately requests cache:'no-cache', which sends a conditional
  // request rather than redownloading identical JSON with a timestamp query.
  // Do NOT serve silent stale data on network failure: caller will label any
  // explicitly loaded last-known snapshot as unverified.
  e.respondWith(fetch(e.request).then(async r=>{
   if(r.ok){try{const c=await caches.open(DATA);await c.put(e.request,r.clone())}catch(err){}}
   return r;
  }));return;
 }
 const shell=/\/(app-detail-swipe-v222\.js|phase-regime-v307\.js|rank-lenses-v308\.js|trade-desk-v310\.js|trade-guidance-v311\.js|market-intel-v311\.js|radar-extras-v311\.js|app\.css|index\.html|manifest\.webmanifest)$/.test(path)||e.request.mode==='navigate';
 if(shell){
  // New SW revisions precache a consistent set of static files. With a
  // previously installed worker the app opens before a slow market fetch.
  e.respondWith(caches.open(STATIC).then(async c=>{
   const saved=await c.match(e.request,{ignoreSearch:true});if(saved)return saved;
   const fresh=await fetch(e.request);if(fresh.ok)c.put(e.request,fresh.clone());return fresh;
  }));
 }
});
