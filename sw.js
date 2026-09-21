const CACHE='archive-slide-cache-v4';
const MAX_ENTRIES=320;

self.addEventListener('install',()=>self.skipWaiting());

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(
      names
        .filter(n=>n.startsWith('archive-slide-cache-')&&n!==CACHE)
        .map(n=>caches.delete(n))
    );
    await self.clients.claim();
  })());
});

function isSlideImage(request){
  if(request.method!=='GET')return false;
  try{
    const u=new URL(request.url);
    return u.origin===self.location.origin &&
      u.pathname.startsWith('/assets/slides/') &&
      /\.(jpe?g|webp|avif)$/i.test(u.pathname);
  }catch(_){
    return false;
  }
}

async function trim(cache){
  const keys=await cache.keys();
  if(keys.length<=MAX_ENTRIES)return;
  const excess=keys.length-MAX_ENTRIES;
  for(let i=0;i<excess;i++)await cache.delete(keys[i]);
}

self.addEventListener('fetch',event=>{
  if(!isSlideImage(event.request))return;

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(event.request);
    if(cached)return cached;

    try{
      const res=await fetch(event.request);
      if(res&&res.ok){
        try{
          await cache.put(event.request,res.clone());
          event.waitUntil(trim(cache));
        }catch(_){}
      }
      return res;
    }catch(_){
      return Response.error();
    }
  })());
});
