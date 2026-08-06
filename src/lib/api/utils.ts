import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import crypto from 'crypto';
import { logApiError } from '@/lib/utils/activityLogger';

// Re-export memory cache utilities for easy access in all APIs
export { serverCache, withCache, clearCacheByTag } from '@/lib/cache/memoryCache';

/**
 * API Stability Utilities
 * 
 * These utilities help ensure consistent API behavior, error handling,
 * and optional conditional caching for admin/internal APIs.
 * 
 * ⚠️ IMPORTANT: Conditional caching (ETag/304) should ONLY be used for
 * admin/internal APIs, NOT for user-facing routes (/user/**, /api/client/**)
 */

// Standard error response format
export interface APIError {
  error: string;
  code?: string;
  details?: unknown;
}

// Standard success response with optional cache metadata
export interface APIResponse<T = unknown> {
  data?: T;
  meta?: {
    timestamp: string;
    cached?: boolean;
    etag?: string;
  };
}

/**
 * Create a standardized error response
 */
export function errorResponse(
  message: string,
  status: number = 500,
  code?: string,
  details?: unknown
): NextResponse<APIError> {
  console.error(`API Error [${status}]: ${message}`, details || '');

  const response: APIError = {
    error: message,
  };

  if (code) {
    response.code = code;
  }

  if (details && process.env.NODE_ENV === 'development') {
    response.details = details;
  }

  return NextResponse.json(response, { status });
}

/**
 * Wrap an API handler with consistent error handling and DB connection
 * 
 * Optimized: runs auth check and DB connection in PARALLEL for ~50% faster cold starts.
 * 
 * @param handler - The actual API logic
 * @param options - Configuration options
 */
export async function withAPIHandler<T>(
  handler: () => Promise<T>,
  options: {
    requireAuth?: boolean;
    requireAdmin?: boolean;
    timeoutMs?: number;
    request?: NextRequest;
  } = {}
): Promise<NextResponse> {
  const { requireAuth = true, requireAdmin = false, timeoutMs = 8000, request } = options;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let sessionRef: Awaited<ReturnType<typeof getServerSession>> | null = null;

  try {
    // Run auth check and DB connection in PARALLEL (instead of sequential)
    const authPromise = requireAuth
      ? getServerSession(authOptions)
      : Promise.resolve(null);

    const dbPromise = connectDB();
    const timeoutPromise = new Promise<void>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Database connection timeout')), timeoutMs);
    });

    // Wait for both auth + DB concurrently
    const [session] = await Promise.all([
      authPromise,
      Promise.race([dbPromise, timeoutPromise]),
    ]);
    if (timeoutId) clearTimeout(timeoutId);
    sessionRef = session;

    // Validate auth result
    if (requireAuth) {
      if (!session?.user) {
        return errorResponse('Unauthorized', 401, 'AUTH_REQUIRED');
      }

      if (requireAdmin) {
        const role = session.user.role?.toLowerCase();
        if (!role?.includes('admin')) {
          return errorResponse('Forbidden - Admin access required', 403, 'ADMIN_REQUIRED');
        }
      }
    }

    // Execute handler
    const result = await handler();

    // If result is already a NextResponse, return it
    if (result instanceof NextResponse) {
      return result;
    }

    // Otherwise wrap in standard response
    return NextResponse.json({
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    if (timeoutId) clearTimeout(timeoutId);

    // Log to SystemAlert (fire-and-forget — do not await to avoid latency)
    const endpoint = request ? new URL(request.url).pathname : 'unknown';
    const method = request?.method || 'UNKNOWN';
    const statusCode = error.message?.includes('timeout') ? 504
      : error.message?.includes('Database connection') ? 503
      : error.name === 'ValidationError' ? 400
      : 500;
    const sessionUser = (sessionRef as { user?: {
      id?: string;
      name?: string | null;
      email?: string | null;
      role?: string;
    } } | null)?.user;
    logApiError(endpoint, method, error, statusCode, {
      endpoint,
      path: endpoint,
      section: endpoint.startsWith('/api/admin') ? 'admin'
        : endpoint.startsWith('/api/client') ? 'client'
        : endpoint.startsWith('/api/dietitian-panel') ? 'dietitian'
        : endpoint.startsWith('/api/health-counselor') ? 'health_counselor'
        : 'internal',
      userId: sessionUser?.id,
      userName: sessionUser?.name,
      userEmail: sessionUser?.email,
      userRole: sessionUser?.role,
    }).catch(() => { /* silent — logging must not block response */ });

    // Handle specific error types
    if (error.message?.includes('timeout')) {
      return errorResponse('Request timeout', 504, 'TIMEOUT');
    }

    if (error.message?.includes('Database connection')) {
      return errorResponse('Service temporarily unavailable', 503, 'DB_ERROR');
    }

    if (error.name === 'ValidationError') {
      return errorResponse('Validation failed', 400, 'VALIDATION_ERROR', error.message);
    }

    // Generic error
    return errorResponse(
      error.message || 'Internal server error',
      500,
      'INTERNAL_ERROR'
    );
  }
}

