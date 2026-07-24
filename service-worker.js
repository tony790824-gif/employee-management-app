const CACHE_PREFIX='banke-production-';
const CACHE='banke-production-v1';
const FILES=['./','./index.html','./style.css','./access.css','./login.css','./login-screen.css','./employee-calendar.css','./employee-layout.css','./environment.css','./environment-config.js','./postgres-api-client.js','./state-store.js','./account-security.js','./dom-safety.js','./app.js','./access.js','./employee-work.js','./boss-hours.js','./management-actions.js','./cloud-sync.js','./google-sheets-config.js','./google-sheets-cloud.js','./enhancements.js','./pwa.js','./employee-layout.js','./manifest.webmanifest','./app-icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
const matchCurrentCache=request=>caches.open(CACHE).then(cache=>cache.match(request));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).catch(()=>matchCurrentCache('./index.html')));
    return;
  }
  event.respondWith(matchCurrentCache(event.request).then(cached=>cached||fetch(event.request)));
});
