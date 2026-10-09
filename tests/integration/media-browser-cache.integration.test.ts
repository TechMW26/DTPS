import fs from 'node:fs';
import vm from 'node:vm';
function worker(){
 const stores=new Map<string,Map<string,Response>>(), handlers:Record<string,Function>={};let now=100000;
 const caches={open:async(name:string)=>{if(!stores.has(name))stores.set(name,new Map());const rows=stores.get(name)!;return {match:async(r:Request)=>rows.get(r.url)?.clone(),put:async(r:Request,v:Response)=>{rows.set(r.url,v.clone());},delete:async(r:Request)=>rows.delete(r.url),keys:async()=>[...rows.keys()].map(url=>new Request(url))};},keys:async()=>[...stores.keys()],delete:async(name:string)=>stores.delete(name)};
 const fetch=jest.fn(async()=>new Response('image',{headers:{'content-type':'image/png','content-length':'5'}}));
 const api=vm.runInNewContext(fs.readFileSync('public/sw.js','utf8')+'\n;({cachedAsset,cacheName,MEDIA_CACHE});',{self:{location:{origin:'https://dtps.tech'},addEventListener:(name:string,fn:Function)=>{handlers[name]=fn;}},caches,fetch,Request,Response,Headers,URL,Map,Date:{now:()=>now}});
 return {api,fetch,stores,handlers,advance:()=>{now+=16*60*1000;}};
}
const url='https://sample.public.blob.vercel-storage.com/photo-v1.png';
it('reuses public media, coalesces downloads, expires and loads changed URLs',async()=>{
 const w=worker(),req=new Request(url);
 await Promise.all([w.api.cachedAsset(req,w.api.MEDIA_CACHE),w.api.cachedAsset(req,w.api.MEDIA_CACHE)]);
 await w.api.cachedAsset(req,w.api.MEDIA_CACHE);expect(w.fetch).toHaveBeenCalledTimes(1);
 await w.api.cachedAsset(new Request(url.replace('v1','v2')),w.api.MEDIA_CACHE);expect(w.fetch).toHaveBeenCalledTimes(2);
 w.advance();await w.api.cachedAsset(req,w.api.MEDIA_CACHE);expect(w.fetch).toHaveBeenCalledTimes(3);
});
it('never intercepts private APIs, navigation, authorization or range requests',()=>{
 const w=worker();for(const target of ['https://dtps.tech/api/files/a','https://dtps.tech/api/media/a','https://dtps.tech/api/auth/session'])expect(w.api.cacheName(new URL(target))).toBeNull();
 for(const headers of [{range:'bytes=0-4'},{authorization:'Bearer test'}] as Record<string,string>[]){const respondWith=jest.fn();w.handlers.fetch({request:new Request(url,{headers}),respondWith});expect(respondWith).not.toHaveBeenCalled();}
});
it('bounds entries and refuses oversized or private responses',async()=>{
 const w=worker();for(let i=0;i<35;i++)await w.api.cachedAsset(new Request(url+'?v='+i),w.api.MEDIA_CACHE);
 expect(w.stores.get(w.api.MEDIA_CACHE)?.size).toBe(32);
 w.fetch.mockImplementation(async()=>new Response('large',{headers:{'content-type':'image/png','content-length':String(3*1024*1024)}}));
 await w.api.cachedAsset(new Request(url+'?large'),w.api.MEDIA_CACHE);expect(w.stores.get(w.api.MEDIA_CACHE)?.has(url+'?large')).toBe(false);
 w.fetch.mockImplementation(async()=>new Response('private',{headers:{'content-type':'image/png','content-length':'7','cache-control':'private, no-store'}}));
 await w.api.cachedAsset(new Request(url+'?private'),w.api.MEDIA_CACHE);expect(w.stores.get(w.api.MEDIA_CACHE)?.has(url+'?private')).toBe(false);
});
it('can reuse an expired public asset while offline',async()=>{
 const w=worker(),req=new Request(url);
 await w.api.cachedAsset(req,w.api.MEDIA_CACHE);w.advance();w.fetch.mockRejectedValue(new Error('offline'));
 expect(await (await w.api.cachedAsset(req,w.api.MEDIA_CACHE)).text()).toBe('image');
});
