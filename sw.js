'use strict';
const STATIC='chaopan-static-v2.2-integrated-1';
const SHELL=['./','./index.html','./app.css','./app.js','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(STATIC).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('chaopan-static-')&&k!==STATIC).map(k=>caches.delete(k)))),
  self.clients.claim()
])));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==self.location.origin)return;
  const path=u.pathname;
  const dynamic=(path.endsWith('/data/radar.json')||path.endsWith('/data/universe.json'));
  const asset=dynamic||/\/(app\.js|app\.css|index\.html|sw\.js)$/.test(path)||e.request.mode==='navigate';
  if(asset){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{
      if(r.ok){const copy=r.clone();caches.open(STATIC).then(c=>c.put(e.request,copy));}
      return r;
    }).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||(dynamic?
      new Response(JSON.stringify({mode:'empty',candidates:[]}),{headers:{'Content-Type':'application/json'}}):Response.error()))));
  }else{
    e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)));
  }
});
