'use strict';
const STATIC='chaopan-static-v1';
const SHELL=['./','./index.html','./app.css','./app.js','./manifest.webmanifest','./assets/icon-192.png','./assets/icon-512.png','./data/demo.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(STATIC).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==STATIC).map(k=>caches.delete(k)))),self.clients.claim()]))});
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url); if(e.request.method!=='GET'||url.origin!==location.origin)return;
 if(url.pathname.endsWith('/data/radar.json')){e.respondWith(fetch(e.request).then(resp=>{if(resp.ok){const copy=resp.clone();caches.open(STATIC).then(c=>c.put('./data/radar.json',copy))}return resp}).catch(()=>caches.match('./data/radar.json').then(r=>r||new Response(JSON.stringify({mode:'empty',candidates:[]}),{headers:{'Content-Type':'application/json'}}))));return}
 e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)));
});
