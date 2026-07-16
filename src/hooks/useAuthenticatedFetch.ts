'use client';

import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface FetchOptions extends Omit<RequestInit, 'cache'> {
  /** Number of retry attempts on failure (default: 2) */
  retries?: number;
  /** Delay between retries in ms (default: 500) */
  retryDelay?: number;
  /** Skip waiting for session - use for public APIs */
  skipAuth?: boolean;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Hook for making authenticated API calls that waits for session to be ready.
 * Solves the race condition where fetch happens before session is established.
 * 
 * @param url - The API endpoint URL
 * @param options - Fetch options including retry configuration
 * @returns Object with data, loading, error states and refetch function
 */
export function useAuthenticatedFetch<T = unknown>(
  url: string,
  options: FetchOptions = {}
): FetchState<T> {
  const { data: session, status } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasFetchedRef = useRef(false);

  const {
    retries = 2,
    retryDelay = 500,
    skipAuth = false,
    timeout = 30000,
    ...fetchOptions
  } = options;

  const fetchWithRetry = useCallback(async (
    fetchUrl: string,
    opts: RequestInit,
    retriesLeft: number
  ): Promise<Response> => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    // Create timeout
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(fetchUrl, {
        ...opts,
        signal: controller.signal,
        // Always bust cache for authenticated requests
        cache: 'no-store',
        headers: {
          ...opts.headers,
          // Add cache-busting headers
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });
      
      clearTimeout(timeoutId);
      
      // Retry on 401 if we have retries left and session is authenticated
      // (401 might occur if session wasn't ready when request started)
      if (response.status === 401 && retriesLeft > 0 && !skipAuth) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return fetchWithRetry(fetchUrl, opts, retriesLeft - 1);
      }
      
      // Retry on server errors (500+) or network issues
      if (!response.ok && response.status >= 500 && retriesLeft > 0) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return fetchWithRetry(fetchUrl, opts, retriesLeft - 1);
      }
      
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      
      // Don't retry on abort
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      
      // Retry on network errors
      if (retriesLeft > 0) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return fetchWithRetry(fetchUrl, opts, retriesLeft - 1);
      }
      
      throw err;
    }
  }, [timeout, retryDelay, skipAuth]);

  const fetchData = useCallback(async () => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetchWithRetry(url, fetchOptions, retries);
      
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      
      const result = await response.json();
      setData(result);
    } catch (err) {
      // Ignore abort errors
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [url, fetchOptions, retries, fetchWithRetry]);

  useEffect(() => {
    // For public APIs, fetch immediately
    if (skipAuth) {
      fetchData();
      return;
    }
    
    // Wait for session to be determined (not loading)
    if (status === 'loading') {
      return;
    }
    
    // If unauthenticated, set loading to false but don't fetch
    if (status === 'unauthenticated') {
      setLoading(false);
      return;
    }
    
    // Session is authenticated - safe to fetch
    if (status === 'authenticated' && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchData();
    }
    
    // Cleanup
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [status, skipAuth, fetchData]);

  // Reset hasFetched when URL changes
  useEffect(() => {
    hasFetchedRef.current = false;
  }, [url]);

  const refetch = useCallback(async () => {
    hasFetchedRef.current = true;
    await fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch };
}

/**
 * Standalone authenticated fetch function with retry logic.
 * Use this for imperative fetch calls (e.g., form submissions).
 * 
 * @param url - The API endpoint URL
 * @param options - Fetch options including retry configuration
 * @returns Promise with the response data
 */
export async function authenticatedFetch<T = unknown>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const {
    retries = 2,
    retryDelay = 500,
    timeout = 30000,
    ...fetchOptions
  } = options;

  const fetchWithRetry = async (retriesLeft: number): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          ...fetchOptions.headers,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });
      
      clearTimeout(timeoutId);
      
      // Retry on 401 (session might not have been ready)
      if (response.status === 401 && retriesLeft > 0) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return fetchWithRetry(retriesLeft - 1);
      }
      
      // Retry on server errors
      if (!response.ok && response.status >= 500 && retriesLeft > 0) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return fetchWithRetry(retriesLeft - 1);
      }
      
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      
      if (retriesLeft > 0) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return fetchWithRetry(retriesLeft - 1);
      }
      
      throw err;
    }
  };

  const response = await fetchWithRetry(retries);
  
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  
  return response.json();
}

export default useAuthenticatedFetch;
