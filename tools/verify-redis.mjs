import { config } from 'dotenv';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

config({ path: ['.env.local', '.env'], quiet: true });
if (!process.env.REDIS_URL) throw new Error('Set REDIS_URL before checking the cache.');
const url = new URL(process.env.REDIS_URL);
if (url.protocol !== 'rediss:') throw new Error('Production Redis requires rediss:// (TLS).');
const client = new Redis(url.toString(), {
  lazyConnect: true, enableOfflineQueue: false, retryStrategy: () => null,
  maxRetriesPerRequest: 0, connectTimeout: 5000, commandTimeout: 1000,
  tls: { servername: url.hostname, rejectUnauthorized: true,
    ...(process.env.REDIS_CA_PEM ? { ca: process.env.REDIS_CA_PEM.replace(/\\n/g, '\n') } : {}),
  },
});
client.on('error', () => {});
try {
  await client.connect();
  const key = `dtps:verification:${randomUUID()}`;
  await client.set(key, 'cache-round-trip', 'EX', 60);
  if (await client.get(key) !== 'cache-round-trip') throw new Error('Redis round-trip mismatch');
  const ttl = await client.ttl(key);
  if (ttl <= 0 || ttl > 60) throw new Error('Redis expiration check failed');
  await client.del(key);
  const samples = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    if (await client.ping() !== 'PONG') throw new Error('Redis ping failed');
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  console.log(JSON.stringify({ connected: true, tlsVerified: true, roundTrip: true,
    expiryVerified: true, samples: samples.length,
    pingP50Ms: +samples[9].toFixed(1), pingP95Ms: +samples[18].toFixed(1) }, null, 2));
} catch {
  console.error('Redis verification failed. Check credentials, TLS CA, region, and provider health. Credentials were not logged.');
  process.exitCode = 1;
} finally {
  client.disconnect();
}
