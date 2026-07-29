const CACHE_PREFIX='banke-production-';
const CACHE='banke-production-v3';
const REVISION_CACHE_KEY='./__banke_bootstrap_revision__';
const FILES=['./','./index.html','./style.css','./access.css','./login.css','./login-screen.css','./employee-calendar.css','./employee-layout.css','./time-off-ui.css','./notification-center.css','./environment.css','./environment-config.js','./postgres-api-client.js','./state-store.js','./account-security.js','./dom-safety.js','./current-user-ui.js','./app.js','./access.js','./employee-work.js','./boss-hours.js','./management-actions.js','./cloud-sync.js','./google-sheets-config.js','./google-sheets-cloud.js','./enhancements.js','./pwa.js','./employee-layout.js','./time-off-ui.js','./notification-center.js','./manifest.webmanifest','./app-icon.svg'];
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
const safePushPayload=event=>{
  try{
    const value=event.data?.json();
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const title=String(value.title||'班客邦通知').slice(0,120);
    const body=String(value.body||'您有一則新通知').slice(0,500);
    const notificationId=/^[a-f0-9-]{36}$/i.test(String(value.notificationId||''))?String(value.notificationId):'';
    const url=typeof value.url==='string'&&value.url.startsWith('/')&&!value.url.startsWith('//')
      ?value.url:'/?open=notifications';
    return{title,body,notificationId,url};
  }catch{return null}
};
self.addEventListener('push',event=>{
  const payload=safePushPayload(event);
  if(!payload)return;
  event.waitUntil(self.registration.showNotification(payload.title,{
    body:payload.body,
    icon:'./app-icon.svg',
    badge:'./app-icon.svg',
    tag:payload.notificationId?`banke-${payload.notificationId}`:'banke-notification',
    renotify:false,
    data:{notificationId:payload.notificationId,url:payload.url}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const rawUrl=event.notification?.data?.url;
  const path=typeof rawUrl==='string'&&rawUrl.startsWith('/')&&!rawUrl.startsWith('//')
    ?rawUrl:'/?open=notifications';
  event.waitUntil((async()=>{
    const target=new URL(path,self.location.origin).href;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if(new URL(client.url).origin!==self.location.origin)continue;
      if('focus'in client)await client.focus();
      if('navigate'in client)await client.navigate(target);
      return;
    }
    if(self.clients.openWindow)await self.clients.openWindow(target);
  })());
});
self.addEventListener('pushsubscriptionchange',event=>{
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
    clients.forEach(client=>client.postMessage({type:'BANKE_PUSH_SUBSCRIPTION_CHANGED'}));
  }));
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
