const CACHE_PREFIX='banke-production-';
const CACHE='banke-production-v7';
const REVISION_CACHE_KEY='./__banke_bootstrap_revision__';
const PWA_CLIENT_CACHE='banke-pwa-client-v1';
const PWA_CLIENT_CACHE_KEY='./__banke_standalone_client__';
const FILES=['./','./index.html','./style.css','./access.css','./login.css','./login-screen.css','./employee-calendar.css','./employee-layout.css','./time-off-ui.css','./notification-center.css','./environment.css','./environment-config.js','./postgres-api-client.js','./state-store.js','./postgres-offline.js','./account-security.js','./dom-safety.js','./current-user-ui.js','./app.js','./access.js','./employee-work.js','./boss-hours.js','./management-actions.js','./cloud-sync.js','./google-sheets-config.js','./google-sheets-cloud.js','./enhancements.js','./pwa.js','./employee-layout.js','./time-off-ui.js','./notification-center.js','./manifest.webmanifest','./app-icon.svg'];
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
const rememberStandaloneClient=async event=>{
  const source=event.source;
  if(!source?.id||typeof source.url!=='string')return;
  const url=new URL(source.url);
  if(url.origin!==self.location.origin)return;
  const cache=await caches.open(PWA_CLIENT_CACHE);
  await cache.put(PWA_CLIENT_CACHE_KEY,new Response(JSON.stringify({
    id:source.id,
    url:url.href,
    recordedAt:Date.now()
  }),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}));
};
const readStandaloneClient=async()=>{
  try{
    const cache=await caches.open(PWA_CLIENT_CACHE);
    const response=await cache.match(PWA_CLIENT_CACHE_KEY);
    const value=response?await response.json():null;
    return value&&typeof value.id==='string'&&typeof value.url==='string'?value:null;
  }catch{return null}
};
self.addEventListener('message',event=>{
  if(event.data?.type==='BANKE_BOOTSTRAP_REVISION'){
    event.waitUntil(publishRevision(event.data.revision));
    return;
  }
  if(event.data?.type==='BANKE_CLIENT_MODE'&&event.data?.standalone===true){
    event.waitUntil(rememberStandaloneClient(event));
  }
});
const NOTIFICATION_DESTINATIONS=Object.freeze({
  clock_in:'/?open=attendance',
  clock_out:'/?open=attendance',
  shift_updated:'/?open=schedule',
  schedule_updated:'/?open=schedule',
  leave_requested:'/?open=time-off',
  leave_approved:'/?open=time-off',
  leave_rejected:'/?open=time-off',
  time_off_submitted:'/?open=time-off',
  time_off_cancelled:'/?open=time-off',
  time_off_approved:'/?open=time-off',
  time_off_rejected:'/?open=time-off'
});
const ALLOWED_NOTIFICATION_PATHS=new Set([
  '/?open=notifications','/?open=attendance','/?open=schedule','/?open=time-off'
]);
const ALLOWED_APP_IDS=new Set([
  'banke-production','banke-staging','banke-staging-postgres','banke-local'
]);
const safeNotificationPath=(type,rawUrl)=>{
  const mapped=NOTIFICATION_DESTINATIONS[String(type||'').toLowerCase()];
  if(mapped)return mapped;
  return typeof rawUrl==='string'&&ALLOWED_NOTIFICATION_PATHS.has(rawUrl)
    ?rawUrl:'/?open=notifications';
};
const safePushPayload=event=>{
  try{
    const value=event.data?.json();
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const title=String(value.title||'班客邦通知').slice(0,120);
    const body=String(value.body||'您有一則新通知').slice(0,500);
    const notificationId=/^[a-f0-9-]{36}$/i.test(String(value.notificationId||''))?String(value.notificationId):'';
    const type=String(value.type||'').toLowerCase();
    const url=safeNotificationPath(type,value.url);
    return{title,body,notificationId,type,url};
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
    data:{notificationId:payload.notificationId,type:payload.type,url:payload.url}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const notificationType=String(event.notification?.data?.type||'').toLowerCase();
  const path=safeNotificationPath(notificationType,event.notification?.data?.url);
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const scope=self.registration?.scope||`${self.location.origin}/`;
    const candidates=windows.filter(client=>{
      try{
        const url=new URL(client.url);
        return url.origin===self.location.origin&&url.href.startsWith(scope);
      }catch{return false}
    });
    const standalone=await readStandaloneClient();
    const marked=candidates.find(client=>client.id===standalone?.id);
    const installed=candidates.filter(client=>{
      try{return /^banke-/.test(new URL(client.url).searchParams.get('app')||'')}
      catch{return false}
    }).sort((left,right)=>{
      const score=client=>(client.focused?4:0)+(client.visibilityState==='visible'?2:0);
      return score(right)-score(left)||String(left.id||left.url).localeCompare(String(right.id||right.url));
    });
    const browser=candidates.slice().sort((left,right)=>{
      const score=client=>(client.focused?4:0)+(client.visibilityState==='visible'?2:0);
      return score(right)-score(left)||String(left.id||left.url).localeCompare(String(right.id||right.url));
    });
    const client=marked||installed[0]||(!standalone?browser[0]:null);
    if(client){
      try{
        const focused='focus'in client?await client.focus():client;
        (focused||client).postMessage?.({
          type:'BANKE_OPEN_NOTIFICATION_DESTINATION',path,notificationType
        });
        return;
      }catch{}
    }
    const target=new URL(path,self.location.origin);
    if(standalone){
      try{
        const appId=new URL(standalone.url).searchParams.get('app');
        if(ALLOWED_APP_IDS.has(appId)){
          const openTarget=target.searchParams.get('open');
          target.search='';
          target.searchParams.set('app',appId);
          target.searchParams.set('open',openTarget);
        }
      }catch{}
    }
    if(self.clients.openWindow)await self.clients.openWindow(target.href);
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
