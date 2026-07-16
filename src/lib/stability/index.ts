/**
 * Production Stability Module
 * 
 * Enterprise-grade stability utilities for React/Next.js applications.
 * Provides:
 * - API client with retry logic, timeout handling, and proper error classification
 * - Version synchronization between frontend and backend
 * - Session keep-alive mechanism
 * - Cache control utilities
 * - Auto-save/draft system
 * - SSE connection management with rate limiting
 * 
 * @module stability
 */

export { stableApi, StableApiError, type StableApiOptions } from './api-client';
export { versionManager, type VersionInfo } from './version-sync';
export { sessionKeepAlive, type SessionKeepAliveOptions } from './session-keepalive';
export { draftManager, type DraftData } from './draft-manager';
export {
  getCacheControlHeaders,
  getNoCacheHeaders,
  getStaticCacheHeaders,
  createApiResponse,
  createErrorResponse,
  type CacheStrategy
} from './cache-control';

