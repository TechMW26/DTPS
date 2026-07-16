/**
 * Cache Control Utilities
 * 
 * Provides consistent cache headers for different types of API responses.
 * Features:
 * - No-cache headers for authenticated/sensitive data
 * - Proper static asset caching
 * - Cache-busting utilities
 */

export type CacheStrategy = 
  | 'no-cache'      // For authenticated/sensitive data
  | 'short'         // 1 minute cache
  | 'medium'        // 5 minutes cache  
  | 'long'          // 1 hour cache
  | 'static'        // Immutable static assets
  | 'private';      // Private browser cache only

/**
 * Get cache control headers for no-cache (authenticated APIs)
 */
export function getNoCacheHeaders(): HeadersInit {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
  };
}

/**
 * Get cache control headers for static assets
 */
export function getStaticCacheHeaders(maxAge: number = 31536000): HeadersInit {
  return {
    'Cache-Control': `public, max-age=${maxAge}, immutable`,
  };
}

/**
 * Get cache control headers based on strategy
 */
export function getCacheControlHeaders(strategy: CacheStrategy): HeadersInit {
  switch (strategy) {
    case 'no-cache':
      return getNoCacheHeaders();
    
    case 'short':
      return {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=30',
      };
    
    case 'medium':
      return {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      };
    
    case 'long':
      return {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=300',
      };
    
    case 'static':
      return getStaticCacheHeaders();
    
    case 'private':
      return {
        'Cache-Control': 'private, max-age=300',
      };
    
    default:
      return getNoCacheHeaders();
  }
}

/**
 * Add app version header to response
 */
export function addVersionHeader(headers: Headers): Headers {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || 
                  process.env.npm_package_version || 
                  '1.0.0';
  headers.set('X-App-Version', version);
  return headers;
}

/**
 * Create API response with proper cache headers
 */
export function createApiResponse<T>(
  data: T,
  options: {
    status?: number;
    cacheStrategy?: CacheStrategy;
    headers?: HeadersInit;
  } = {}
): Response {
  const { status = 200, cacheStrategy = 'no-cache', headers: customHeaders = {} } = options;
  
  const cacheHeaders = getCacheControlHeaders(cacheStrategy);
  const version = process.env.NEXT_PUBLIC_APP_VERSION || 
                  process.env.npm_package_version || 
                  '1.0.0';

  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-App-Version': version,
      ...cacheHeaders,
      ...customHeaders,
    },
  });
}

/**
 * Create error response with proper cache headers
 */
export function createErrorResponse(
  message: string,
  status: number = 500,
  additionalData?: Record<string, unknown>
): Response {
  return createApiResponse(
    { error: message, ...additionalData },
    { status, cacheStrategy: 'no-cache' }
  );
}
