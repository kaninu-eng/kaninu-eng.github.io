const CACHE='archive-slide-cache-v2';
const MAX_ENTRIES=320;

self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(n=>n.startsWith('archive-slide-cache-')&&n!==CACHE).map(n=>caches.delete(n)));
    await self.clients.claim();
  })());
});

function isSlideImage(request){
  if(request.method!=='GET')return false;
  try{
    const u=new URL(request.url);
    const local=u.origin===self.location.origin && u.pathname.startsWith('/assets/slides/') && u.pathname.endsWith('.jpg');
    const google=u.hostname==='docs.google.com' && /\/presentation\/d\/[^/]+\/export\/(jpeg|png)$/.test(u.pathname);
    return local||google;
  }catch(_){return false}
}

async function trim(cache){
  const keys=await cache.keys();
  if(keys.length<=MAX_ENTRIES)return;
  const excess=keys.length-MAX_ENTRIES;
  for(let i=0;i<excess;i++)await cache.delete(keys[i]);
}

async function fetchAndCache(request,cache){
  const res=await fetch(request);
  if(res && (res.ok || res.type==='opaque')){
    try{await cache.put(request,res.clone());await trim(cache)}catch(_){}
  }
  return res;
}

self.addEventListener('fetch',event=>{
  if(!isSlideImage(event.request))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(event.request);
    if(cached){
      event.waitUntil(fetchAndCache(event.request,cache).catch(()=>{}));
      return cached;
    }
    try{return await fetchAndCache(event.request,cache)}
    catch(_){return cached||Response.error()}
  })());
});

async function prefetchUrls(urls){
  const cache=await caches.open(CACHE);
  const queue=[...new Set(urls)].slice(0,40);
  let cursor=0;
  async function worker(){
    while(cursor<queue.length){
      const url=queue[cursor++];
      const u=new URL(url,self.location.origin);
      const req=u.origin===self.location.origin
        ? new Request(u.href,{credentials:'same-origin'})
        : new Request(u.href,{mode:'no-cors',credentials:'omit'});
      const hit=await cache.match(req);
      if(hit)continue;
      try{
        const res=await fetch(req);
        if(res&&(res.ok||res.type==='opaque'))await cache.put(req,res.clone());
      }catch(_){}
    }
  }
  await Promise.all([worker(),worker()]);
  await trim(cache);
}

self.addEventListener('message',event=>{
  if(event.data?.type==='PREFETCH_SLIDES'&&Array.isArray(event.data.urls)){
    event.waitUntil(prefetchUrls(event.data.urls));
  }
});
