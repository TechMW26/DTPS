'use client';

import { useLayoutEffect } from 'react';
import {
  buildCachedSessionResponse,
  clearLastValidSession,
  persistSessionPayload,
} from '@/lib/auth/session-recovery';

/**
 * Global fetch interceptor that adds:
 * 1. Cache-busting headers to API routes only (not static assets/pages)
 * 2. Retry logic for failed requests (401s and 500s)
 * 3. Automatic credential inclusion
 * 
 * Optimized: Only intercepts API calls, skips static/page fetches for speed.
 */
export function GlobalFetchInterceptor() {
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const originalFetch = window.fetch;
    // Retry configuration — fast retries
    const MAX_RETRIES = 1; // Reduced from 2 to 1 for faster perceived response
    const RETRY_DELAY = 200; // ms (was 300)
    const pendingGetRequests = new Map<string, Promise<Response>>();

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const getAuthFallbackResponse = (url: string): Response | null => {
      // Never turn a temporary network/server failure into a logout. The real
      // session endpoint will authoritatively clear this cache once reachable.
      if (url.includes('/api/auth/session')) {
        return buildCachedSessionResponse(window.localStorage);
      }

      // Logout-notification check can safely degrade to empty payload
      if (url.includes('/api/auth/logout-notification')) {
        return new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return null;
    };

    const fetchWithRetry = async (
      input: RequestInfo | URL,
      init?: RequestInit,
      retriesLeft: number = MAX_RETRIES
    ): Promise<Response> => {
      // Guard: if input is undefined/null or not a valid fetch argument, pass through to original fetch
      // This prevents crashes when code accidentally calls fetch(undefined)
      if (!input) {
        return originalFetch(input, init);
      }

      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request)?.url || '';
      const pathname = new URL(url || window.location.href, window.location.origin).pathname;

      const isApiCall = url.startsWith('/api') || url.startsWith(window.location.origin + '/api');
      const isAuthCall = url.includes('/api/auth');
      const isSessionCall = pathname === '/api/auth/session';
      const isLogoutCall = pathname === '/api/auth/logout' || pathname === '/api/auth/signout';
      const isSameOrigin = url.startsWith('/') || url.startsWith(window.location.origin);

      // For external URLs or non-API same-origin requests, pass through WITHOUT modification
      if (!isSameOrigin || !isApiCall) {
        return originalFetch(input, init);
      }

      // Only add cache-busting headers to mutating API calls (POST, PUT, DELETE)
      // GET requests are allowed to be cached by the service worker for offline support
      const method = (init?.method || 'GET').toUpperCase();
      const needsCacheBust = method !== 'GET' && method !== 'HEAD';
      const requestHeaders = new Headers(init?.headers);
      const retryManaged = requestHeaders.get('x-dtps-retry-managed') === '1';
      const availableRetries = retryManaged ? 0 : retriesLeft;

      if (needsCacheBust) {
        requestHeaders.set('Cache-Control', 'no-cache');
        requestHeaders.set('Pragma', 'no-cache');
      }

      const modifiedInit: RequestInit = {
        ...init,
        credentials: 'same-origin',
        headers: requestHeaders,
      };

      try {
        const response = await originalFetch(input, modifiedInit);

        if (isLogoutCall && response.ok) clearLastValidSession(window.localStorage);

        if (isSessionCall && response.ok) {
          try {
            const sessionPayload = await response.clone().json();
            persistSessionPayload(window.localStorage, sessionPayload);
          } catch { /* let NextAuth handle malformed successful responses */ }
        }

        // Retry on 401 Unauthorized (session might not be ready) - skip for auth calls
        if (response.status === 401 && availableRetries > 0 && !isAuthCall) {
          await sleep(RETRY_DELAY);
          return fetchWithRetry(input, init, retriesLeft - 1);
        }

        // Retry on server errors — only for GET requests
        if (response.status >= 500 && availableRetries > 0 && method === 'GET') {
          await sleep(RETRY_DELAY);
          return fetchWithRetry(input, init, retriesLeft - 1);
        }

        if (isSessionCall && (response.status === 408 || response.status === 429 || response.status >= 500)) {
          return buildCachedSessionResponse(window.localStorage) || response;
        }

        return response;
      } catch (error) {
        // Retry on network errors (including "Failed to fetch")
        if (availableRetries > 0 && error instanceof Error) {
          const isNetworkError =
            error.message.includes('Failed to fetch') ||
            error.message.includes('NetworkError') ||
            error.name === 'TypeError' ||
            !error.name.includes('Abort');

          if (isNetworkError) {
            await sleep(RETRY_DELAY);
            return fetchWithRetry(input, init, retriesLeft - 1);
          }
        }

        // Graceful fallback for auth polling endpoints on final network failure
        const fallback = getAuthFallbackResponse(url);
        if (fallback) {
          return fallback;
        }

        throw error;
      }
    };

    // Coalesce only concurrent, signal-free GET requests. Each caller receives
    // its own Response clone, so consuming one body never affects another.
    // This removes duplicate profile/count/service-plan requests mounted by
    // adjacent client components without introducing stale response caching.
    const fetchOptimized = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      if (input instanceof Request || init?.signal) {
        return fetchWithRetry(input, init);
      }

      const url = typeof input === 'string' ? input : input.href;
      const method = (init?.method || 'GET').toUpperCase();
      const isApiGet = method === 'GET' && (
        url.startsWith('/api') || url.startsWith(window.location.origin + '/api')
      );

      if (!isApiGet) return fetchWithRetry(input, init);

      const requestKey = new URL(url, window.location.origin).href;
      const pendingRequest = pendingGetRequests.get(requestKey);
      if (pendingRequest) return (await pendingRequest).clone();

      const request = fetchWithRetry(input, init);
      pendingGetRequests.set(requestKey, request);

      try {
        return (await request).clone();
      } finally {
        if (pendingGetRequests.get(requestKey) === request) {
          pendingGetRequests.delete(requestKey);
        }
      }
    };

    window.fetch = fetchOptimized;

    return () => {
      window.fetch = originalFetch;
      pendingGetRequests.clear();
    };
  }, []);

  return null;
}

export default GlobalFetchInterceptor;
