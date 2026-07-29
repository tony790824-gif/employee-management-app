const CACHE_PREFIX='banke-production-';
const CACHE='banke-production-v2';
const REVISION_CACHE_KEY='./__banke_bootstrap_revision__';
const FILES=['./','./index.html','./style.css','./access.css','./login.css','./login-screen.css','./employee-calendar.css','./employee-layout.css','./time-off-ui.css','./environment.css','./environment-config.js','./postgres-api-client.js','./state-store.js','./account-security.js','./dom-safety.js','./current-user-ui.js','./app.js','./access.js','./employee-work.js','./boss-hours.js','./management-actions.js','./cloud-sync.js','./google-sheets-config.js','./google-sheets-cloud.js','./enhancements.js','./pwa.js','./employee-layout.js','./time-off-ui.js','./manifest.webmanifest','./app-icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
const validRevision=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0;
const publishRevision=async revision=>{
  if(!validRevision(revision))return;
  const normalized=Number(revision);
  const cache=await caches.open(CACHE);
  await cache.put(REVISION_CACHE_KEY,new Response(JSON.stringify({revision:normalized}),{
    headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
  }));
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  clients.forEach(client=>client.postMessage({type:'BANKE_BOOTSTRAP_REVISION_AVAILABLE',revision:normalized}));
};
self.addEventListener('message',event=>{
  if(event.data?.type!=='BANKE_BOOTSTRAP_REVISION')return;
  event.waitUntil(publishRevision(event.data.revision));
});
const matchCurrentCache=request=>caches.open(CACHE).then(cache=>cache.match(request));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).catch(()=>matchCurrentCache('./index.html')));
    return;
  }
  event.respondWith(matchCurrentCache(event.request).then(cached=>cached||fetch(event.request)));
});
