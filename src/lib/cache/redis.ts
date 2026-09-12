import Redis from 'ioredis';
import { waitUntil } from '@vercel/functions';

const OPERATION_TIMEOUT_MS = 150;
const RETRY_AFTER_MS = 30_000;
const state = globalThis as typeof globalThis & {
  __dtpsRedis?: { client: Redis; retryAfter: number; failures: number };
};

export function redisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL) && process.env.REDIS_CACHE_ENABLED !== 'false';
}

// Cache outages must not hold up the application or queue commands indefinitely.
export async function redisOperation<T>(operation: (client: Redis) => Promise<T>): Promise<T | null> {
  if (!redisConfigured()) return null;
  if (state.__dtpsRedis && state.__dtpsRedis.retryAfter > Date.now()) return null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!state.__dtpsRedis) {
      const url = new URL(process.env.REDIS_URL!);
      // Redis is an external production service: require encrypted transport.
      if (url.protocol !== 'rediss:') return null;
      const client = new Redis(url.toString(), {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,
        connectTimeout: 1_000,
        commandTimeout: OPERATION_TIMEOUT_MS,
        retryStrategy: () => null,
        enableReadyCheck: true,
        tls: {
          servername: url.hostname, rejectUnauthorized: true,
          ...(process.env.REDIS_CA_PEM ? { ca: process.env.REDIS_CA_PEM.replace(/\\n/g, '\n') } : {}),
        },
      });
      client.on('error', () => { /* Report aggregate failures, never credentials. */ });
      state.__dtpsRedis = { client, retryAfter: 0, failures: 0 };
    }
    const { client } = state.__dtpsRedis;
    if (client.status === 'wait' || client.status === 'end') {
      const warming = client.connect().catch(() => {
        if (state.__dtpsRedis?.client === client) {
          state.__dtpsRedis.failures += 1;
          state.__dtpsRedis.retryAfter = Date.now() + RETRY_AFTER_MS;
        }
      });
      if (process.env.VERCEL) waitUntil(warming);
      return null;
    }
    if (client.status !== 'ready') return null;
    return await Promise.race([
      operation(client),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Redis deadline')), OPERATION_TIMEOUT_MS);
      }),
    ]);
  } catch {
    if (state.__dtpsRedis) {
      state.__dtpsRedis.failures += 1;
      state.__dtpsRedis.retryAfter = Date.now() + RETRY_AFTER_MS;
      state.__dtpsRedis.client.disconnect();
    }
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function redisDiagnostics() {
  return {
    configured: redisConfigured(),
    connected: state.__dtpsRedis?.client.status === 'ready',
    circuitOpen: (state.__dtpsRedis?.retryAfter || 0) > Date.now(),
    failures: state.__dtpsRedis?.failures || 0,
    operationTimeoutMs: OPERATION_TIMEOUT_MS,
  };
}

export function redisNamespace(): string {
  return `dtps:${process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'}:v1`;
}
