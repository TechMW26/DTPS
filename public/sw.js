// Cache only public media and static assets. Private media uses authenticated
// HTTP revalidation; pages, API JSON and Next.js chunks stay network/browser-owned.
const CACHE_VERSION = 'dtps-v5';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const MEDIA_CACHE = `${CACHE_VERSION}-media`;
const MAX_ENTRIES = 32;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_AGE = 15 * 60 * 1000;
const pending = new Map();
const PRECACHE_URLS = ['/icons/icon-192x192.png', '/icons/icon-512x512.png', '/images/dtps-logo.png'];

function cacheName(url) {
  if (url.origin === self.location.origin && /^\/(icons|images|fonts)\//.test(url.pathname)) return STATIC_CACHE;
  if (url.protocol === 'https:' && /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(url.hostname)) return MEDIA_CACHE;
  return null;
}

async function cachedAsset(request, name) {
  const key = request.url;
  if (pending.has(key)) return (await pending.get(key)).clone();
  const work = (async () => {
    let cache, cached;
    try {
      cache = await caches.open(name);
      cached = await cache.match(request);
      const saved = Number(cached?.headers.get('x-dtps-cached-at'));
      if (cached && saved && Date.now() - saved < MAX_AGE && !['reload', 'no-store', 'no-cache'].includes(request.cache)) return cached;
      if (cached) await cache.delete(request);
    } catch { /* Restricted storage must not break online loading. */ }
    // Public Blob supports CORS. Never persist opaque responses whose size and
    // content type cannot be checked, or authenticated/redirected API responses.
    const crossOrigin = new URL(request.url).origin !== self.location.origin;
    let response;
    try { response = await fetch(request, crossOrigin ? { mode: 'cors', credentials: 'omit' } : undefined); }
    catch (error) { if (cached) return cached; if (crossOrigin) return fetch(request); throw error; }
    const length = Number(response.headers.get('content-length'));
    const type = response.headers.get('content-type') || '';
    const control = response.headers.get('cache-control') || '';
    if (cache && request.cache !== 'no-store' && response.status === 200 && !response.redirected && response.type !== 'opaque'
      && length > 0 && length <= MAX_BYTES && !/private|no-store|no-cache/i.test(control)
      && /^(image\/|audio\/|video\/|font\/|application\/(pdf|font|x-font|vnd.ms-fontobject))/.test(type)) {
      try {
        const body = await response.clone().blob();
        if (body.size <= MAX_BYTES) {
          const headers = new Headers(response.headers);
          headers.delete('content-encoding');
          headers.set('content-length', String(body.size));
          headers.set('x-dtps-cached-at', String(Date.now()));
          await cache.put(request, new Response(body, { status: 200, headers }));
          const keys = await cache.keys();
          await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES)).map(key => cache.delete(key)));
        }
      } catch { /* Quota/full storage errors are non-fatal. */ }
    }
    return response;
  })();
  pending.set(key, work);
  try { return (await work).clone(); } finally { if (pending.get(key) === work) pending.delete(key); }
}

self.addEventListener('install', event => {
  event.waitUntil(Promise.allSettled(PRECACHE_URLS.map(url => cachedAsset(new Request(new URL(url, self.location.origin)), STATIC_CACHE))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name.startsWith('dtps-') && !name.startsWith(CACHE_VERSION)).map(name => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode === 'navigate' || request.headers.has('range') || request.headers.has('authorization')) return;
  const name = cacheName(new URL(request.url));
  if (name) event.respondWith(cachedAsset(request, name));
});
self.addEventListener('message', event => {
  const { type, payload } = event.data || {};
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'CLEAR_ALL_CACHES') event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name.startsWith('dtps-')).map(name => caches.delete(name)))));
  if (type === 'CLEAR_API_CACHE') event.waitUntil(caches.delete(`${CACHE_VERSION}-api`));
  if (type === 'CACHE_URLS' && Array.isArray(payload?.urls)) {
    event.waitUntil(Promise.allSettled(payload.urls.slice(0, MAX_ENTRIES).map(value => {
      const url = new URL(value, self.location.origin);
      const name = cacheName(url);
      return name ? cachedAsset(new Request(url), name) : Promise.resolve();
    })));
  }
});
