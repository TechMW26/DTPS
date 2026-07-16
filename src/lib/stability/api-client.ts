/**
 * Production-Grade API Client
 * 
 * Features:
 * - Automatic retry with exponential backoff for transient failures
 * - Proper error classification (auth vs network vs server errors)
 * - Timeout handling with AbortController
 * - Cache control headers for authenticated requests
 * - Version synchronization checks
 * - 503 handling without triggering logout
 */

import { versionManager } from './version-sync';

export interface StableApiOptions extends Omit<RequestInit, 'cache'> {
  /** Number of retry attempts for transient failures (default: 3) */
  retries?: number;
  /** Base delay between retries in ms (default: 1000) */
  retryDelay?: number;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Skip authentication check (for public APIs) */
  skipAuth?: boolean;
  /** Skip version check on response */
  skipVersionCheck?: boolean;
  /** Custom retry condition */
  shouldRetry?: (response: Response, attempt: number) => boolean;
}

export class StableApiError extends Error {
  public readonly status: number;
  public readonly isAuthError: boolean;
  public readonly isNetworkError: boolean;
  public readonly isServerError: boolean;
  public readonly isTimeout: boolean;
  public readonly isRetryable: boolean;
  public readonly response?: Response;

  constructor(
    message: string,
    options: {
      status?: number;
      isAuthError?: boolean;
      isNetworkError?: boolean;
      isServerError?: boolean;
      isTimeout?: boolean;
      response?: Response;
    } = {}
  ) {
    super(message);
    this.name = 'StableApiError';
    this.status = options.status || 0;
    this.isAuthError = options.isAuthError || false;
    this.isNetworkError = options.isNetworkError || false;
    this.isServerError = options.isServerError || false;
    this.isTimeout = options.isTimeout || false;
    this.response = options.response;
    
    // Determine if error is retryable
    this.isRetryable = 
      this.isNetworkError || 
      this.isTimeout || 
      (this.isServerError && this.status !== 501); // Don't retry 501 Not Implemented
  }
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateBackoff(attempt: number, baseDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // Add 0-30% jitter
  return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
}

/**
 * Default retry condition
 */
function defaultShouldRetry(response: Response, attempt: number): boolean {
  // Retry on 503 (Service Unavailable), 502 (Bad Gateway), 504 (Gateway Timeout)
  // Also retry on 429 (Too Many Requests) after delay
  return [502, 503, 504, 429].includes(response.status);
}

/**
 * Create stable API client with retry logic and proper error handling
 */
export const stableApi = {
  /**
   * Make a fetch request with production-grade error handling
   */
  async fetch<T = unknown>(
    url: string,
    options: StableApiOptions = {}
  ): Promise<{ data: T; response: Response }> {
    const {
      retries = 3,
      retryDelay = 1000,
      timeout = 30000,
      skipAuth = false,
      skipVersionCheck = false,
      shouldRetry = defaultShouldRetry,
      ...fetchOptions
    } = options;

    let lastError: StableApiError | null = null;
    let attempt = 0;

    while (attempt <= retries) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal,
          cache: 'no-store',
          headers: {
            ...fetchOptions.headers,
            // Cache-busting headers for authenticated requests
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-App-Version': versionManager.getVersion(),
          },
        });

        clearTimeout(timeoutId);

        // Check version from response headers
        if (!skipVersionCheck) {
          const serverVersion = response.headers.get('X-App-Version');
          if (serverVersion) {
            versionManager.checkVersion(serverVersion);
          }
        }

        // Handle authentication errors - don't retry these
        if (response.status === 401) {
          throw new StableApiError('Authentication required', {
            status: 401,
            isAuthError: true,
            response,
          });
        }

        // Handle forbidden - don't retry
        if (response.status === 403) {
          throw new StableApiError('Access forbidden', {
            status: 403,
            isAuthError: true,
            response,
          });
        }

        // Check if we should retry this response
        if (!response.ok && shouldRetry(response, attempt) && attempt < retries) {
          const delay = calculateBackoff(attempt, retryDelay);
          
          // For 429, check Retry-After header
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            if (retryAfter) {
              const retryAfterMs = parseInt(retryAfter, 10) * 1000;
              await new Promise(resolve => setTimeout(resolve, Math.min(retryAfterMs, 30000)));
            } else {
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          } else {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          attempt++;
          continue;
        }

        // Handle server errors after retries exhausted
        if (response.status >= 500) {
          throw new StableApiError(`Server error: ${response.status}`, {
            status: response.status,
            isServerError: true,
            response,
          });
        }

        // Handle other non-ok responses
        if (!response.ok) {
          throw new StableApiError(`Request failed: ${response.status}`, {
            status: response.status,
            response,
          });
        }

        // Parse JSON response
        const data = await response.json() as T;
        return { data, response };

      } catch (error) {
        clearTimeout(timeoutId);

        // Handle abort/timeout
        if (error instanceof DOMException && error.name === 'AbortError') {
          lastError = new StableApiError('Request timed out', {
            isTimeout: true,
          });
          
          if (attempt < retries) {
            const delay = calculateBackoff(attempt, retryDelay);
            await new Promise(resolve => setTimeout(resolve, delay));
            attempt++;
            continue;
          }
          throw lastError;
        }

        // Handle network errors
        if (error instanceof TypeError && error.message.includes('fetch')) {
          lastError = new StableApiError('Network error', {
            isNetworkError: true,
          });
          
          if (attempt < retries) {
            const delay = calculateBackoff(attempt, retryDelay);
            await new Promise(resolve => setTimeout(resolve, delay));
            attempt++;
            continue;
          }
          throw lastError;
        }

        // Re-throw StableApiError
        if (error instanceof StableApiError) {
          throw error;
        }

        // Unknown error
        throw new StableApiError(
          error instanceof Error ? error.message : 'Unknown error',
          { isNetworkError: true }
        );
      }
    }

    throw lastError || new StableApiError('Request failed after retries');
  },

  /**
   * Convenience method for GET requests
   */
  async get<T = unknown>(url: string, options: StableApiOptions = {}): Promise<T> {
    const { data } = await this.fetch<T>(url, { ...options, method: 'GET' });
    return data;
  },

  /**
   * Convenience method for POST requests
   */
  async post<T = unknown>(
    url: string, 
    body?: unknown, 
    options: StableApiOptions = {}
  ): Promise<T> {
    const { data } = await this.fetch<T>(url, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    return data;
  },

  /**
   * Convenience method for PUT requests
   */
  async put<T = unknown>(
    url: string, 
    body?: unknown, 
    options: StableApiOptions = {}
  ): Promise<T> {
    const { data } = await this.fetch<T>(url, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    return data;
  },

  /**
   * Convenience method for PATCH requests
   */
  async patch<T = unknown>(
    url: string, 
    body?: unknown, 
    options: StableApiOptions = {}
  ): Promise<T> {
    const { data } = await this.fetch<T>(url, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    return data;
  },

  /**
   * Convenience method for DELETE requests
   */
  async delete<T = unknown>(url: string, options: StableApiOptions = {}): Promise<T> {
    const { data } = await this.fetch<T>(url, { ...options, method: 'DELETE' });
    return data;
  },
};
