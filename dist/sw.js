const CACHE = 'ivory-v3';
const ASSETS = ['./','./index.html','./style.css','./app.js','./music.js','./import.js','./musicxml.js','./archive.js','./theme.js','./curriculum.js','./content.js','./personal-library.js','./score-data.js','./progress.js','./vendor/fflate.js','./scores/manifest.json','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install', event => event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(ASSETS);
  const manifest=await (await cache.match('./scores/manifest.json')).json();
  await cache.addAll(manifest.scores.map(score=>score.fileUrl));
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ivory-') && k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if(new URL(event.request.url).pathname.startsWith(new URL('./api/',self.registration.scope).pathname))return;
  event.respondWith(fetch(event.request).then(response=> {
    if (response.ok && (ASSETS.some(p=>new URL(p,self.registration.scope).href===event.request.url) || new URL(event.request.url).pathname.startsWith(new URL('./scores/',self.registration.scope).pathname))) {
      const copy=response.clone(); event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)));
    }
    return response;
  }).catch(()=>caches.match(event.request).then(c=>c || (event.request.mode==='navigate' ? caches.match('./index.html') : Response.error()))));
});
