'use client';

/**
 * Production API Client with Global Error Handling
 * 
 * Features:
 * - Automatic retry with exponential backoff
 * - Proper error classification (auth vs network vs rate limit)
 * - Toast notifications for all errors
 * - Cache busting headers
 * - Version sync checking
 * - 503/429 handling without logout
 */

import { toast } from 'sonner';
import { diagnoseApiFailure, resilientFetch } from '@/lib/api/resilient-fetch';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';

export interface ApiResponse<T = any> {
  data: T | null;
  error: string | null;
  status: number;
  success: boolean;
}

export interface ApiClientOptions extends Omit<RequestInit, 'cache'> {
  /** Number of retry attempts (default: 3) */
  retries?: number;
  /** Base delay between retries in ms (default: 1000) */
  retryDelay?: number;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Show toast on error (default: true) */
  showErrorToast?: boolean;
  /** Show toast on success (default: false) */
  showSuccessToast?: boolean;
  /** Success message for toast */
  successMessage?: string;
  /** Skip version check */
  skipVersionCheck?: boolean;
  /** Retry a POST/PATCH only when its route is independently idempotent. */
  retryUnsafe?: boolean;
}

// Error codes for specific handling
export const API_ERROR_CODES = {
  RATE_LIMIT: 'RATE_LIMIT_EXCEEDED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  SERVER_ERROR: 'SERVER_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  VERSION_MISMATCH: 'VERSION_MISMATCH',
} as const;

/**
 * Get user-friendly error message based on status code
 */
function getErrorMessage(status: number, serverMessage?: string): string {
  switch (status) {
    case 400:
      return serverMessage || 'Invalid request. Please check your input.';
    case 401:
      return 'Session expired. Please login again.';
    case 403:
      return 'You do not have permission to perform this action.';
    case 404:
      return serverMessage || 'The requested resource was not found.';
    case 408:
      return 'Request timed out. Please try again.';
    case 429:
      return serverMessage || 'Too many requests. Please wait a moment and try again.';
    case 500:
      return 'Server error. Our team has been notified.';
    case 502:
      return 'Server is temporarily unavailable. Please try again in a moment.';
    case 503:
      return 'Service temporarily unavailable. Please try again shortly.';
    case 504:
      return 'Server took too long to respond. Please try again.';
    default:
      if (status >= 400 && status < 500) {
        return serverMessage || 'Request failed. Please try again.';
      }
      if (status >= 500) {
        return serverMessage || 'Server error. Please try again later.';
      }
      return serverMessage || 'An unexpected error occurred.';
  }
}

/**
 * Show appropriate toast based on error type
 */
function showErrorToast(status: number, message: string, retryAfter?: number): void {
  if (status === 429) {
    const waitTime = retryAfter ? `${retryAfter} seconds` : 'a moment';
    toast.error(`Rate limit exceeded. Please try again in ${waitTime}.`, {
      duration: 5000,
      id: 'rate-limit-error',
    });
  } else if (status === 401) {
    toast.error('Session expired. Please login again.', {
      duration: 5000,
      id: 'auth-error',
    });
  } else if (status === 403) {
    toast.error('You do not have permission to perform this action.', {
      duration: 4000,
    });
  } else if (status >= 500) {
    toast.error(message, {
      duration: 4000,
      description: 'Please try again in a moment.',
    });
  } else {
    toast.error(message, {
      duration: 4000,
    });
  }
}

/**
 * Production API client with global error handling
 */
export async function apiClient<T = any>(
  url: string,
  options: ApiClientOptions = {}
): Promise<ApiResponse<T>> {
  const {
    retries = 3,
    retryDelay = 1000,
    timeout = 30000,
    showErrorToast: showError = true,
    showSuccessToast = false,
    successMessage,
    skipVersionCheck = false,
    retryUnsafe = false,
    ...fetchOptions
  } = options;

  try {
    const requestHeaders = new Headers(fetchOptions.headers);
    if (!requestHeaders.has('Content-Type')) requestHeaders.set('Content-Type', 'application/json');
    requestHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    requestHeaders.set('Pragma', 'no-cache');
    requestHeaders.set('X-App-Version', APP_VERSION);
    const idempotencyKey = requestHeaders.get('x-idempotency-key') || undefined;

    const response = await resilientFetch(url, {
      ...fetchOptions,
      cache: 'no-store',
      headers: requestHeaders,
    }, {
      attempts: retries + 1,
      timeoutMs: timeout,
      baseDelayMs: retryDelay,
      idempotencyKey,
      retryUnsafe,
      onRecoveryState: (state) => {
        if (state.phase === 'retrying') {
          console.info(`[API] Recovering ${url}; automatic attempt ${state.attempt + 1}/${state.maxAttempts}`);
        }
      },
    });

      // Check version from response headers
      if (!skipVersionCheck) {
        const serverVersion = response.headers.get('X-App-Version');
        if (serverVersion && serverVersion !== APP_VERSION) {
          console.warn(`Version mismatch: client=${APP_VERSION}, server=${serverVersion}`);
          // Don't force reload, just log - version sync handled elsewhere
        }
      }

      // Parse response
      let data: any = null;
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        try {
          data = await response.json();
        } catch {
          data = null;
        }
      }

      // Handle success
      if (response.ok) {
        if (showSuccessToast && successMessage) {
          toast.success(successMessage);
        }
        return { data, error: null, status: response.status, success: true };
      }

      // Handle errors
      const serverMessage = data?.error || data?.message;
      const retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10);
      const lastError = getErrorMessage(response.status, serverMessage);

      // Show error toast
      if (showError) {
        showErrorToast(response.status, lastError, retryAfter);
      }

      return { data: null, error: lastError, status: response.status, success: false };
  } catch (error) {
    const diagnosis = diagnoseApiFailure({ error });
    if (showError) {
      toast.error(diagnosis.message, {
      description: 'Please try again later.',
      duration: 5000,
      });
    }
    return { data: null, error: diagnosis.message, status: 0, success: false };
  }
}

/**
 * GET request helper
 */
export async function apiGet<T = any>(
  url: string, 
  options: Omit<ApiClientOptions, 'method' | 'body'> = {}
): Promise<ApiResponse<T>> {
  return apiClient<T>(url, { ...options, method: 'GET' });
}

/**
 * POST request helper
 */
export async function apiPost<T = any>(
  url: string,
  body?: any,
  options: Omit<ApiClientOptions, 'method'> = {}
): Promise<ApiResponse<T>> {
  return apiClient<T>(url, {
    ...options,
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT request helper
 */
export async function apiPut<T = any>(
  url: string,
  body?: any,
  options: Omit<ApiClientOptions, 'method'> = {}
): Promise<ApiResponse<T>> {
  return apiClient<T>(url, {
    ...options,
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PATCH request helper
 */
export async function apiPatch<T = any>(
  url: string,
  body?: any,
  options: Omit<ApiClientOptions, 'method'> = {}
): Promise<ApiResponse<T>> {
  return apiClient<T>(url, {
    ...options,
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE request helper
 */
export async function apiDelete<T = any>(
  url: string,
  options: Omit<ApiClientOptions, 'method'> = {}
): Promise<ApiResponse<T>> {
  return apiClient<T>(url, { ...options, method: 'DELETE' });
}

export default apiClient;
