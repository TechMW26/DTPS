import { redisDiagnostics, redisOperation } from '@/lib/cache/redis';

jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn() }));
import Redis from 'ioredis';

describe('Redis connection resilience', () => {
  let client: any;
  const previousUrl = process.env.REDIS_URL;
  beforeEach(() => {
    delete (globalThis as any).__dtpsRedis;
    process.env.REDIS_URL = 'rediss://default:test@cache.example.com:6380';
    client = { status: 'wait', on: jest.fn(), connect: jest.fn(async () => { client.status = 'ready'; }), disconnect: jest.fn(() => { client.status = 'end'; }), ping: jest.fn(async () => 'PONG') };
    (Redis as unknown as jest.Mock).mockImplementation(() => client);
  });
  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).__dtpsRedis;
    if (previousUrl) process.env.REDIS_URL = previousUrl; else delete process.env.REDIS_URL;
  });
  it('warms without blocking the first request and reuses one connection', async () => {
    expect(await redisOperation(c => c.ping())).toBeNull();
    expect(await redisOperation(c => c.ping())).toBe('PONG');
    expect(await redisOperation(c => c.ping())).toBe('PONG');
    expect(Redis).toHaveBeenCalledTimes(1);
    expect(client.connect).toHaveBeenCalledTimes(1);
  });
  it('bounds a hanging command and opens a circuit without repeatedly waiting', async () => {
    await redisOperation(c => c.ping());
    client.ping.mockImplementation(() => new Promise(() => {}));
    jest.useFakeTimers();
    const pending = redisOperation(c => c.ping());
    await jest.advanceTimersByTimeAsync(150);
    expect(await pending).toBeNull();
    expect(redisDiagnostics().circuitOpen).toBe(true);
    expect(await redisOperation(c => c.ping())).toBeNull();
    expect(client.ping).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(30_000);
    client.ping.mockResolvedValue('PONG');
    await redisOperation(c => c.ping());
    expect(await redisOperation(c => c.ping())).toBe('PONG');
  });
  it('does not connect over plaintext or without configuration', async () => {
    process.env.REDIS_URL = 'redis://cache.example.com:6379';
    expect(await redisOperation(c => c.ping())).toBeNull();
    delete process.env.REDIS_URL;
    expect(await redisOperation(c => c.ping())).toBeNull();
    expect(Redis).not.toHaveBeenCalled();
  });
});
