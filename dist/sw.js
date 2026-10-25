const CACHE = 'ivory-v4';
const ASSETS = ['./','./index.html','./style.css','./app.js','./piano-audio.js','./music.js','./import.js','./musicxml.js','./archive.js','./theme.js','./curriculum.js','./content.js','./personal-library.js','./score-data.js','./progress.js','./vendor/fflate.js','./scores/manifest.json','./audio/salamander/manifest.json','./audio/salamander/README.txt','./audio/salamander/LICENSE.txt','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install', event => event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(ASSETS);
  const manifest=await (await cache.match('./scores/manifest.json')).json();
  await cache.addAll(manifest.scores.map(score=>score.fileUrl));
  const piano=await (await cache.match('./audio/salamander/manifest.json')).json();
  await cache.addAll(piano.samples.map(sample=>'./audio/salamander/'+sample.file));
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ivory-') && k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if(new URL(event.request.url).pathname.startsWith(new URL('./api/',self.registration.scope).pathname))return;
  event.respondWith(fetch(event.request).then(response=> {
    if (response.ok && (ASSETS.some(p=>new URL(p,self.registration.scope).href===event.request.url) || ['./scores/','./audio/'].some(path=>new URL(event.request.url).pathname.startsWith(new URL(path,self.registration.scope).pathname)))) {
      const copy=response.clone(); event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)));
    }
    return response;
  }).catch(()=>caches.match(event.request).then(c=>c || (event.request.mode==='navigate' ? caches.match('./index.html') : Response.error()))));
});
