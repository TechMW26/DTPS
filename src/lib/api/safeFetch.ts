/**
 * Client-side Safe Fetch Utilities
 * 
 * These utilities handle common fetch issues:
 * - HTML error pages (nginx 502/503/504)
 * - Timeouts
 * - Retry logic
 * - JSON parsing errors
 */

interface SafeFetchOptions extends Omit<RequestInit, 'signal'> {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Number of retries on failure (default: 1) */
  retries?: number;
  /** Delay between retries in ms (default: 500) */
  retryDelay?: number;
}

interface SafeFetchResult<T> {
  data: T | null;
  error: string | null;
  status: number;
  ok: boolean;
}

/**
 * Safely fetch JSON data from an API endpoint.
 * Handles HTML error responses, timeouts, and provides clean error messages.
 * 
 * @param url - The API URL to fetch
 * @param options - Fetch options with timeout and retry configuration
 * @returns Object with data, error, status, and ok properties
 * 
 * @example
 * ```typescript
 * const { data, error, ok } = await safeFetch<Appointment[]>('/api/appointments');
 * if (!ok) {
 *   setError(error);
 *   return;
 * }
 * setAppointments(data);
 * ```
 */
export async function safeFetch<T = unknown>(
  url: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult<T>> {
  const {
    timeout = 30000,
    retries = 1,
    retryDelay = 500,
    ...fetchOptions
  } = options;

  const attemptFetch = async (retriesLeft: number): Promise<SafeFetchResult<T>> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          ...fetchOptions.headers,
        },
      });

      clearTimeout(timeoutId);

      // Check for HTML response (nginx error page)
      const contentType = response.headers.get('content-type') || '';
      
      if (!response.ok) {
        // If it's an HTML response (nginx error), provide a clean error message
        if (contentType.includes('text/html')) {
          const errorMsg = getHttpErrorMessage(response.status);
          
          // Retry on server errors
          if (response.status >= 500 && retriesLeft > 0) {
            await sleep(retryDelay);
            return attemptFetch(retriesLeft - 1);
          }
          
          return {
            data: null,
            error: errorMsg,
            status: response.status,
            ok: false,
          };
        }

        // Try to parse JSON error
        try {
          const errorData = await response.json();
          const errorMsg = errorData.error || errorData.message || `Request failed (${response.status})`;
          return {
            data: null,
            error: errorMsg,
            status: response.status,
            ok: false,
          };
        } catch {
          // Fallback if JSON parsing fails
          return {
            data: null,
            error: `Request failed with status ${response.status}`,
            status: response.status,
            ok: false,
          };
        }
      }

      // Success - parse JSON
      if (!contentType.includes('application/json')) {
        // Non-JSON success response
        return {
          data: null,
          error: 'Invalid response format (expected JSON)',
          status: response.status,
          ok: false,
        };
      }

      const data = await response.json();
      return {
        data: data as T,
        error: null,
        status: response.status,
        ok: true,
      };

    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof Error) {
        // Handle abort (timeout)
        if (err.name === 'AbortError') {
          if (retriesLeft > 0) {
            await sleep(retryDelay);
            return attemptFetch(retriesLeft - 1);
          }
          return {
            data: null,
            error: 'Request timed out. Please check your connection and try again.',
            status: 0,
            ok: false,
          };
        }

        // Handle network errors
        if (err.message.includes('fetch') || err.message.includes('network')) {
          if (retriesLeft > 0) {
            await sleep(retryDelay);
            return attemptFetch(retriesLeft - 1);
          }
          return {
            data: null,
            error: 'Network error. Please check your connection.',
            status: 0,
            ok: false,
          };
        }

        return {
          data: null,
          error: err.message,
          status: 0,
          ok: false,
        };
      }

      return {
        data: null,
        error: 'An unexpected error occurred',
        status: 0,
        ok: false,
      };
    }
  };

  return attemptFetch(retries);
}

/**
 * Get a user-friendly error message for HTTP status codes
 */
function getHttpErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Bad request. Please check your input.';
    case 401:
      return 'Please sign in to continue.';
    case 403:
      return 'You do not have permission to access this resource.';
    case 404:
      return 'The requested resource was not found.';
    case 408:
      return 'Request timed out. Please try again.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 500:
      return 'Server error. Please try again later.';
    case 502:
      return 'Server temporarily unavailable. Please try again.';
    case 503:
      return 'Service temporarily unavailable. Please try again.';
    case 504:
      return 'Server timeout. Please try again.';
    default:
      return `Server error (${status}). Please try again.`;
  }
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default safeFetch;
