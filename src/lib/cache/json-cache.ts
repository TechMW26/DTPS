import { createHash } from 'crypto';
import { coalesceRead } from '@/lib/api/coalesce-read';
import { redisConfigured, redisNamespace, redisOperation } from './redis';

const MAX_CACHE_BYTES = 512 * 1024;
const fallbackEntries = new Map<string, { payload: string; expiresAt: number }>();
let fallbackGeneration = 0;
const metrics = { hits: 0, misses: 0, bypasses: 0 };
export const jsonCacheMetrics = () => ({ ...metrics });

/** Opt-in JSON cache. Never pass Mongoose documents or authorization decisions. */
export async function withJsonCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { ttl?: number; tags?: string[]; localFallback?: boolean } = {},
): Promise<T> {
  const tags = [...new Set(options.tags || [])].sort();
  const ttlMs = Math.max(1_000, Math.min(options.ttl || 15_000, 30_000));
  // Opt-in aggregate fallback only. Never retain permissions or transaction state.
  const fallback = () => {
    if (!options.localFallback) return coalesceRead(`json:${key}`, fetcher);
    const generation = fallbackGeneration;
    const fallbackKey = JSON.stringify([key, tags, generation]);
    return coalesceRead(`json:fallback:${fallbackKey}`, async () => {
      const cached = fallbackEntries.get(fallbackKey);
      if (cached && cached.expiresAt > Date.now()) return JSON.parse(cached.payload) as T;
      fallbackEntries.delete(fallbackKey);
      const expiresAt = Date.now() + ttlMs;
      const result = await fetcher();
      const payload = JSON.stringify(result);
      if (generation === fallbackGeneration && expiresAt > Date.now() && payload !== undefined && Buffer.byteLength(payload) <= MAX_CACHE_BYTES) {
        if (fallbackEntries.size >= 128) fallbackEntries.delete(fallbackEntries.keys().next().value!);
        fallbackEntries.set(fallbackKey, { payload, expiresAt });
      }
      return result;
    });
  };
  if (!redisConfigured()) return fallback();
  const namespace = redisNamespace();
  const versions = tags.length
    ? await redisOperation(client => client.mget(...tags.map(tag => `${namespace}:tag:${tag}`)))
    : [];
  if (versions === null) {
    metrics.bypasses += 1;
    return fallback();
  }
  const digest = createHash('sha256').update(JSON.stringify([key, versions])).digest('hex');
  const cacheKey = `${namespace}:json:${digest}`;
  return coalesceRead(cacheKey, async () => {
    const cached = await redisOperation(client => client.get(cacheKey));
    if (cached !== null) {
      try {
        const value = JSON.parse(cached) as T;
        metrics.hits += 1;
        return value;
      } catch { /* Malformed cache entries are treated as misses. */ }
    }
    metrics.misses += 1;
    const result = await fetcher();
    const serialized = JSON.stringify(result);
    if (serialized !== undefined && Buffer.byteLength(serialized) <= MAX_CACHE_BYTES) {
      // Bound staleness even if an out-of-band import bypasses model hooks.
      await redisOperation(client => client.set(cacheKey, serialized, 'PX', ttlMs));
    }
    return result;
  });
}

export async function invalidateJsonCacheTag(tag: string): Promise<void> {
  // Invalidate in-flight local fallbacks too, including during a Redis outage.
  fallbackGeneration += 1;
  fallbackEntries.clear();
  // Versioned keys prevent an in-flight read from repopulating the new version.
  await redisOperation(client => client.incr(`${redisNamespace()}:tag:${tag}`));
}
