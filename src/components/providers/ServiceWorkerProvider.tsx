'use client';

import { useEffect, useRef } from 'react';

/**
 * ServiceWorkerProvider - Registers the app-shell service worker
 * 
 * This handles:
 * - Purging stale caches from old SW versions immediately on load
 * - Registering sw.js for caching static assets only
 * - Auto-updating the service worker when a new version is available
 * - Auto-recovering from ChunkLoadError (stale chunk references after deploy)
 * 
 * Works alongside firebase-messaging-sw.js on its dedicated messaging scope.
 */
export default function ServiceWorkerProvider() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentCachePrefix = 'dtps-v4';

    // --- 1. Purge ALL old page caches immediately (even before SW registers) ---
    // This fixes white-screen caused by stale cached HTML pointing to old JS chunks
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => {
          // Delete caches from earlier service-worker versions.
          if (name.includes('pages') || name.includes('images') ||
              (name.startsWith('dtps-') && !name.startsWith(currentCachePrefix))) {
            caches.delete(name);
            console.log('[SW] Purged stale cache:', name);
          }
        });
      }).catch(() => {});
    }

    // --- 2. ChunkLoadError recovery: reload page on stale chunk 404 ---
    const handleChunkError = (event: ErrorEvent) => {
      const msg = event.message || '';
      const error = event.error;
      const isExtensionError = msg.includes('chrome-extension://') || msg.includes('moz-extension://');
      const isAppDynamicImportError = msg.includes('Failed to fetch dynamically imported module') &&
        (msg.includes('/_next/') || msg.includes(window.location.origin));
      if (
        !isExtensionError && (
          msg.includes('ChunkLoadError') ||
          msg.includes('Loading chunk') ||
          isAppDynamicImportError ||
          (error && error.name === 'ChunkLoadError')
        )
      ) {
        // Avoid infinite reload loop: only reload once per session
        const key = 'dtps-chunk-reload';
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          console.log('[SW] ChunkLoadError detected — reloading page');
          // Clear all caches before reload to get completely fresh content
          const doReload = () => location.reload();
          if ('caches' in window) {
            caches.keys().then((names) => {
              Promise.all(names.filter(n => n.startsWith('dtps-')).map(n => caches.delete(n)))
                .then(doReload);
            }).catch(doReload);
          } else {
            doReload();
          }
          return;
        }
      }
    };
    window.addEventListener('error', handleChunkError);

    // Also catch unhandled promise rejections (dynamic import failures)
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg = reason?.message || String(reason || '');
      const isExtensionError = msg.includes('chrome-extension://') || msg.includes('moz-extension://');
      const isAppDynamicImportError = msg.includes('Failed to fetch dynamically imported module') &&
        (msg.includes('/_next/') || msg.includes(window.location.origin));
      if (
        !isExtensionError && (
        msg.includes('ChunkLoadError') ||
        msg.includes('Loading chunk') ||
        isAppDynamicImportError)
      ) {
        const key = 'dtps-chunk-reload';
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          console.log('[SW] Dynamic import failure — reloading page');
          const doReload = () => location.reload();
          if ('caches' in window) {
            caches.keys().then((names) => {
              Promise.all(names.filter(n => n.startsWith('dtps-')).map(n => caches.delete(n)))
                .then(doReload);
            }).catch(doReload);
          } else {
            doReload();
          }
        }
      }
    };
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // --- 3. Register/update service worker ---
    if (!('serviceWorker' in navigator)) return;

    let disposed = false;
    let updateInterval: ReturnType<typeof setInterval> | undefined;
    let registeredWorker: ServiceWorkerRegistration | null = null;
    let installingWorker: ServiceWorker | null = null;

    const handleControllerChange = () => {
      sessionStorage.removeItem('dtps-chunk-reload');
    };

    const handleInstallingStateChange = () => {
      if (installingWorker?.state === 'installed' && navigator.serviceWorker.controller) {
        installingWorker.postMessage({ type: 'SKIP_WAITING' });
      }
    };

    const handleUpdateFound = () => {
      installingWorker?.removeEventListener('statechange', handleInstallingStateChange);
      installingWorker = registeredWorker?.installing || null;
      installingWorker?.addEventListener('statechange', handleInstallingStateChange);
    };

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });
        if (disposed) return;

        registrationRef.current = registration;
        registeredWorker = registration;

        // Force immediate update check on every page load
        registration.update().catch(() => {});

        // Check for updates periodically (every 15 minutes)
        updateInterval = setInterval(() => {
          registration.update().catch(() => {});
        }, 15 * 60 * 1000);

        // When a new SW is waiting, activate it immediately
        registration.addEventListener('updatefound', handleUpdateFound);

        // When new SW takes control, clear the chunk-reload flag
        navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
      } catch (error) {
        console.warn('[SW] Registration failed:', error);
      }
    };

    // Register immediately — don't wait for load event
    registerSW();

    return () => {
      disposed = true;
      if (updateInterval) clearInterval(updateInterval);
      installingWorker?.removeEventListener('statechange', handleInstallingStateChange);
      registeredWorker?.removeEventListener('updatefound', handleUpdateFound);
      registrationRef.current = null;
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}

// Utility functions to communicate with the service worker
export function clearApiCache() {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_API_CACHE' });
  }
}

export function clearAllCaches() {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_ALL_CACHES' });
  }
}

export function preCacheUrls(urls: string[]) {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_URLS',
      payload: { urls },
    });
  }
}
