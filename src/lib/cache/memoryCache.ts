/**
 * Server-Side Memory Cache
 * 
 * Simple in-memory cache for frequently accessed data.
 * Reduces database load and speeds up API responses.
 * 
 * Features:
 * - TTL (Time To Live) based expiration
 * - Automatic cleanup of expired entries
 * - Size limit to prevent memory overflow
 * - Cache invalidation support
 */

interface CacheEntry<T> {
  data: T;
  expiry: number;
  createdAt: number;
}

interface CacheOptions {
  /** Time to live in seconds (default: 60) */
  ttl?: number;
  /** Cache key prefix for grouping */
  prefix?: string;
}

class MemoryCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private maxSize: number = 5000; // Maximum cache entries (was 1000)
  private cleanupInterval: NodeJS.Timeout | null = null;
  private pendingFetches: Map<string, Promise<unknown>> = new Map(); // Deduplicate concurrent fetches

  constructor() {
    // Run cleanup every 2 minutes (was 60s — reduce overhead)
    if (typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => this.cleanup(), 120000);
    }
  }

  /**
   * Get cached data or execute fetcher if not cached/expired.
   * Deduplicates concurrent fetches for the same key (thundering herd protection).
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const { ttl = 60, prefix = '' } = options;
    const cacheKey = prefix ? `${prefix}:${key}` : key;

    // Check if cached and not expired
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data as T;
    }

    // Deduplicate concurrent fetches for same key
    const pending = this.pendingFetches.get(cacheKey);
    if (pending) {
      return pending as Promise<T>;
    }

    // Fetch fresh data with dedup
    const fetchPromise = fetcher().then((data) => {
      this.set(cacheKey, data, ttl);
      this.pendingFetches.delete(cacheKey);
      return data;
    }).catch((err) => {
      this.pendingFetches.delete(cacheKey);
      throw err;
    });

    this.pendingFetches.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  /**
   * Set a value in cache
   */
  set<T>(key: string, data: T, ttlSeconds: number = 60): void {
    // Enforce size limit - remove oldest entries if needed
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlSeconds * 1000,
      createdAt: Date.now(),
    });
  }

  /**
   * Get a value from cache
   */
  get<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data as T;
    }
    // Remove expired entry
    if (cached) {
      this.cache.delete(key);
    }
    return null;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return true;
    }
    return false;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Delete all keys matching a prefix
   */
  deleteByPrefix(prefix: string): number {
    let deleted = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; maxSize: number; keys: string[] } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry <= now) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Destroy cache and cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }
}

// Global cache instance (singleton — survives hot reloads in dev)
let globalCache: MemoryCache | null = (global as any).__memoryCache || null;

function getCache(): MemoryCache {
  if (!globalCache) {
    globalCache = new MemoryCache();
    (global as any).__memoryCache = globalCache;
  }
  return globalCache;
}

// Export singleton instance
export const serverCache = {
  /**
   * Get cached data or fetch and cache it
   * @example
   * const recipes = await serverCache.getOrSet('all-recipes', () => Recipe.find(), { ttl: 300 });
   */
  getOrSet: <T>(key: string, fetcher: () => Promise<T>, options?: CacheOptions) =>
    getCache().getOrSet(key, fetcher, options),

  /**
   * Set a value in cache
   * @example
   * serverCache.set('user:123', userData, 120);
   */
  set: <T>(key: string, data: T, ttlSeconds?: number) =>
    getCache().set(key, data, ttlSeconds),

  /**
   * Get a value from cache
   * @example
   * const user = serverCache.get<User>('user:123');
   */
  get: <T>(key: string) => getCache().get<T>(key),

  /**
   * Check if key exists
   */
  has: (key: string) => getCache().has(key),

  /**
   * Delete a specific key
   * @example
   * serverCache.delete('user:123');
   */
  delete: (key: string) => getCache().delete(key),

  /**
   * Delete all keys with prefix (useful for invalidating related data)
   * @example
   * serverCache.invalidate('recipes'); // Deletes all keys starting with 'recipes'
   */
  invalidate: (prefix: string) => getCache().deleteByPrefix(prefix),

  /**
   * Clear entire cache
   */
  clear: () => getCache().clear(),

  /**
   * Get cache statistics
   */
  stats: () => getCache().stats(),
};

// Pre-defined cache TTLs (in seconds)
export const CacheTTL = {
  SHORT: 30,      // 30 seconds - for rapidly changing data
  MEDIUM: 120,    // 2 minutes - for moderately changing data
  LONG: 300,      // 5 minutes - for stable data
  VERY_LONG: 600, // 10 minutes - for rarely changing data
  HOUR: 3600,     // 1 hour - for static data
};

// Pre-defined cache prefixes
export const CachePrefix = {
  RECIPES: 'recipes',
  TAGS: 'tags',
  USERS: 'users',
  CLIENTS: 'clients',
  DIETITIANS: 'dietitians',
  HEALTH_COUNSELORS: 'health-counselors',
  SERVICE_PLANS: 'service-plans',
  SUBSCRIPTION_PLANS: 'subscription-plans',
  MEAL_PLANS: 'meal-plans',
  MEAL_TEMPLATES: 'meal-templates',
  APPOINTMENTS: 'appointments',
  MESSAGES: 'messages',
  NOTIFICATIONS: 'notifications',
  DASHBOARD: 'dashboard',
  ANALYTICS: 'analytics',
  BLOGS: 'blogs',
  TRANSFORMATIONS: 'transformations',
};

// Tag-based cache tracking
const tagToKeys: Map<string, Set<string>> = new Map();

/**
 * withCache - Wrapper function for caching async operations
 * 
 * @param key - Unique cache key
 * @param fetcher - Async function that returns the data
 * @param options - Cache options including ttl (in ms) and tags
 * @returns The cached or freshly fetched data
 * 
 * @example
 * const users = await withCache(
 *   'users:all',
 *   async () => User.find({}).lean(),
 *   { ttl: 120000, tags: ['users'] }
 * );
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { ttl?: number; tags?: string[] } = {}
): Promise<T> {
  const { ttl = 60000, tags = [] } = options;
  const ttlSeconds = Math.floor(ttl / 1000); // Convert ms to seconds
  
  // Check if data is already cached
  const cached = serverCache.get<T>(key);
  if (cached !== null) {
    return cached;
  }
  
  // Fetch fresh data
  const data = await fetcher();
  
  // Store in cache
  serverCache.set(key, data, ttlSeconds);
  
  // Track tags for invalidation
  for (const tag of tags) {
    if (!tagToKeys.has(tag)) {
      tagToKeys.set(tag, new Set());
    }
    tagToKeys.get(tag)!.add(key);
  }
  
  return data;
}

/**
 * clearCacheByTag - Clear all cache entries associated with a tag
 * 
 * @param tag - The tag to clear cache for
 * @returns The number of entries cleared
 * 
 * @example
 * // After creating/updating a user
 * clearCacheByTag('users');
 */
export function clearCacheByTag(tag: string): number {
  const keys = tagToKeys.get(tag);
  if (!keys) {
    return 0;
  }
  
  let cleared = 0;
  for (const key of keys) {
    if (serverCache.delete(key)) {
      cleared++;
    }
  }
  
  // Clear the tag tracking
  tagToKeys.delete(tag);
  
  return cleared;
}

export default serverCache;