/**
 * Log an API route error to SystemAlert (for use in manual route catch blocks).
 * Fire-and-forget — never throws.
 *
 * @example
 * } catch (error) {
 *   captureApiError(req, error, session);
 *   return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
 * }
 */
export function captureApiError(
  request: NextRequest,
  error: unknown,
  session?: { user?: { id?: string; name?: string | null; email?: string | null; role?: string } } | null
): void {
  const endpoint = new URL(request.url).pathname;
  const method = request.method;
  const err = error instanceof Error ? error : new Error(String(error));
  logApiError(endpoint, method, err, 500, {
    endpoint,
    path: endpoint,
    section: endpoint.startsWith('/api/admin') ? 'admin'
      : endpoint.startsWith('/api/client') ? 'client'
      : endpoint.startsWith('/api/dietitian-panel') ? 'dietitian'
      : endpoint.startsWith('/api/health-counselor') ? 'health_counselor'
      : 'internal',
    userId: session?.user?.id,
    userName: session?.user?.name,
    userEmail: session?.user?.email,
    userRole: session?.user?.role,
  }).catch(() => { /* silent */ });
}

/**
 * Generate ETag from data
 * Used for conditional caching on admin APIs
 */
export function generateETag(data: unknown): string {
  const content = JSON.stringify(data);
  const hash = crypto.createHash('md5').update(content).digest('hex');
  return `"${hash}"`;
}

/**
 * Check if client has valid cached version (via If-None-Match header)
 */
export function checkETagMatch(request: Request, currentETag: string): boolean {
  const clientETag = request.headers.get('If-None-Match');
  return clientETag === currentETag;
}

/**
 * Create response with conditional caching headers
 * 
 * ⚠️ ONLY use for admin/internal APIs, NOT user-facing routes
 * 
 * @param data - Response data
 * @param request - Original request (to check If-None-Match)
 * @param options - Cache configuration
 */
export function withConditionalCache<T>(
  data: T,
  request: Request,
  options: {
    maxAge?: number; // seconds
    private?: boolean;
  } = {}
): NextResponse {
  const { maxAge = 60, private: isPrivate = true } = options;

  const etag = generateETag(data);

  // Check if client has valid cached version
  if (checkETagMatch(request, etag)) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        'Cache-Control': `${isPrivate ? 'private' : 'public'}, max-age=${maxAge}`,
      },
    });
  }

  // Return full response with cache headers
  const response = NextResponse.json(data);
  response.headers.set('ETag', etag);
  response.headers.set(
    'Cache-Control',
    `${isPrivate ? 'private' : 'public'}, max-age=${maxAge}, must-revalidate`
  );

  return response;
}

/**
 * Compute data hash for change detection
 * Useful for determining if underlying data has changed
 */
export function computeDataHash(data: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex')
    .substring(0, 16);
}

/**
 * Create Last-Modified header from date
 */
export function formatLastModified(date: Date): string {
  return date.toUTCString();
}

/**
 * Check If-Modified-Since header
 */
export function checkModifiedSince(
  request: Request,
  lastModified: Date
): boolean {
  const ifModifiedSince = request.headers.get('If-Modified-Since');
  if (!ifModifiedSince) return true; // No header = always modified

  const clientDate = new Date(ifModifiedSince);
  return lastModified > clientDate;
}
