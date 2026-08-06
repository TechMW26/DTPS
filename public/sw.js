// App-Shell Service Worker for DTPS
// Caches ONLY static assets for fast loads. Pages are always fetched from network.
// Works alongside firebase-messaging-sw.js (which handles push notifications)

const CACHE_VERSION = 'dtps-v4';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Static assets to pre-cache on install (app shell)
const PRECACHE_URLS = [
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/images/dtps-logo.png',
];

// URL patterns that should use cache-first strategy (immutable static assets)
// Note: We only cache truly immutable assets (icons, images, fonts)
// JS/CSS chunks are excluded to prevent stale module factory errors
const STATIC_PATTERNS = [
  /^\/icons\//,
  /^\/images\//,
  /^\/fonts\//,
  /\.woff2?$/,
  /\.ttf$/,
];

// Next.js chunks - use stale-while-revalidate for these
// This ensures fresh modules while still being fast
const NEXT_CHUNK_PATTERNS = [
  /^\/_next\/static\/chunks\//,
  /^\/_next\/static\/css\//,
];

// API routes that can be briefly cached for offline resilience (GET only)
const CACHEABLE_API_PATTERNS = [
  /^\/api\/client\/blogs/,
  /^\/api\/client\/service-plans$/,
];

// API routes that should NEVER be cached
const NEVER_CACHE_API = [
  /^\/api\/auth/,
  /^\/api\/client\/onboarding/,
  /^\/api\/payment/,
  /^\/api\/firebase-config/,
];

// Install: pre-cache essential shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        // Don't fail install if some assets are missing
        return Promise.allSettled(
          PRECACHE_URLS.map((url) => cache.add(url).catch(() => { }))
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up ALL old caches (including v1 page cache)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('dtps-') && !name.startsWith(CACHE_VERSION))
            .map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Helper: determine the caching strategy for a request
function getStrategy(url) {
  const pathname = new URL(url).pathname;

  // Never cache auth or payment APIs
  if (NEVER_CACHE_API.some((p) => p.test(pathname))) {
    return 'network-only';
  }

  // Next.js chunks: always fetch from network to prevent stale module errors
  // These have hashed filenames so browsers will cache them anyway
  if (NEXT_CHUNK_PATTERNS.some((p) => p.test(pathname))) {
    return 'network-only';
  }

  // Static assets: cache-first (immutable, hashed filenames)
  if (STATIC_PATTERNS.some((p) => p.test(pathname))) {
    return 'cache-first';
  }

  // Cacheable GET APIs: network-first with cache fallback for offline
  if (CACHEABLE_API_PATTERNS.some((p) => p.test(pathname))) {
    return 'network-first';
  }

  // Everything else (pages, other APIs): network only
  // Pages MUST go to network to get fresh HTML with correct auth state
  return 'network-only';
}

// Helper: get the appropriate cache name
function getCacheName(strategy) {
  switch (strategy) {
    case 'cache-first':
    case 'stale-while-revalidate':
      return STATIC_CACHE;
    case 'network-first':
      return API_CACHE;
    default:
      return null;
  }
}

// Cache-first: serve from cache, fallback to network (for immutable static assets)
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Only cache successful, non-redirected responses
    if (response.ok && !response.redirected) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // If offline and no cache, return a basic offline response
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Network-first: try network, fallback to cache (for API data)
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    // Only cache successful, non-redirected JSON responses
    if (response.ok && !response.redirected) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const cache = await caches.open(cacheName);
        cache.put(request, response.clone());
      }
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Stale-while-revalidate: serve from cache immediately, but revalidate in background
// This prevents stale module factory errors for Next.js chunks
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await caches.match(request);

  // Always fetch from network in background to update cache
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok && !response.redirected) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  // Return cached version immediately if available, otherwise wait for network
  if (cached) {
    // Don't wait for background update, just return cached
    return cached;
  }

  // No cache, wait for network
  const networkResponse = await fetchPromise;
  if (networkResponse) return networkResponse;

  return new Response('Module not available', { status: 503, statusText: 'Service Unavailable' });
}

// Fetch event handler
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension, data URLs, etc.
  if (!request.url.startsWith('http')) return;

  // Skip cross-origin requests
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // NEVER intercept navigation requests (page loads)
  // These must always go to the server for correct auth redirects
  if (request.mode === 'navigate') return;

  const strategy = getStrategy(request.url);
  const cacheName = getCacheName(strategy);

  if (strategy === 'network-only' || !cacheName) return;

  if (strategy === 'cache-first') {
    event.respondWith(cacheFirst(request, cacheName));
  } else if (strategy === 'network-first') {
    event.respondWith(networkFirst(request, cacheName));
  } else if (strategy === 'stale-while-revalidate') {
    event.respondWith(staleWhileRevalidate(request, cacheName));
  }
});

// Listen for messages from the app (e.g., cache invalidation)
self.addEventListener('message', (event) => {
  if (!event.data) return;

  const { type, payload } = event.data;

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CLEAR_API_CACHE':
      caches.delete(API_CACHE);
      break;

    case 'CLEAR_ALL_CACHES':
      caches.keys().then((names) => {
        names.filter((n) => n.startsWith('dtps-')).forEach((n) => caches.delete(n));
      });
      break;

    case 'CACHE_URLS':
      // Pre-cache specific static URLs
      if (payload && Array.isArray(payload.urls)) {
        caches.open(STATIC_CACHE).then((cache) => {
          payload.urls.forEach((url) => cache.add(url).catch(() => { }));
        });
      }
      break;
  }
});

// Minimal offline HTML shell
function getOfflineHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>DTPS - Offline</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f9fafb;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      color: #374151;
    }
    .container {
      text-align: center;
      padding: 2rem;
      max-width: 400px;
    }
    .logo {
      width: 64px;
      height: 64px;
      margin: 0 auto 1.5rem;
      border-radius: 12px;
      background: #E06A26;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 1.5rem;
      font-weight: bold;
    }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { color: #6b7280; margin-bottom: 1.5rem; line-height: 1.5; }
    button {
      background: #E06A26;
      color: white;
      border: none;
      padding: 0.75rem 2rem;
      border-radius: 8px;
      font-size: 1rem;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    button:active { opacity: 0.8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">D</div>
    <h1>You're Offline</h1>
    <p>Please check your internet connection and try again.</p>
    <button onclick="location.reload()">Retry</button>
  </div>
</body>
</html>`;
}
